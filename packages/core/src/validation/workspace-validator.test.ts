import {
  type DatasetConfig,
  makeWorkspaceConfig,
  type ValidationSettingsInput,
  type WorkspaceConfig,
  type WorkspaceCrossDatasetRule,
  type WorkspaceFieldMapping,
} from "@dwkt/domain/schemas";
import {
  isEnumViolation,
  isFormatViolation,
  isLengthViolation,
  isPatternViolation,
  isPrimaryKeyViolation,
  isRangeViolation,
  isRequiredFieldViolation,
} from "@dwkt/domain/types";
import { assert, assertEquals, assertExists } from "@std/assert";
import { stringify as stringifyCSV } from "@std/csv";
import { join } from "@std/path";
import { stringify as stringifyYAML } from "@std/yaml";
import { Array } from "effect";
import * as Effect from "effect/Effect";
import type { WorkspaceValidationResult } from "@dwkt/domain/types";
import { WorkspaceValidator } from "./workspace-validator.ts";

// Helper type for workspace creation
type TestWorkspaceOptions = {
  eventData?: Array<Record<string, unknown>>;
  occurrenceData?: Array<Record<string, unknown>>;
  datasets?: DatasetConfig[];
  crossDatasetRules?: WorkspaceCrossDatasetRule[];
  validation?: ValidationSettingsInput;
};

// Test data as structured objects (easier to read and modify than CSV strings)
const TEST_DATA = {
  // Valid data for multi-dataset scenarios
  VALID_EVENTS: [
    {
      eventID: "E1",
      country: "Canada",
      countryCode: "CA",
      decimalLatitude: 49.5,
      decimalLongitude: -123.5,
    },
    {
      eventID: "E2",
      country: "Canada",
      countryCode: "CA",
      decimalLatitude: 50.0,
      decimalLongitude: -124.0,
    },
  ],

  VALID_OCCURRENCES: [
    {
      eventID: "E1",
      occurrenceID: "O1",
      basisOfRecord: "HumanObservation",
      scientificName: "Ursus arctos",
    },
    {
      eventID: "E1",
      occurrenceID: "O2",
      basisOfRecord: "HumanObservation",
      scientificName: "Canis lupus",
    },
    {
      eventID: "E2",
      occurrenceID: "O3",
      basisOfRecord: "HumanObservation",
      scientificName: "Ursus arctos",
    },
  ],

  // Cross-dataset violation scenarios
  EVENTS_WITH_ONLY_E1: [
    { eventID: "E1", country: "Canada", countryCode: "CA" },
  ],

  OCCURRENCES_WITH_INVALID_EVENT_REF: [
    {
      eventID: "E1",
      occurrenceID: "O1",
      basisOfRecord: "HumanObservation",
      scientificName: "Ursus arctos",
    },
    {
      eventID: "E2",
      occurrenceID: "O2",
      basisOfRecord: "HumanObservation",
      scientificName: "Canis lupus",
    },
  ],

  // Missing field scenarios
  EVENTS_MISSING_COUNTRY_CODE: [
    {
      eventID: "E1",
      country: "Canada",
      eventDate: "2000-01-01",
      decimalLatitude: 49.5,
      decimalLongitude: -123.5,
    },
  ],

  // Range violation scenarios
  EVENTS_WITH_INVALID_LATITUDE: [
    { eventID: "E1", eventDate: "2000-01-01", decimalLatitude: 49.5, decimalLongitude: -123.5 },
    { eventID: "E2", eventDate: "2000-01-01", decimalLatitude: 95.0, decimalLongitude: -124.0 },
    { eventID: "E3", eventDate: "2000-01-01", decimalLatitude: -95.0, decimalLongitude: -125.0 },
  ],

  // Vocabulary violation scenarios
  OCCURRENCES_WITH_INVALID_BASIS: [
    {
      occurrenceID: "O1",
      basisOfRecord: "HumanObservation",
      scientificName: "Ursus arctos",
    },
    {
      occurrenceID: "O2",
      basisOfRecord: "InvalidBasis",
      scientificName: "Canis lupus",
    },
    {
      occurrenceID: "O3",
      basisOfRecord: "PreservedSpecimen",
      scientificName: "Panthera tigris",
    },
  ],

  // Duplicate identifier scenarios
  EVENTS_WITH_DUPLICATE_E1: [
    { eventID: "E1", country: "Canada" },
    { eventID: "E2", country: "USA" },
    { eventID: "E1", country: "Mexico" },
  ],

  EVENTS_WITH_DUPLICATE_E2: [
    { eventID: "E1", country: "Canada" },
    { eventID: "E2", country: "USA" },
    { eventID: "E1", country: "Mexico" },
    { eventID: "E2", country: "France" },
    { eventID: "E3", country: "Steve's house" },
  ],

  EVENTS_WITH_4_DUPLICATES: [
    { eventID: "DUP", country: "Country1" },
    { eventID: "E2", country: "Country2" },
    { eventID: "DUP", country: "Country3" },
    { eventID: "E4", country: "Country4" },
    { eventID: "DUP", country: "Country5" },
    { eventID: "E6", country: "Country6" },
    { eventID: "DUP", country: "Country7" },
  ],

  EVENTS_WITH_2_DUPLICATE_VALUES: [
    { eventID: "E1", country: "Canada" },
    { eventID: "E2", country: "USA" },
    { eventID: "E1", country: "Mexico" },
    { eventID: "E3", country: "France" },
    { eventID: "E2", country: "Germany" },
    { eventID: "E4", country: "Spain" },
  ],
};

