import type { WorkspaceValidationResult } from "@dwkit/domain/types";
import {
  isEnumViolation,
  isForeignKeyViolation,
  isFormatViolation,
  isLengthViolation,
  isPatternViolation,
  isPrimaryKeyViolation,
  isRangeViolation,
  isRequiredFieldViolation,
  isTypeViolation,
} from "@dwkit/domain/types";
import { assert, assertEquals, assertExists, assertRejects } from "@std/assert";
import { Array } from "effect";
import {
  assertPrimaryKeyViolations,
  assertRowNumbers,
  createMultiDatasetWorkspace,
  createSingleDatasetWorkspace,
  createTempDir,
  type RawFieldMapping,
  removeTempDirs,
  TEST_DATA,
  validateWorkspace,
  writeConfig,
  writeCSV,
} from "../../../../test/helpers/workspace-test-utils.ts";

Deno.test.afterAll(async () => {
  await removeTempDirs();
});

Deno.test("WorkspaceValidator - Basic Validation Tests", async (t) => {
  await t.step("validates workspace from config", async () => {
    const tempDir = await createTempDir("validate_workspace_from_config");
    await createMultiDatasetWorkspace(tempDir);

    const result = await validateWorkspace(tempDir);

    assertExists(result);
    assertEquals(result.datasetResults.length, 2);
    assertEquals(result.datasetResults[0].datasetName, "events");
    assertEquals(result.datasetResults[0].rowsProcessed, 2);
    assertEquals(result.datasetResults[1].datasetName, "occurrences");
    assertEquals(result.datasetResults[1].rowsProcessed, 3);
    assertEquals(result.summary.totalDatasets, 2);
    assertEquals(result.summary.totalRowsProcessed, 5);
  });

  await t.step("validates cross-dataset rules", async () => {
    const tempDir = await createTempDir("validate_cross_dataset_rules");
    await createMultiDatasetWorkspace(tempDir);

    const result = await validateWorkspace(tempDir);

    // FK violations are detected by a query-based anti-join across the raw tables
    assertExists(result.datasetResults);
  });
});

