import {
  type DatasetConfig,
  ErrorCode,
  isEnumViolation,
  isPrimaryKeyViolation,
  isRangeViolation,
  type ValidationSettings,
  type WorkspaceConfig,
  type WorkspaceCrossDatasetRule,
  type WorkspaceFieldMapping,
} from "@dwkt/domain";
import { assert, assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { stringify } from "@std/csv";
import { join } from "@std/path";
import { Array } from "effect";
import * as Effect from "effect/Effect";
import type { WorkspaceValidationResult } from "../../../domain/src/types/workspace-validation.ts";
import { WorkspaceValidationError, WorkspaceValidator } from "./workspace-validator.ts";

// Convert structured test data to CSV format
function toCSV<T extends Record<string, unknown>>(data: T[]): string {
  if (data.length === 0) return "";
  const columns = Object.keys(data[0]);
  return stringify(data, { columns });
}

// Helper type for workspace creation
type TestWorkspaceOptions = {
  eventData?: Array<Record<string, unknown>>;
  occurrenceData?: Array<Record<string, unknown>>;
  datasets?: DatasetConfig[];
  crossDatasetRules?: WorkspaceCrossDatasetRule[];
  validation?: ValidationSettings;
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
    { eventID: "E1", country: "Canada" },
  ],

  // Range violation scenarios
  EVENTS_WITH_INVALID_LATITUDE: [
    { eventID: "E1", decimalLatitude: 49.5, decimalLongitude: -123.5 },
    { eventID: "E2", decimalLatitude: 95.0, decimalLongitude: -124.0 },
    { eventID: "E3", decimalLatitude: -95.0, decimalLongitude: -125.0 },
  ],

  // Vocabulary violation scenarios
  OCCURRENCES_WITH_INVALID_BASIS: [
    { occurrenceID: "O1", basisOfRecord: "HumanObservation", scientificName: "Ursus arctos" },
    { occurrenceID: "O2", basisOfRecord: "InvalidBasis", scientificName: "Canis lupus" },
    { occurrenceID: "O3", basisOfRecord: "PreservedSpecimen", scientificName: "Panthera tigris" },
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

// Write a workspace configuration file to the temp directory
async function writeConfig(config: WorkspaceConfig) {
  return await Deno.writeTextFile(
    join(tempDir, "darwinkit.json"),
    JSON.stringify(config, null, 2),
  );
}

// Write a CSV file to the temp directory from structured data
async function writeCSV(fileName: string, data: Array<Record<string, unknown>>) {
  return await Deno.writeTextFile(join(tempDir, `${fileName}.csv`), toCSV(data));
}

// Create a multi-dataset workspace with events and occurrences
async function createMultiDatasetWorkspace(
  options?: TestWorkspaceOptions,
) {
  // Default event data
  const eventData = options?.eventData ?? TEST_DATA.VALID_EVENTS;
  await writeCSV("events", eventData);

  // Default occurrence data
  const occurrenceData = options?.occurrenceData ?? TEST_DATA.VALID_OCCURRENCES;
  await writeCSV("occurrences", occurrenceData);

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
  const config: WorkspaceConfig = {
    id: "test-workspace",
    name: "Test Workspace",
    version: "1.0.0",
    validation,
    datasets,
    crossDatasetRules,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await writeConfig(config);
}

// Create a workspace with a single dataset for testing
async function createSingleDatasetWorkspace(
  datasetName: string,
  data: Array<Record<string, unknown>>,
  fieldMappings: WorkspaceFieldMapping[],
  options?: { profile?: string; spec?: string },
): Promise<void> {
  await writeCSV(datasetName, data);

  const config: WorkspaceConfig = {
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await writeConfig(config);
}

// Validate the workspace in the temp directory
async function validateWorkspace(): Promise<WorkspaceValidationResult> {
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
  const pkViolations = Array.filter(
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
  const enumViolations = Array.filter(
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
  const rangeErrors = Array.filter(
    result.datasetResults[0].violations.errors,
    isRangeViolation,
  );
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
    await createMultiDatasetWorkspace();

    const result = await validateWorkspace();

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
    await createMultiDatasetWorkspace();

    const result = await validateWorkspace();

    // Should have cross-dataset results
    assertExists(result.crossDatasetResults);
    assertEquals(result.crossDatasetResults.length, 1);

    // All eventIDs in occurrences exist in events, so no violations
    assertEquals(result.crossDatasetResults[0].violations.length, 0);
  });
});

Deno.test("WorkspaceValidator - Violation Detection Tests", async (t) => {
  await t.step("detects cross-dataset violations", async () => {
    await writeCSV("events", TEST_DATA.EVENTS_WITH_ONLY_E1);
    await writeCSV("occurrences", TEST_DATA.OCCURRENCES_WITH_INVALID_EVENT_REF);

    // Create minimal config
    const config: WorkspaceConfig = {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await writeConfig(config);

    const result = await validateWorkspace();

    // Should detect violation for E2
    assertEquals(result.crossDatasetResults.length, 1);
    assertEquals(result.crossDatasetResults[0].violations.length, 1);
    assertEquals(result.crossDatasetResults[0].violations[0].sourceValue, "E2");
  });

  await t.step("detects missing required fields", async () => {
    await writeCSV("events", TEST_DATA.EVENTS_MISSING_COUNTRY_CODE);

    const config: WorkspaceConfig = {
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await writeConfig(config);

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
      "events",
      TEST_DATA.EVENTS_WITH_INVALID_LATITUDE,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "decimalLatitude", targetName: "decimalLatitude" },
        { originName: "decimalLongitude", targetName: "decimalLongitude" },
      ],
      { profile: "Event", spec: "dwc-event" },
    );

    const result = await validateWorkspace();

    assertRangeViolations(result, 2, "decimalLatitude");
  });

  await t.step("detects vocabulary violations", async () => {
    await createSingleDatasetWorkspace(
      "occurrences",
      TEST_DATA.OCCURRENCES_WITH_INVALID_BASIS,
      [
        { originName: "occurrenceID", targetName: "occurrenceID" },
        { originName: "basisOfRecord", targetName: "basisOfRecord" },
        { originName: "scientificName", targetName: "scientificName" },
      ],
      { profile: "Occurrence", spec: "dwc-occurrence" },
    );

    const result = await validateWorkspace();

    assertEquals(result.overallStatus, "fail");
    assertEnumViolations(result, "basisOfRecord", "InvalidBasis", 2);
  });

  await t.step("detects duplicate identifiers", async () => {
    await createSingleDatasetWorkspace(
      "events",
      TEST_DATA.EVENTS_WITH_DUPLICATE_E1,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { profile: "Event", spec: "dwc-event" },
    );

    const result = await validateWorkspace();

    assertEquals(result.overallStatus, "fail");
    assertPrimaryKeyViolations(result, 2, "E1", { checkDuplicateCount: 2 });
  });
});

Deno.test("WorkspaceValidator - Row Number Tests", async (t) => {
  await t.step("reports correct row numbers for violations", async () => {
    await createSingleDatasetWorkspace(
      "events",
      TEST_DATA.EVENTS_WITH_DUPLICATE_E2,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { profile: "Event", spec: "dwc-event" },
    );

    const result = await validateWorkspace();

    assertRowNumbers(result, [1, 2, 3, 4]);
  });

  await t.step("row numbers are in ascending order", async () => {
    await createSingleDatasetWorkspace(
      "events",
      TEST_DATA.EVENTS_WITH_4_DUPLICATES,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { profile: "Event", spec: "dwc-event" },
    );

    const result = await validateWorkspace();

    assertRowNumbers(result, [1, 3, 5, 7], { checkOrdering: true });
  });

  await t.step("validation is deterministic", async () => {
    await createSingleDatasetWorkspace(
      "events",
      TEST_DATA.EVENTS_WITH_2_DUPLICATE_VALUES,
      [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
      ],
      { profile: "Event", spec: "dwc-event" },
    );

    const result1 = await validateWorkspace();
    const result2 = await validateWorkspace();

    const getRowNumbers = (result: WorkspaceValidationResult) => {
      const pkViolations = Array.filter(
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