// Convert structured test data to CSV format
function toCSV<T extends Record<string, unknown>>(data: T[]): string {
  if (data.length === 0) return "";
  const columns = Object.keys(data[0]);
  return stringifyCSV(data, { columns });
}

const tempDirs: string[] = [];

async function createTempDir(prefix: string) {
  if (prefix.length === 0) {
    throw new Error("Prefix cannot be empty");
  }

  const dir = await Deno.makeTempDir({ prefix });
  tempDirs.push(dir);

  return dir;
}

async function removeTempDirs() {
  await Promise.all(
    tempDirs.map((dir) => Deno.remove(dir, { recursive: true })),
  );
}

// Write a workspace configuration file to the temp directory
async function writeConfig(tempDir: string, config: WorkspaceConfig) {
  // Convert dates to ISO strings for YAML serialization
  const configForYaml = {
    ...config,
    createdAt: config.createdAt instanceof Date ? config.createdAt.toISOString() : config.createdAt,
    updatedAt: config.updatedAt instanceof Date ? config.updatedAt.toISOString() : config.updatedAt,
  };
  return await Deno.writeTextFile(
    join(tempDir, "darwinkit.yaml"),
    stringifyYAML(configForYaml),
  );
}

// Write a CSV file to the temp directory from structured data
async function writeCSV(
  tempDir: string,
  fileName: string,
  data: Array<Record<string, unknown>>,
) {
  return await Deno.writeTextFile(
    join(tempDir, `${fileName}.csv`),
    toCSV(data),
  );
}

// Create a multi-dataset workspace with events and occurrences
async function createMultiDatasetWorkspace(
  tempDir: string,
  options?: TestWorkspaceOptions,
) {
  // Default event data
  const eventData = options?.eventData ?? TEST_DATA.VALID_EVENTS;
  await writeCSV(tempDir, "events", eventData);

  // Default occurrence data
  const occurrenceData = options?.occurrenceData ?? TEST_DATA.VALID_OCCURRENCES;
  await writeCSV(tempDir, "occurrences", occurrenceData);

  // Default datasets
  const datasets = options?.datasets ?? [
    {
      name: "events",
      spec: "dwc-event",
      path: "./events.csv",
      fieldMappings: [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
        { originName: "countryCode", targetName: "countryCode" },
        { originName: "decimalLatitude", targetName: "decimalLatitude" },
        { originName: "decimalLongitude", targetName: "decimalLongitude" },
      ],
    },
    {
      name: "occurrences",
      spec: "dwc-occurrence",
      path: "./occurrences.csv",
      fieldMappings: [
        { originName: "eventID", targetName: "eventID" },
        { originName: "occurrenceID", targetName: "occurrenceID" },
        { originName: "basisOfRecord", targetName: "basisOfRecord" },
        { originName: "scientificName", targetName: "scientificName" },
      ],
    },
  ];

  // Default cross-dataset rules
  const crossDatasetRules = options?.crossDatasetRules ?? [
    {
      ruleType: "foreignKey",
      sourceDataset: "occurrences",
      sourceField: "eventID",
      targetDataset: "events",
      targetField: "eventID",
      description: "Occurrences must reference existing events",
    },
  ];

  // Create config with defaults
  const config = makeWorkspaceConfig({
    name: "Test Workspace",
    validation: options?.validation ?? {
      nullValues: ["", "NA"],
      datasets,
    },
    crossDatasetRules,
  });

  await writeConfig(tempDir, config);
}