Deno.test("WorkspaceValidator - Violation Detection Tests", async (t) => {
  await t.step("detects cross-dataset violations", async () => {
    const tempDir = await createTempDir("detect_cross_dataset_violations");

    await writeCSV(tempDir, "events", TEST_DATA.EVENTS_WITH_ONLY_E1);
    await writeCSV(
      tempDir,
      "occurrences",
      TEST_DATA.OCCURRENCES_WITH_INVALID_EVENT_REF,
    );

    // Write raw config — the validator decodes from YAML
    await writeConfig(tempDir, {
      name: "Test Workspace",
      validation: {
        nullValues: [""],
        datasets: [
          {
            name: "events",
            class: "Event",
            path: "./events.csv",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID" },
            ],
          },
          {
            name: "occurrences",
            class: "Occurrence",
            path: "./occurrences.csv",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID" },
              { originName: "occurrenceID", targetName: "occurrenceID" },
            ],
          },
        ],
      },
      datasetRules: [
        {
          ruleType: "foreignKey",
          sourceDataset: "occurrences",
          sourceField: "eventID",
          targetDataset: "events",
          targetField: "eventID",
        },
      ],
    });

    const result = await validateWorkspace(tempDir);

    // FK violations are detected by the query-based validateForeignKeyRule
    // (a NOT EXISTS anti-join against the parent's raw table).
    const occurrenceResult = result.datasetResults.find((r) => r.datasetName === "occurrences");
    assertExists(occurrenceResult);

    // Should detect FK violation for E2 in field violations
    const fkViolations = occurrenceResult.fieldViolations.errors.filter(
      (v) => v._tag === "ForeignKeyViolation",
    );
    assertEquals(fkViolations.length, 1);

    const violation = fkViolations[0];
    assertEquals(violation.value, "E2");

    // Verify the FK violation references the logical dataset/field (not the raw_ table)
    assertEquals(violation.referencedTable, "events");
    assertEquals(violation.referencedField, "eventID");

    // Rule context is also surfaced in params for downstream consumers
    const params = violation.params as { targetDataset?: string; targetField?: string } | undefined;
    assertEquals(params?.targetDataset, "events");
    assertEquals(params?.targetField, "eventID");
  });

  await t.step(
    "foreignKey rule with unknown target dataset reports a schema violation",
    async () => {
      const tempDir = await createTempDir("fk_unknown_target_dataset");

      await writeCSV(tempDir, "occurrences", TEST_DATA.VALID_OCCURRENCES);

      await writeConfig(tempDir, {
        name: "Test Workspace",
        validation: {
          nullValues: [""],
          datasets: [
            {
              name: "occurrences",
              class: "Occurrence",
              path: "./occurrences.csv",
              fieldMappings: [
                { originName: "eventID", targetName: "eventID" },
                { originName: "occurrenceID", targetName: "occurrenceID" },
              ],
            },
          ],
        },
        datasetRules: [
          {
            ruleType: "foreignKey",
            sourceDataset: "occurrences",
            sourceField: "eventID",
            targetDataset: "does_not_exist",
            targetField: "eventID",
          },
        ],
      });

      // Should NOT throw — the bad target dataset is turned into a clean schema violation.
      const result = await validateWorkspace(tempDir);
      const occurrenceResult = result.datasetResults.find((r) => r.datasetName === "occurrences");
      assertExists(occurrenceResult);

      const ruleErrors = occurrenceResult.schemaViolations.errors.filter(
        (v) => v.errorMessage.includes("unknown target dataset 'does_not_exist'"),
      );
      assertEquals(ruleErrors.length, 1);
    },
  );

  await t.step("handles missing source fields with warning", async () => {
    const tempDir = await createTempDir("detect_missing_required_fields");
    await writeCSV(tempDir, "events", TEST_DATA.EVENTS_MISSING_COUNTRY_CODE);

    await writeConfig(tempDir, {
      name: "Test Workspace",
      validation: {
        nullValues: [""],
        datasets: [
          {
            name: "events",
            class: "Event",
            path: "./events.csv",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID" },
              { originName: "countryCode", targetName: "countryCode" },
              // countryCode is missing from CSV — config-specified fields are implicitly required
            ],
          },
        ],
      },
    });

    const result = await validateWorkspace(tempDir);

    // Validation should fail because countryCode is config-specified but missing from CSV
    assert(result.datasetResults.length > 0, "Expected dataset results");
    const datasetResult = result.datasetResults[0];
    assertEquals(
      datasetResult.status,
      "fail",
      "Expected validation to fail when required source fields are missing",
    );

    // Verify schema error was generated for the missing required field
    const missingFieldError = datasetResult.schemaViolations.errors.find(
      (e) => e.fieldName === "countryCode",
    );
    assertExists(
      missingFieldError,
      "Expected error for missing required 'countryCode' field",
    );
    assert(
      missingFieldError.errorMessage.includes("not found in CSV"),
      "Error message should indicate field not found in CSV",
    );
  });

  await t.step("detects range violations (latitude)", async () => {
    const tempDir = await createTempDir("detect_range_violations");
    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      TEST_DATA.EVENTS_WITH_INVALID_LATITUDE,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "decimalLatitude", targetName: "decimalLatitude" },
        { originName: "decimalLongitude", targetName: "decimalLongitude" },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);
    const rangeErrors = Array.filter(
      result.datasetResults[0].fieldViolations.errors,
      isRangeViolation,
    );
    assertEquals(rangeErrors.length, 2);
    assertEquals(rangeErrors[0].fieldName, "decimalLatitude");
  });

  await t.step("detects vocabulary violations with correct severity", async () => {
    const tempDir = await createTempDir("detect_vocabulary_violations");

    await createSingleDatasetWorkspace(
      tempDir,
      "occurrences",
      TEST_DATA.OCCURRENCES_WITH_INVALID_BASIS,
      [
        { originName: "occurrenceID", targetName: "occurrenceID" },
        { originName: "basisOfRecord", targetName: "basisOfRecord" },
        { originName: "scientificName", targetName: "scientificName" },
      ],
      { class: "Occurrence" },
    );

    const result = await validateWorkspace(tempDir);
    const datasetResult = result.datasetResults[0];

    // Overall status is "fail" because there are schema errors (unmapped required fields)
    assertEquals(result.overallStatus, "fail");

    // basisOfRecord is obis_required: "required" — vocabulary violation is an ERROR
    const enumErrors = Array.filter(datasetResult.fieldViolations.errors, isEnumViolation);
    assertEquals(enumErrors.length, 1);
    assertEquals(enumErrors[0].fieldName, "basisOfRecord");
    assertEquals(enumErrors[0].value, "InvalidBasis");
    assertEquals(enumErrors[0].rowNumber, 2);
    assertEquals(enumErrors[0].severity, "error");
  });

  await t.step("detects duplicate identifiers", async () => {
    const tempDir = await createTempDir("detect_duplicate_identifiers");

    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      TEST_DATA.EVENTS_WITH_DUPLICATE_E1,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);

    assertEquals(result.overallStatus, "fail");
    assertPrimaryKeyViolations(result, 2, "E1", { checkDuplicateCount: 2 });
  });

  await t.step("detects null/empty primary key identifiers", async () => {
    const tempDir = await createTempDir("detect_null_primary_key");

    // A primary key (eventID) implies NOT NULL — an empty value is a violation.
    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      [
        { eventID: "E1", country: "Canada" },
        { eventID: "", country: "USA" },
      ],
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);

    assertEquals(result.overallStatus, "fail");
    const pkViolations = Array.filter(
      result.datasetResults[0].fieldViolations.errors,
      isPrimaryKeyViolation,
    );
    assertEquals(pkViolations.length, 1);
    assertEquals(pkViolations[0].constraintType, "null");
    assertEquals(pkViolations[0].rowNumber, 2);
  });

  await t.step("duplicate foreignKey rules report each orphan only once", async () => {
    const tempDir = await createTempDir("fk_duplicate_rule");
    await writeCSV(tempDir, "events", [{ eventID: "E1" }]);
    await writeCSV(tempDir, "occurrences", [
      { eventID: "E1", occurrenceID: "O1" },
      { eventID: "E2", occurrenceID: "O2" },
    ]);
    const fkRule = {
      ruleType: "foreignKey",
      sourceDataset: "occurrences",
      sourceField: "eventID",
      targetDataset: "events",
      targetField: "eventID",
    };
    await writeConfig(tempDir, {
      name: "Test Workspace",
      validation: {
        nullValues: [""],
        datasets: [
          {
            name: "events",
            class: "Event",
            path: "./events.csv",
            fieldMappings: [{ originName: "eventID", targetName: "eventID" }],
          },
          {
            name: "occurrences",
            class: "Occurrence",
            path: "./occurrences.csv",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID" },
              { originName: "occurrenceID", targetName: "occurrenceID" },
            ],
          },
        ],
      },
      datasetRules: [fkRule, fkRule],
    });

    const result = await validateWorkspace(tempDir);
    const occ = result.datasetResults.find((r) => r.datasetName === "occurrences");
    assertExists(occ);
    const fkViolations = Array.filter(occ.fieldViolations.errors, isForeignKeyViolation);
    assertEquals(fkViolations.length, 1); // E2 reported once, not twice
  });
});

