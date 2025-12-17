/**
 * Tests for WorkspaceValidator
 */

import { ErrorCode, isEnumViolation, isPrimaryKeyViolation, isRangeViolation } from "@dwkt/domain";
import { assert, assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { Array as EffectArray } from "effect";
import * as Effect from "effect/Effect";
import type { WorkspaceValidationResult } from "../../../domain/src/types/workspace-validation.ts";
import { WorkspaceValidationError, WorkspaceValidator } from "./workspace-validator.ts";

// Helper types for workspace creation
interface WorkspaceOptions {
  eventCsv?: string;
  occurrenceCsv?: string;
  datasets?: Array<{
    name: string;
    spec: string;
    path: string;
    profile?: string;
    fieldMappings: Array<{
      originName: string;
      targetName: string;
      isRequired?: boolean;
    }>;
  }>;
  crossDatasetRules?: Array<{
    ruleType: string;
    sourceDataset: string;
    sourceField: string;
    targetDataset: string;
    targetField: string;
    description?: string;
  }>;
  validation?: {
    nullValues?: string[];
    failFast?: boolean;
    outputDir?: string;
  };
}

async function createMultiDatasetWorkspace(
  tempDir: string,
  options?: WorkspaceOptions,
) {
  // Default event CSV
  const eventCsv = options?.eventCsv ??
    `eventID,country,countryCode,decimalLatitude,decimalLongitude
E1,Canada,CA,49.5,-123.5
E2,Canada,CA,50.0,-124.0`;

  await Deno.writeTextFile(join(tempDir, "events.csv"), eventCsv);

  // Default occurrence CSV
  const occurrenceCsv = options?.occurrenceCsv ?? `eventID,occurrenceID,basisOfRecord,scientificName
E1,O1,HumanObservation,Ursus arctos
E1,O2,HumanObservation,Canis lupus
E2,O3,HumanObservation,Ursus arctos`;

  await Deno.writeTextFile(join(tempDir, "occurrences.csv"), occurrenceCsv);

  // Default datasets
  const datasets = options?.datasets ?? [
    {
      name: "events",
      spec: "dwc-event",
      path: "./events.csv",
      fieldMappings: [
        { originName: "eventID", targetName: "eventID", isRequired: true },
        { originName: "country", targetName: "country", isRequired: true },
        { originName: "countryCode", targetName: "countryCode", isRequired: true },
        { originName: "decimalLatitude", targetName: "decimalLatitude" },
        { originName: "decimalLongitude", targetName: "decimalLongitude" },
      ],
    },
    {
      name: "occurrences",
      spec: "dwc-occurrence",
      path: "./occurrences.csv",
      fieldMappings: [
        { originName: "eventID", targetName: "eventID", isRequired: true },
        { originName: "occurrenceID", targetName: "occurrenceID", isRequired: true },
        { originName: "basisOfRecord", targetName: "basisOfRecord", isRequired: true },
        { originName: "scientificName", targetName: "scientificName", isRequired: true },
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

  // Default validation settings
  const validation = options?.validation ?? {
    nullValues: ["", "NA"],
    failFast: false,
    outputDir: "./output",
  };

  // Create config
  const config = {
    id: "test-workspace",
    name: "Test Workspace",
    version: "1.0.0",
    validation,
    datasets,
    crossDatasetRules,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await Deno.writeTextFile(
    join(tempDir, "darwinkit.json"),
    JSON.stringify(config, null, 2),
  );
}

async function createSingleDatasetWorkspace(
  tempDir: string,
  datasetName: string,
  csvContent: string,
  fieldMappings: Array<{ originName: string; targetName: string }>,
  options?: { profile?: string; spec?: string },
): Promise<void> {
  await Deno.writeTextFile(join(tempDir, `${datasetName}.csv`), csvContent);

  const config = {
    id: "test-workspace",
    name: "Test Workspace",
    version: "1.0.0",
    validation: {
      nullValues: [""],
      failFast: false,
      outputDir: "./output",
    },
    datasets: [
      {
        name: datasetName,
        spec: options?.spec ?? `dwc-${datasetName}`,
        path: `./${datasetName}.csv`,
        ...(options?.profile && { profile: options.profile }),
        fieldMappings,
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await Deno.writeTextFile(
    join(tempDir, "darwinkit.json"),
    JSON.stringify(config, null, 2),
  );
}

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
  const pkViolations = EffectArray.filter(
    datasetResult.violations.errors,
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
  const pkViolations = EffectArray.filter(
    result.datasetResults[0].violations.errors,
    isPrimaryKeyViolation,
  );
  const rowNumbers = pkViolations.map(({ rowNumber }) => rowNumber);

  if (options?.checkOrdering) {
    const sorted = [...rowNumbers].sort((a, b) => a - b);
    assertEquals(rowNumbers, sorted, "Row numbers should be in ascending order");
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
  const enumViolations = EffectArray.filter(
    datasetResult.violations.errors,
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
  const rangeErrors = result.datasetResults[0].violations.errors.filter(isRangeViolation);
  assertEquals(rangeErrors.length, expectedCount);
  assertEquals(rangeErrors[0].fieldName, fieldName);
}

let tempDir: string;

Deno.test.beforeEach(async () => {
  tempDir = await Deno.makeTempDir({ prefix: "workspace_test_" });
});

Deno.test.afterEach(async () => {
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("WorkspaceValidator - Basic Validation Tests", async (t) => {
  await t.step("validates workspace from config", async () => {
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
    // Create event CSV with only E1
    const eventCsv = `eventID,country,countryCode
E1,Canada,CA`;

    await Deno.writeTextFile(join(tempDir, "events.csv"), eventCsv);

    // Create occurrence CSV with reference to non-existent E2
    const occurrenceCsv = `eventID,occurrenceID,basisOfRecord,scientificName
E1,O1,HumanObservation,Ursus arctos
E2,O2,HumanObservation,Canis lupus`;

    await Deno.writeTextFile(join(tempDir, "occurrences.csv"), occurrenceCsv);

    // Create minimal config
    const config = {
      id: "test-workspace",
      name: "Test Workspace",
      version: "1.0.0",
      validation: {
        nullValues: [""],
        failFast: false,
        outputDir: "./output",
      },
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
      crossDatasetRules: [
        {
          ruleType: "foreignKey",
          sourceDataset: "occurrences",
          sourceField: "eventID",
          targetDataset: "events",
          targetField: "eventID",
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await Deno.writeTextFile(
      join(tempDir, "darwinkit.json"),
      JSON.stringify(config, null, 2),
    );

    const result = await validateWorkspace(tempDir);

    // Should detect violation for E2
    assertEquals(result.crossDatasetResults.length, 1);
    assertEquals(result.crossDatasetResults[0].violations.length, 1);
    assertEquals(result.crossDatasetResults[0].violations[0].sourceValue, "E2");
  });

  await t.step("detects missing required fields", async () => {
    // Create CSV missing required field
    const eventCsv = `eventID,country
E1,Canada`;

    await Deno.writeTextFile(join(tempDir, "events.csv"), eventCsv);

    const config = {
      id: "test-workspace",
      name: "Test Workspace",
      version: "1.0.0",
      validation: {
        nullValues: [""],
        failFast: false,
        outputDir: "./output",
      },
      datasets: [
        {
          name: "events",
          spec: "dwc-event",
          path: "./events.csv",
          profile: "Event",
          fieldMappings: [
            { originName: "eventID", targetName: "eventID", isRequired: true },
            { originName: "countryCode", targetName: "countryCode", isRequired: true }, // Missing!
          ],
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await Deno.writeTextFile(
      join(tempDir, "darwinkit.json"),
      JSON.stringify(config, null, 2),
    );

    const validator = new WorkspaceValidator();

    // NOTE: This test has a config that maps to a field ('countryCode') that doesn't
    // exist in the CSV. The validation currently fails early with an INVALID_CONFIG error
    // before validation can run. This is expected behavior.
    // TODO: Consider making this a warning instead of an error (see line 641 in workspace-validator.ts)
    const error = await Effect.runPromise(
      Effect.flip(validator.validateFromConfig(tempDir)),
    );

    // Verify we get an invalid config error about missing field
    assert(
      error instanceof WorkspaceValidationError,
      "Expected WorkspaceValidationError",
    );
    assertEquals(error.code, ErrorCode.INVALID_CONFIG);
    assertStringIncludes(
      error.message,
      "does not contain the mapped fields",
      `Expected missing field error, got: ${error.message}`,
    );
    assertStringIncludes(
      error.message,
      "countryCode",
      `Expected error to mention missing field 'countryCode', got: ${error.message}`,
    );
  });

  await t.step("detects range violations (latitude)", async () => {
    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      `eventID,decimalLatitude,decimalLongitude
E1,49.5,-123.5
E2,95.0,-124.0
E3,-95.0,-125.0`,
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
    await createSingleDatasetWorkspace(
      tempDir,
      "occurrences",
      `occurrenceID,basisOfRecord,scientificName
O1,HumanObservation,Ursus arctos
O2,InvalidBasis,Canis lupus
O3,PreservedSpecimen,Panthera tigris`,
      [
        { originName: "occurrenceID", targetName: "occurrenceID" },
        { originName: "basisOfRecord", targetName: "basisOfRecord" },
        { originName: "scientificName", targetName: "scientificName" },
      ],
      { profile: "Occurrence", spec: "dwc-occurrence" },
    );

    const result = await validateWorkspace(tempDir);

    assertEquals(result.overallStatus, "fail");
    assertEnumViolations(result, "basisOfRecord", "InvalidBasis", 2);
  });

  await t.step("detects duplicate identifiers", async () => {
    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      `eventID,country
E1,Canada
E2,USA
E1,Mexico`,
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
    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      `eventID,country
E1,Canada
E2,USA
E1,Mexico
E3,France`,
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
    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      `eventID,country
DUP,Country1
E2,Country2
DUP,Country3
E4,Country4
DUP,Country5
E6,Country6
DUP,Country7`,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { profile: "Event", spec: "dwc-event" },
    );

    const result = await validateWorkspace(tempDir);

    assertRowNumbers(result, [1, 3, 5, 7], { checkOrdering: true });
  });

  await t.step("validation is deterministic", async () => {
    await createSingleDatasetWorkspace(
      tempDir,
      "events",
      `eventID,country
E1,Canada
E2,USA
E1,Mexico
E3,France
E2,Germany`,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { profile: "Event", spec: "dwc-event" },
    );

    const result1 = await validateWorkspace(tempDir);
    const result2 = await validateWorkspace(tempDir);

    const getRowNumbers = (result: WorkspaceValidationResult) => {
      const pkViolations = EffectArray.filter(
        result.datasetResults[0].violations.errors,
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