// Create a workspace with a single dataset for testing
async function createSingleDatasetWorkspace(
  tempDir: string,
  datasetName: string,
  data: Array<Record<string, unknown>>,
  fieldMappings: WorkspaceFieldMapping[],
  options?: { profile?: string; spec?: string },
): Promise<void> {
  await writeCSV(tempDir, datasetName, data);

  const config = makeWorkspaceConfig({
    name: "Test Workspace",
    validation: {
      nullValues: [""],
      datasets: [
        {
          name: datasetName,
          spec: options?.spec ?? `dwc-${datasetName}`,
          path: `./${datasetName}.csv`,
          ...(options?.profile && { profile: options.profile }),
          fieldMappings,
        },
      ],
    },
  });

  await writeConfig(tempDir, config);
}

// Validate the workspace in the temp directory
async function validateWorkspace(
  tempDir: string,
): Promise<WorkspaceValidationResult> {
  const validator = new WorkspaceValidator();
  return await Effect.runPromise(
    validator.validateFromConfig(tempDir),
  );
}

// Assertion helpers using Effect's Array.filter for type-safe narrowing
function assertPrimaryKeyViolations(
  result: WorkspaceValidationResult,
  expectedCount: number,
  expectedValue: string,
  options?: { checkDuplicateCount?: number },
): void {
  const datasetResult = result.datasetResults[0];
  const pkViolations = Array.filter(
    datasetResult.fieldViolations.errors,
    isPrimaryKeyViolation,
  );

  assertEquals(pkViolations.length, expectedCount);
  assertEquals(pkViolations[0].value, expectedValue);

  if (options?.checkDuplicateCount) {
    assertEquals(pkViolations[0].duplicateCount, options.checkDuplicateCount);
  }
}

function assertRowNumbers(
  result: WorkspaceValidationResult,
  expectedRows: number[],
  options?: { checkOrdering?: boolean },
): void {
  const pkViolations = Array.filter(
    result.datasetResults[0].fieldViolations.errors,
    isPrimaryKeyViolation,
  );
  const rowNumbers = pkViolations.map(({ rowNumber }) => rowNumber);

  if (options?.checkOrdering) {
    const sorted = [...rowNumbers].sort((a, b) => a - b);
    assertEquals(
      rowNumbers,
      sorted,
      "Row numbers should be in ascending order",
    );
  }

  assertEquals([...rowNumbers].sort((a, b) => a - b), expectedRows);
}

function assertEnumViolations(
  result: WorkspaceValidationResult,
  fieldName: string,
  expectedValue: string,
  expectedRowNumber: number,
): void {
  const datasetResult = result.datasetResults[0];
  // Vocabulary violations default to warnings (recommended strictness)
  const enumViolations = Array.filter(
    datasetResult.fieldViolations.warnings,
    isEnumViolation,
  );

  assertEquals(enumViolations.length, 1);
  assertEquals(enumViolations[0].fieldName, fieldName);
  assertEquals(enumViolations[0].value, expectedValue);
  assertEquals(enumViolations[0].rowNumber, expectedRowNumber);
}