Deno.test("WorkspaceValidator - Row Number Tests", async (t) => {
  await t.step("reports correct row numbers for violations", async () => {
    const tempDir = await createTempDir("detect_row_numbers");

    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      TEST_DATA.EVENTS_WITH_DUPLICATE_E1,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);

    assertRowNumbers(result, [1, 3]);
  });

  await t.step("row numbers are in ascending order", async () => {
    const tempDir = await createTempDir("row_numbers_ascending");

    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      TEST_DATA.EVENTS_WITH_4_DUPLICATES,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);

    assertRowNumbers(result, [1, 3, 5, 7], { checkOrdering: true });
  });

  await t.step("validation is deterministic", async (c) => {
    const tempDir = await createTempDir(c.name);

    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      TEST_DATA.EVENTS_WITH_2_DUPLICATE_VALUES,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { class: "Event" },
    );

    const result1 = await validateWorkspace(tempDir);
    const result2 = await validateWorkspace(tempDir);

    const getRowNumbers = (result: WorkspaceValidationResult) => {
      const pkViolations = Array.filter(
        result.datasetResults[0].fieldViolations.errors,
        isPrimaryKeyViolation,
      );
      return pkViolations.map((v) => v.rowNumber);
    };

    const rowNumbers1 = getRowNumbers(result1);
    const rowNumbers2 = getRowNumbers(result2);

    assertEquals(
      rowNumbers1,
      rowNumbers2,
      "Validation should produce identical results on repeated runs",
    );
  });
});

// =============================================================================
// Validator Tests
// =============================================================================

