import type {
  DatasetConfig,
  ValidationOnlyConfig,
  ValidationSettings,
  WorkspaceConfig,
  WorkspaceCrossDatasetRule,
  WorkspaceFieldMapping,
  WorkspaceValidationResult,
} from "@dwkt/domain";
import {
  ErrorCode,
  type ForeignKeyViolation,
  isEnumViolation,
  isPrimaryKeyViolation,
  isRangeViolation,
} from "@dwkt/domain";
import { assert, assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { Array } from "effect";
import * as Effect from "effect/Effect";
import { Workspace } from "./workspace.ts";
import { WorkspaceValidationError } from "./validation/utils.ts";
import { writeCsvFile } from "./testing/mod.ts";

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

// ============================================================================
// Temp Directory Management
// ============================================================================

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
  await Promise.all(tempDirs.map((dir) => Deno.remove(dir, { recursive: true })));
}

// ============================================================================
// Config Writing Helper
// ============================================================================

async function writeConfig(tempDir: string, config: WorkspaceConfig) {
  return await Deno.writeTextFile(
    join(tempDir, "darwinkit.json"),
    JSON.stringify(config, null, 2),
  );
}

// Create a multi-dataset workspace with events and occurrences
async function createMultiDatasetWorkspace(
  tempDir: string,
  options?: TestWorkspaceOptions,
) {
  // Default event data
  const eventData = options?.eventData ?? TEST_DATA.VALID_EVENTS;
  await writeCsvFile(tempDir, "events", eventData);

  // Default occurrence data
  const occurrenceData = options?.occurrenceData ?? TEST_DATA.VALID_OCCURRENCES;
  await writeCsvFile(tempDir, "occurrences", occurrenceData);

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
  const validation: ValidationSettings = options?.validation ?? {
    nullValues: ["", "NA"],
    failFast: false,
    outputDir: "./output",
    datasets,
  };

  // Create config
  const config: ValidationOnlyConfig = {
    id: "test-workspace",
    name: "Test Workspace",
    version: "1.0.0",
    validation,
    crossDatasetRules,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

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
  await writeCsvFile(tempDir, datasetName, data);

  const config: WorkspaceConfig = {
    id: "test-workspace",
    name: "Test Workspace",
    version: "1.0.0",
    validation: {
      nullValues: [""],
      failFast: false,
      outputDir: "./output",
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
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await writeConfig(tempDir, config);
}

// Validate the workspace in the temp directory
async function validateWorkspace(tempDir: string): Promise<WorkspaceValidationResult> {
  const workspace = await Effect.runPromise(Workspace.discover(tempDir));
  try {
    return await Effect.runPromise(workspace.validate());
  } finally {
    workspace.close();
  }
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
    datasetResult.fieldViolations.errors,
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

Deno.test("Workspace Validation - Basic Validation Tests", async (t) => {
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

Deno.test("Workspace Validation - Violation Detection Tests", async (t) => {
  await t.step("detects cross-dataset violations", async () => {
    const tempDir = await createTempDir("detect_cross_dataset_violations");

    await writeCsvFile(tempDir, "events", TEST_DATA.EVENTS_WITH_ONLY_E1);
    await writeCsvFile(tempDir, "occurrences", TEST_DATA.OCCURRENCES_WITH_INVALID_EVENT_REF);

    // Create minimal config
    const config: WorkspaceConfig = {
      id: "test-workspace",
      name: "Test Workspace",
      version: "1.0.0",
      validation: {
        nullValues: [""],
        failFast: false,
        outputDir: "./output",
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
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await writeConfig(tempDir, config);

    const result = await validateWorkspace(tempDir);

    // FK constraints now correctly detect violations during INSERT
    // This is a behavior change - previously FK constraints weren't being created due to
    // a bug in table name resolution, so violations would only be caught by cross-dataset validation.
    // Now FK constraints work correctly and catch violations early during INSERT.

    // Verify that occurrences dataset exists in results
    const occurrencesResult = result.datasetResults.find((r) => r.datasetName === "occurrences");
    assertExists(occurrencesResult);

    // Should have FK violation errors for E2 (references non-existent event)
    const fkViolations = occurrencesResult.fieldViolations.errors.filter(
      (v): v is ForeignKeyViolation => v._tag === "ForeignKeyViolation",
    );

    assertEquals(fkViolations.length, 1, "Should detect 1 FK violation");
    assertEquals(fkViolations[0].value, "E2", "Should be for eventID E2");
    assertEquals(fkViolations[0].referencedTable, "event", "Should reference event table");

    // Cross-dataset validation should find 0 violations (FK caught it earlier)
    assertEquals(result.crossDatasetResults.length, 1);
    assertEquals(result.crossDatasetResults[0].violations.length, 0);
  });

  await t.step("records foreign key violations as errors", async () => {
    const tempDir = await createTempDir("fk_violations_recorded");

    // Create events with E1 only
    await writeCsvFile(tempDir, "events", [
      { eventID: "E1", eventDate: "2024-01-01" },
    ]);

    // Create occurrences with E1 and E2 (E2 is invalid FK)
    await writeCsvFile(tempDir, "occurrence", [
      { occurrenceID: "O1", eventID: "E1" },
      { occurrenceID: "O2", eventID: "E2" },
    ]);

    const config: WorkspaceConfig = {
      id: "test-workspace",
      name: "Test FK Recording",
      version: "1.0.0",
      validation: {
        nullValues: [""],
        failFast: false,
        outputDir: "./output",
        datasets: [
          {
            name: "events",
            spec: "dwc-event",
            path: "./events.csv",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID" },
              { originName: "eventDate", targetName: "eventDate" },
            ],
          },
          {
            name: "occurrence",
            spec: "dwc-occurrence",
            path: "./occurrence.csv",
            fieldMappings: [
              { originName: "occurrenceID", targetName: "occurrenceID" },
              { originName: "eventID", targetName: "eventID" },
            ],
          },
        ],
      },
      crossDatasetRules: [
        {
          ruleType: "foreignKey",
          sourceDataset: "occurrence",
          sourceField: "eventID",
          targetDataset: "events",
          targetField: "eventID",
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await writeConfig(tempDir, config);
    const result = await validateWorkspace(tempDir);

    // Find occurrence dataset results
    const occurrenceResult = result.datasetResults.find((r) => r.datasetName === "occurrence");
    assertExists(occurrenceResult, "Should have occurrence results");

    // Should have exactly 1 FK violation error
    const fkViolations = occurrenceResult.fieldViolations.errors.filter(
      (v): v is ForeignKeyViolation => v._tag === "ForeignKeyViolation",
    );

    assertEquals(fkViolations.length, 1, "Should record 1 FK violation");
    assertEquals(fkViolations[0].value, "E2", "Violation should be for E2");
    assertEquals(fkViolations[0].fieldName, "eventID", "Violation should be for eventID field");
    assertEquals(fkViolations[0].referencedTable, "event", "Should reference event table");

    // Overall status should be fail due to FK violation
    assertEquals(result.overallStatus, "fail", "Validation should fail due to FK violation");
  });

  await t.step("detects missing required fields", async () => {
    const tempDir = await createTempDir("detect_missing_required_fields");
    await writeCsvFile(tempDir, "events", TEST_DATA.EVENTS_MISSING_COUNTRY_CODE);

    const config: WorkspaceConfig = {
      id: "test-workspace",
      name: "Test Workspace",
      version: "1.0.0",
      validation: {
        nullValues: [""],
        failFast: false,
        outputDir: "./output",
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
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await writeConfig(tempDir, config);

    // NOTE: This test has a config that maps to a field ('countryCode') that doesn't
    // exist in the CSV. The validation currently fails early with an INVALID_CONFIG error
    // before validation can run. This is expected behavior.
    // TODO: Consider making this a warning instead of an error
    const workspace = await Effect.runPromise(Workspace.discover(tempDir));
    const error = await Effect.runPromise(
      Effect.flip(workspace.validate()).pipe(
        Effect.ensuring(Effect.sync(() => workspace.close())),
      ),
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

Deno.test("Workspace Validation - Row Number Tests", async (t) => {
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