function assertRangeViolations(
  result: WorkspaceValidationResult,
  expectedCount: number,
  fieldName: string,
): void {
  const rangeErrors = Array.filter(
    result.datasetResults[0].fieldViolations.errors,
    isRangeViolation,
  );
  assertEquals(rangeErrors.length, expectedCount);
  assertEquals(rangeErrors[0].fieldName, fieldName);
}

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

    // Should have cross-dataset results
    assertExists(result.crossDatasetResults);
    assertEquals(result.crossDatasetResults.length, 1);

    // All eventIDs in occurrences exist in events, so no violations
    assertEquals(result.crossDatasetResults[0].violations.length, 0);
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

    // Create minimal config
    const config = makeWorkspaceConfig({
      name: "Test Workspace",
      validation: {
        nullValues: [""],
        datasets: [
          {
            name: "events",
            spec: "dwc-event",
            path: "./events.csv",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID" },
            ],
          },
          {
            name: "occurrences",
            spec: "dwc-occurrence",
            path: "./occurrences.csv",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID" },
              { originName: "occurrenceID", targetName: "occurrenceID" },
            ],
          },
        ],
      },
      crossDatasetRules: [
        {
          ruleType: "foreignKey",
          sourceDataset: "occurrences",
          sourceField: "eventID",
          targetDataset: "events",
          targetField: "eventID",
        },
      ],
    });

    await writeConfig(tempDir, config);

    const result = await validateWorkspace(tempDir);

    // FK violation is caught during insert via DuckDB FK constraint (not cross-dataset validation)
    // This is more efficient as violations are caught earlier
    const occurrenceResult = result.datasetResults.find((r) => r.datasetName === "occurrences");
    assertExists(occurrenceResult);

    // Should detect FK violation for E2 in field violations
    const fkViolations = occurrenceResult.fieldViolations.errors.filter(
      (v) => v.validatorType === "foreign-key",
    );
    assertEquals(fkViolations.length, 1);

    const violation = fkViolations[0];
    assertEquals(violation.value, "E2");

    // Verify FK violation includes rule context in params
    const params = violation.params as { targetDataset?: string; targetField?: string } | undefined;
    assertEquals(params?.targetDataset, "events");
    assertEquals(params?.targetField, "eventID");

    // Cross-dataset validation finds nothing (row was rejected at insert)
    assertEquals(result.crossDatasetResults.length, 1);
    assertEquals(result.crossDatasetResults[0].violations.length, 0);
  });

  await t.step("handles missing source fields with warning", async () => {
    const tempDir = await createTempDir("detect_missing_required_fields");
    await writeCSV(tempDir, "events", TEST_DATA.EVENTS_MISSING_COUNTRY_CODE);

    const config = makeWorkspaceConfig({
      name: "Test Workspace",
      validation: {
        nullValues: [""],
        datasets: [
          {
            name: "events",
            spec: "dwc-event",
            path: "./events.csv",
            profile: "Event",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID" },
              { originName: "countryCode", targetName: "countryCode" },
              // countryCode is missing from CSV — config-specified fields are implicitly required
            ],
          },
        ],
      },
    });

    await writeConfig(tempDir, config);

    const validator = new WorkspaceValidator();

    // Validation should complete with warnings - missing mapped fields are skipped, not treated as a hard error
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

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
      { profile: "Event", spec: "dwc-event" },
    );

    const result = await validateWorkspace(tempDir);

    assertRangeViolations(result, 2, "decimalLatitude");
  });

  await t.step("detects vocabulary violations", async () => {
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
      { profile: "Occurrence", spec: "dwc-occurrence" },
    );

    const result = await validateWorkspace(tempDir);

    // Overall status is "fail" because there are schema errors (unmapped required
    // fields). The vocabulary violation itself is a warning (recommended strictness).
    assertEquals(result.overallStatus, "fail");
    assertEnumViolations(result, "basisOfRecord", "InvalidBasis", 2);
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
      { profile: "Event", spec: "dwc-event" },
    );

    const result = await validateWorkspace(tempDir);

    assertEquals(result.overallStatus, "fail");
    assertPrimaryKeyViolations(result, 2, "E1", { checkDuplicateCount: 2 });
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
      { profile: "Event", spec: "dwc-event" },
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
      { profile: "Event", spec: "dwc-event" },
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
      { profile: "Event", spec: "dwc-event" },
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
// Stage 3: New Validator Tests
// =============================================================================

Deno.test("WorkspaceValidator - Format Validation Tests", async (t) => {
  await t.step("detects ISO 8601 date format violations", async () => {
    const tempDir = await createTempDir("format_iso8601");

    // Use explicit format constraint with "required" enforcement so violations are errors
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
      { profile: "Event", spec: "dwc-event" },
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
      { profile: "Event", spec: "dwc-event" },
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
      { profile: "Event", spec: "dwc-event" },
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
      { profile: "Event", spec: "dwc-event" },
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
              enforcement: "required",
            },
          ],
        },
      ],
      { profile: "Event", spec: "dwc-event" },
    );

    const result = await validateWorkspace(tempDir);
    const datasetResult = result.datasetResults[0];

    // Config's required constraint is additive-only; `country` may already have a required
    // constraint from spec with a different enforcement level.
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
      { profile: "Event", spec: "dwc-event" },
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
        { profile: "obis-event", spec: "dwc-event" },
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
        } as WorkspaceFieldMapping,
        { originName: "decimalLongitude", targetName: "decimalLongitude" },
      ],
      { profile: "Event", spec: "dwc-event" },
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
      { profile: "obis-event", spec: "dwc-event" },
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
        } as WorkspaceFieldMapping,
        { originName: "decimalLongitude", targetName: "decimalLongitude" },
      ],
      { profile: "Event", spec: "dwc-event" },
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