Deno.test("WorkspaceValidator - Format Validation Tests", async (t) => {
  await t.step("detects ISO 8601 date format violations", async () => {
    const tempDir = await createTempDir("format_iso8601");

    // Use explicit format constraint so violations are errors
    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      [
        { eventID: "E1", eventDate: "2022-09-15", decimalLatitude: 49.5, decimalLongitude: -123.5 },
        {
          eventID: "E2",
          eventDate: "not-a-date",
          decimalLatitude: 50.0,
          decimalLongitude: -124.0,
        },
        {
          eventID: "E3",
          eventDate: "2022-09-15/2022-09-16",
          decimalLatitude: 51.0,
          decimalLongitude: -125.0,
        },
        { eventID: "E4", eventDate: "2022", decimalLatitude: 52.0, decimalLongitude: -126.0 },
      ],
      [
        { originName: "eventID", targetName: "eventID" },
        {
          originName: "eventDate",
          targetName: "eventDate",
          constraints: [{ type: "format", format: "iso8601" }],
        },
        { originName: "decimalLatitude", targetName: "decimalLatitude" },
        { originName: "decimalLongitude", targetName: "decimalLongitude" },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);
    const datasetResult = result.datasetResults[0];

    // Combine errors and warnings for format violations
    const allFormatViolations = [
      ...Array.filter(datasetResult.fieldViolations.errors, isFormatViolation),
      ...Array.filter(datasetResult.fieldViolations.warnings, isFormatViolation),
      ...Array.filter(datasetResult.fieldViolations.info, isFormatViolation),
    ];

    // "not-a-date" should be caught, but valid dates and date ranges should pass
    const eventDateViolations = allFormatViolations.filter(
      (v) => v.fieldName === "eventDate",
    );

    assert(
      eventDateViolations.length >= 1,
      `Expected at least 1 format violation for eventDate, got ${eventDateViolations.length}`,
    );

    // Verify "not-a-date" is flagged
    const notADateViolation = eventDateViolations.find((v) => v.value === "not-a-date");
    assertExists(notADateViolation, "Expected violation for 'not-a-date'");
  });

  await t.step("detects URL format violations", async () => {
    const tempDir = await createTempDir("format_url");

    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      [
        { eventID: "E1", eventDate: "2022-01-01", references: "https://example.com/data" },
        { eventID: "E2", eventDate: "2022-01-01", references: "not-a-url" },
        { eventID: "E3", eventDate: "2022-01-01", references: "http://valid.org/path" },
      ],
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "eventDate", targetName: "eventDate" },
        {
          originName: "references",
          targetName: "references",
          constraints: [{ type: "format", format: "url" }],
        },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);
    const datasetResult = result.datasetResults[0];

    // Config's format constraint is additive (tightening): `references` already has a
    // format constraint from spec, and config adds another. Both fire on "not-a-url",
    // producing 2 violations (both at ERROR severity since value violations are always errors).
    const formatViolations = [
      ...Array.filter(datasetResult.fieldViolations.errors, isFormatViolation),
      ...Array.filter(datasetResult.fieldViolations.warnings, isFormatViolation),
      ...Array.filter(datasetResult.fieldViolations.info, isFormatViolation),
    ];

    const urlViolations = formatViolations.filter((v) => v.fieldName === "references");
    assertEquals(
      urlViolations.length,
      2,
      "Expected 2 URL format violations (spec optional + config required)",
    );
    for (const v of urlViolations) {
      assertEquals(v.value, "not-a-url");
    }
  });
});

Deno.test("WorkspaceValidator - Pattern Validation Tests", async (t) => {
  await t.step("detects pattern violations", async () => {
    const tempDir = await createTempDir("pattern_validation");

    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      [
        { eventID: "E1", eventDate: "2022-01-01", countryCode: "CA" },
        { eventID: "E2", eventDate: "2022-01-01", countryCode: "USA" },
        { eventID: "E3", eventDate: "2022-01-01", countryCode: "GB" },
      ],
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "eventDate", targetName: "eventDate" },
        {
          originName: "countryCode",
          targetName: "countryCode",
          constraints: [
            { type: "pattern", pattern: "^[A-Z]{2}$" },
          ],
        },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);
    const datasetResult = result.datasetResults[0];

    const patternViolations = Array.filter(
      datasetResult.fieldViolations.errors,
      isPatternViolation,
    );

    // "USA" should fail the 2-letter country code pattern
    assertEquals(patternViolations.length, 1, "Expected 1 pattern violation");
    assertEquals(patternViolations[0].value, "USA");
    assertEquals(patternViolations[0].fieldName, "countryCode");
  });
});

Deno.test("WorkspaceValidator - Length Validation Tests", async (t) => {
  await t.step("detects string length violations", async () => {
    const tempDir = await createTempDir("length_validation");

    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      [
        { eventID: "E1", eventDate: "2022-01-01", locality: "Vancouver" },
        { eventID: "E2", eventDate: "2022-01-01", locality: "X" },
        { eventID: "E3", eventDate: "2022-01-01", locality: "A normal location name" },
      ],
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "eventDate", targetName: "eventDate" },
        {
          originName: "locality",
          targetName: "locality",
          constraints: [
            { type: "length", minLength: 3, maxLength: 100 },
          ],
        },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);
    const datasetResult = result.datasetResults[0];

    const lengthViolations = Array.filter(
      datasetResult.fieldViolations.errors,
      isLengthViolation,
    );

    // "X" (length 1) should fail minLength 3
    assertEquals(lengthViolations.length, 1, "Expected 1 length violation");
    assertEquals(lengthViolations[0].value, "X");
  });
});

Deno.test("WorkspaceValidator - Required Field Validation Tests", async (t) => {
  await t.step("detects required field empty/null violations", async () => {
    const tempDir = await createTempDir("required_validation");

    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      [
        { eventID: "E1", eventDate: "2022-01-01", country: "Canada" },
        { eventID: "E2", eventDate: "2022-01-01", country: "" },
        { eventID: "E3", eventDate: "2022-01-01", country: "USA" },
      ],
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "eventDate", targetName: "eventDate" },
        {
          originName: "country",
          targetName: "country",
          constraints: [
            {
              type: "required",
              allowEmpty: false,
              allowWhitespace: false,
              requirement: "required",
            },
          ],
        },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);
    const datasetResult = result.datasetResults[0];

    // Config's required constraint is additive-only; `country` may already have a required
    // constraint from spec with a different requirement level.
    const requiredViolations = [
      ...Array.filter(datasetResult.fieldViolations.errors, isRequiredFieldViolation),
      ...Array.filter(datasetResult.fieldViolations.warnings, isRequiredFieldViolation),
    ];

    // Empty string for country should be caught
    assert(
      requiredViolations.length >= 1,
      `Expected at least 1 required field violation, got ${requiredViolations.length}`,
    );
  });

  await t.step("config constraints tighten spec — narrower range catches violations", async () => {
    // Config narrows decimalLatitude range from spec's -90..90 to 49.0..49.9.
    // With additive (tightening) semantics, both constraints are checked:
    // data must satisfy spec AND config ranges. 50.0 passes spec but fails config.
    const tempDir = await createTempDir("constraint_additive_only");

    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      [
        { eventID: "E1", eventDate: "2022-01-01", decimalLatitude: 49.5, decimalLongitude: -123.5 },
        {
          eventID: "E2",
          eventDate: "2022-01-01",
          decimalLatitude: 50.0,
          decimalLongitude: -124.0,
        },
      ],
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "eventDate", targetName: "eventDate" },
        {
          originName: "decimalLatitude",
          targetName: "decimalLatitude",
          constraints: [
            // Tighten the spec's range for this dataset
            { type: "range", min: 49.0, max: 49.9, inclusive: true },
          ],
        },
        { originName: "decimalLongitude", targetName: "decimalLongitude" },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);
    const datasetResult = result.datasetResults[0];

    // 50.0 passes spec's -90..90 but fails config's 49.0..49.9 — expect 1 violation.
    const rangeViolations = [
      ...Array.filter(datasetResult.fieldViolations.errors, isRangeViolation),
      ...Array.filter(datasetResult.fieldViolations.warnings, isRangeViolation),
    ];
    const latViolations = rangeViolations.filter((v) => v.fieldName === "decimalLatitude");
    assertEquals(
      latViolations.length,
      1,
      "Config tightens spec range — 50.0 outside 49.0..49.9",
    );
  });
});

Deno.test("WorkspaceValidator - Constraint Erasure Prevention", async (t) => {
  await t.step(
    "schema constraints preserved when config fieldMapping has no constraints",
    async () => {
      const tempDir = await createTempDir("constraint_erasure_prevention");

      // decimalLatitude 95.0 is out of the OBIS profile range (-90 to 90)
      // Config fieldMapping for decimalLatitude has NO constraints — should NOT erase
      // the profile's range constraint
      await createSingleDatasetWorkspace(
        tempDir,
        "events",
        [
          {
            eventID: "E1",
            eventDate: "2022-01-01",
            decimalLatitude: 49.5,
            decimalLongitude: -123.5,
            geodeticDatum: "WGS84",
          },
          {
            eventID: "E2",
            eventDate: "2022-01-01",
            decimalLatitude: 95.0,
            decimalLongitude: -124.0,
            geodeticDatum: "WGS84",
          },
        ],
        [
          { originName: "eventID", targetName: "eventID" },
          { originName: "eventDate", targetName: "eventDate" },
          // No constraints — should NOT erase OBIS range constraint
          { originName: "decimalLatitude", targetName: "decimalLatitude" },
          { originName: "decimalLongitude", targetName: "decimalLongitude" },
          { originName: "geodeticDatum", targetName: "geodeticDatum" },
        ],
        { class: "Event" },
      );

      const result = await validateWorkspace(tempDir);
      const datasetResult = result.datasetResults[0];

      // Profile range constraint (-90 to 90) should still fire for 95.0
      const rangeViolations = [
        ...Array.filter(datasetResult.fieldViolations.errors, isRangeViolation),
        ...Array.filter(datasetResult.fieldViolations.warnings, isRangeViolation),
      ];
      const latViolations = rangeViolations.filter((v) => v.fieldName === "decimalLatitude");

      assert(
        latViolations.length >= 1,
        `Expected range violation for decimalLatitude=95.0, got ${latViolations.length}. ` +
          "Config fieldMapping without constraints should not erase profile constraints.",
      );
    },
  );
});

Deno.test("WorkspaceValidator - Invalid Preset Detection", async (t) => {
  await t.step("invalid preset name produces schema error with suggestion", async () => {
    const tempDir = await createTempDir("invalid_preset");

    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      [
        { eventID: "E1", eventDate: "2022-01-01", decimalLatitude: 49.5, decimalLongitude: -123.5 },
      ],
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "eventDate", targetName: "eventDate" },
        {
          originName: "decimalLatitude",
          targetName: "decimalLatitude",
          preset: "latidude", // typo: should be "latitude"
        } as RawFieldMapping,
        { originName: "decimalLongitude", targetName: "decimalLongitude" },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);
    const datasetResult = result.datasetResults[0];

    // Should produce a schema error for the invalid preset
    const presetErrors = datasetResult.schemaViolations.errors.filter(
      (v) => v.errorMessage.includes("Unknown preset"),
    );
    assertEquals(presetErrors.length, 1, "Expected 1 schema error for invalid preset");
    assert(
      presetErrors[0].errorMessage.includes("latidude"),
      "Error should mention the invalid preset name",
    );
    assert(
      presetErrors[0].errorMessage.includes("latitude"),
      "Error should suggest the correct preset name",
    );
  });
});

Deno.test("WorkspaceValidator - Obligation-Based Requirement", async (t) => {
  await t.step("missing required field from OBIS obligation produces schema error", async () => {
    const tempDir = await createTempDir("obligation_requirement");

    // eventDate has obis_required: "required" in the Event schema
    // Map eventID but not eventDate — should produce an error for missing required field
    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      [
        { eventID: "E1", country: "Canada" },
        { eventID: "E2", country: "USA" },
      ],
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);
    const datasetResult = result.datasetResults[0];

    // eventDate is required by OBIS — should appear as a schema error
    const missingRequired = datasetResult.schemaViolations.errors.filter(
      (v) => v.fieldName === "eventDate",
    );
    assert(
      missingRequired.length >= 1,
      `Expected schema error for missing required field 'eventDate', got ${missingRequired.length}`,
    );
  });
});

Deno.test("WorkspaceValidator - Preset Tests", async (t) => {
  await t.step("YAML preset: latitude applies range and format constraints", async () => {
    const tempDir = await createTempDir("preset_latitude");

    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      [
        { eventID: "E1", eventDate: "2022-01-01", decimalLatitude: 49.5, decimalLongitude: -123.5 },
        {
          eventID: "E2",
          eventDate: "2022-01-01",
          decimalLatitude: 95.0,
          decimalLongitude: -124.0,
        },
      ],
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "eventDate", targetName: "eventDate" },
        {
          originName: "decimalLatitude",
          targetName: "decimalLatitude",
          preset: "latitude",
        } as RawFieldMapping,
        { originName: "decimalLongitude", targetName: "decimalLongitude" },
      ],
      { class: "Event" },
    );

    const result = await validateWorkspace(tempDir);
    const datasetResult = result.datasetResults[0];

    // The latitude preset should produce a range violation for 95.0
    const rangeViolations = Array.filter(
      datasetResult.fieldViolations.errors,
      isRangeViolation,
    );
    const latViolations = rangeViolations.filter((v) => v.fieldName === "decimalLatitude");
    assert(
      latViolations.length >= 1,
      `Expected at least 1 range violation from latitude preset, got ${latViolations.length}`,
    );
  });
});

Deno.test("inferred FK catches an orphan without an explicit rule", async () => {
  const tempDir = await createTempDir("infer_fk_orphan");
  await writeCSV(tempDir, "events", TEST_DATA.EVENTS_WITH_ONLY_E1);
  await writeCSV(tempDir, "occurrences", TEST_DATA.OCCURRENCES_WITH_INVALID_EVENT_REF);

  await writeConfig(tempDir, {
    name: "Test Workspace",
    validation: {
      nullValues: [""],
      datasets: [
        {
          name: "events",
          class: "Event",
          path: "./events.csv",
          fieldMappings: [{ originName: "eventID", targetName: "eventID" }],
        },
        {
          name: "occurrences",
          class: "Occurrence",
          path: "./occurrences.csv",
          fieldMappings: [
            { originName: "eventID", targetName: "eventID" },
            { originName: "occurrenceID", targetName: "occurrenceID" },
          ],
        },
      ],
    },
    // no datasetRules — inference supplies occurrences.eventID -> events.eventID
  });

  const result = await validateWorkspace(tempDir);
  const occ = result.datasetResults.find((r) => r.datasetName === "occurrences");
  assertExists(occ);
  const fk = occ.fieldViolations.errors.filter((v) => v._tag === "ForeignKeyViolation");
  assertEquals(fk.length, 1);
  assertEquals(fk[0].value, "E2");
});

Deno.test("inferred FK follows field mappings, not raw CSV headers", async () => {
  const tempDir = await createTempDir("infer_fk_mapped_column");
  await writeCSV(tempDir, "events", TEST_DATA.EVENTS_WITH_ONLY_E1);
  // The reference column is not named `eventID` in the source CSV; it is mapped
  // to the Darwin Core `eventID` target. Inference must key on the mapped name,
  // otherwise the orphan `E2` slips through unvalidated.
  await writeCSV(tempDir, "occurrences", [
    { event_ref: "E1", occurrenceID: "O1", basisOfRecord: "HumanObservation" },
    { event_ref: "E2", occurrenceID: "O2", basisOfRecord: "HumanObservation" },
  ]);

  await writeConfig(tempDir, {
    name: "Test Workspace",
    validation: {
      nullValues: [""],
      datasets: [
        {
          name: "events",
          class: "Event",
          path: "./events.csv",
          fieldMappings: [{ originName: "eventID", targetName: "eventID" }],
        },
        {
          name: "occurrences",
          class: "Occurrence",
          path: "./occurrences.csv",
          fieldMappings: [
            { originName: "event_ref", targetName: "eventID" },
            { originName: "occurrenceID", targetName: "occurrenceID" },
          ],
        },
      ],
    },
  });

  const result = await validateWorkspace(tempDir);
  const occ = result.datasetResults.find((r) => r.datasetName === "occurrences");
  assertExists(occ);
  const fk = occ.fieldViolations.errors.filter((v) => v._tag === "ForeignKeyViolation");
  assertEquals(fk.length, 1);
  assertEquals(fk[0].value, "E2");
});

Deno.test("two Event datasets + an occurrence eventID is a hard error", async () => {
  const tempDir = await createTempDir("infer_fk_ambiguous");
  await writeCSV(tempDir, "events_a", TEST_DATA.EVENTS_WITH_ONLY_E1);
  await writeCSV(tempDir, "events_b", TEST_DATA.EVENTS_WITH_ONLY_E1);
  await writeCSV(tempDir, "occurrences", TEST_DATA.VALID_OCCURRENCES);

  await writeConfig(tempDir, {
    name: "Test Workspace",
    validation: {
      nullValues: [""],
      datasets: [
        {
          name: "events_a",
          class: "Event",
          path: "./events_a.csv",
          fieldMappings: [{ originName: "eventID", targetName: "eventID" }],
        },
        {
          name: "events_b",
          class: "Event",
          path: "./events_b.csv",
          fieldMappings: [{ originName: "eventID", targetName: "eventID" }],
        },
        {
          name: "occurrences",
          class: "Occurrence",
          path: "./occurrences.csv",
          fieldMappings: [
            { originName: "eventID", targetName: "eventID" },
            { originName: "occurrenceID", targetName: "occurrenceID" },
          ],
        },
      ],
    },
  });

  await assertRejects(
    () => validateWorkspace(tempDir),
    Error,
    "Ambiguous Darwin Core relation",
  );
});

Deno.test("WorkspaceValidator - Required from Resolved Constraints", async (t) => {
  await t.step(
    "obligation-required mapped field with an empty value produces a required violation",
    async () => {
      const tempDir = await createTempDir("not_null_obligation");

      // eventDate is OBIS-required. Map it but provide empty values.
      // With resolved constraints, the empty eventDate row is flagged by the
      // query-based required validator (RequiredFieldViolation).
      await createSingleDatasetWorkspace(
        tempDir,
        "events",
        [
          { eventID: "E1", eventDate: "2022-01-01" },
          { eventID: "E2", eventDate: "" }, // empty → NULL after nullValues processing
        ],
        [
          { originName: "eventID", targetName: "eventID" },
          { originName: "eventDate", targetName: "eventDate" },
        ],
        { class: "Event" },
      );

      const result = await validateWorkspace(tempDir);
      const datasetResult = result.datasetResults[0];

      // eventDate is OBIS required — should produce a violation for the empty row
      assertEquals(datasetResult.status, "fail");
      const allErrors = [
        ...datasetResult.fieldViolations.errors,
        ...datasetResult.schemaViolations.errors,
      ];
      const eventDateErrors = allErrors.filter((v) => v.fieldName === "eventDate");
      assert(
        eventDateErrors.length >= 1,
        `Expected at least 1 error for required empty eventDate, got ${eventDateErrors.length}`,
      );
    },
  );
});

Deno.test("WorkspaceValidator - Numeric type validity", async (t) => {
  const intMappings = [
    { originName: "occurrenceID", targetName: "occurrenceID" },
    { originName: "individualCount", targetName: "individualCount" },
  ];

  await t.step("large integer (>INT32) is NOT flagged, decimal IS flagged", async () => {
    const dir = await createTempDir("numeric_int");
    await createSingleDatasetWorkspace(
      dir,
      "occ",
      [
        { occurrenceID: "O1", individualCount: "5" },
        { occurrenceID: "O2", individualCount: "1.5" },
        { occurrenceID: "O3", individualCount: "3000000000" },
      ],
      intMappings,
      { class: "Occurrence" },
    );

    const result = await validateWorkspace(dir);
    const d = result.datasetResults[0];
    const numeric = [
      ...d.fieldViolations.errors,
      ...d.fieldViolations.warnings,
      ...d.fieldViolations.info,
    ]
      .filter((v) => v.fieldName === "individualCount");
    assertEquals(numeric.length, 1);
    assertEquals(numeric[0]._tag, "TypeViolation");
    assertEquals(numeric[0].value, "1.5");
    assertEquals(numeric[0].rowNumber, 2);
  });

  await t.step(
    "bad value in an OPTIONAL numeric field is info-severity, not a hard error",
    async () => {
      const dir = await createTempDir("numeric_optional_sev");
      // minimumElevationInMeters is an optional decimal field in Darwin Core.
      await createSingleDatasetWorkspace(dir, "occ", [
        { occurrenceID: "O1", minimumElevationInMeters: "abc" },
      ], [
        { originName: "occurrenceID", targetName: "occurrenceID" },
        { originName: "minimumElevationInMeters", targetName: "minimumElevationInMeters" },
      ], { class: "Occurrence" });

      const result = await validateWorkspace(dir);
      const d = result.datasetResults[0];
      const typeErrors = Array.filter(d.fieldViolations.errors, isTypeViolation);
      const typeInfo = Array.filter(d.fieldViolations.info, isTypeViolation);
      assertEquals(typeErrors.length, 0); // not escalated to error
      assertEquals(typeInfo.length, 1);
      assertEquals(typeInfo[0].severity, "info");
    },
  );
});
