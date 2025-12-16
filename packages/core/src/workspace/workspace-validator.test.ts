/**
 * Tests for WorkspaceValidator
 */

import { ErrorCode, isRangeViolation } from "@dwkt/domain";
import { assert, assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import { WorkspaceValidationError, WorkspaceValidator } from "./workspace-validator.ts";

async function createTestWorkspace(tempDir: string) {
  // Create event CSV
  const eventCsv = `eventID,country,countryCode,decimalLatitude,decimalLongitude
E1,Canada,CA,49.5,-123.5
E2,Canada,CA,50.0,-124.0`;

  await Deno.writeTextFile(join(tempDir, "events.csv"), eventCsv);

  // Create occurrence CSV
  const occurrenceCsv = `eventID,occurrenceID,basisOfRecord,scientificName
E1,O1,HumanObservation,Ursus arctos
E1,O2,HumanObservation,Canis lupus
E2,O3,HumanObservation,Ursus arctos`;

  await Deno.writeTextFile(join(tempDir, "occurrences.csv"), occurrenceCsv);

  // Create config
  const config = {
    id: "test-workspace",
    name: "Test Workspace",
    version: "1.0.0",
    validation: {
      nullValues: ["", "NA"],
      failFast: false,
      outputDir: "./output",
    },
    datasets: [
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
    ],
    crossDatasetRules: [
      {
        ruleType: "foreignKey",
        sourceDataset: "occurrences",
        sourceField: "eventID",
        targetDataset: "events",
        targetField: "eventID",
        description: "Occurrences must reference existing events",
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

Deno.test("WorkspaceValidator - validates workspace from config", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "workspace_test_" });

  try {
    await createTestWorkspace(tempDir);

    const validator = new WorkspaceValidator();
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    assertExists(result);
    assertEquals(result.datasetResults.length, 2);
    assertEquals(result.datasetResults[0].datasetName, "events");
    assertEquals(result.datasetResults[0].rowsProcessed, 2);
    assertEquals(result.datasetResults[1].datasetName, "occurrences");
    assertEquals(result.datasetResults[1].rowsProcessed, 3);
    assertEquals(result.summary.totalDatasets, 2);
    assertEquals(result.summary.totalRowsProcessed, 5);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceValidator - validates cross-dataset rules", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "workspace_test_" });

  try {
    await createTestWorkspace(tempDir);

    const validator = new WorkspaceValidator();
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    // Should have cross-dataset results
    assertExists(result.crossDatasetResults);
    assertEquals(result.crossDatasetResults.length, 1);

    // All eventIDs in occurrences exist in events, so no violations
    assertEquals(result.crossDatasetResults[0].violations.length, 0);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceValidator - detects cross-dataset violations", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "workspace_test_" });

  try {
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

    const validator = new WorkspaceValidator();
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    // Should detect violation for E2
    assertEquals(result.crossDatasetResults.length, 1);
    assertEquals(result.crossDatasetResults[0].violations.length, 1);
    assertEquals(result.crossDatasetResults[0].violations[0].sourceValue, "E2");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceValidator - detects missing required fields", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "workspace_test_" });

  try {
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
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceValidator - detects range violations (latitude)", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "workspace_test_" });

  try {
    // Create CSV with invalid latitude values
    const eventCsv = `eventID,decimalLatitude,decimalLongitude
E1,49.5,-123.5
E2,95.0,-124.0
E3,-95.0,-125.0`;

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
            { originName: "eventID", targetName: "eventID" },
            { originName: "decimalLatitude", targetName: "decimalLatitude" },
            { originName: "decimalLongitude", targetName: "decimalLongitude" },
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
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    // Should detect latitude out of range
    const rangeErrors = result.datasetResults[0].violations.errors
      .filter(isRangeViolation);
    assertEquals(rangeErrors.length, 2); // E2 and E3 have invalid latitude
    assertEquals(rangeErrors[0].fieldName, "decimalLatitude");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceValidator - detects vocabulary violations", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "workspace_test_" });

  try {
    // Create CSV with invalid basisOfRecord values
    const occurrenceCsv = `occurrenceID,basisOfRecord,scientificName
O1,HumanObservation,Ursus arctos
O2,InvalidBasis,Canis lupus
O3,PreservedSpecimen,Panthera tigris`;

    await Deno.writeTextFile(join(tempDir, "occurrences.csv"), occurrenceCsv);

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
          name: "occurrences",
          spec: "dwc-occurrence",
          path: "./occurrences.csv",
          profile: "Occurrence",
          fieldMappings: [
            { originName: "occurrenceID", targetName: "occurrenceID" },
            { originName: "basisOfRecord", targetName: "basisOfRecord" },
            { originName: "scientificName", targetName: "scientificName" },
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

    // NOTE: This test contains an invalid vocabulary value ('InvalidBasis' in basisOfRecord).
    // With the new row-by-row validation, we detect ENUM violations before INSERT
    // and return them as structured EnumViolation objects.
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    // Verify we get structured violations
    assertEquals(result.overallStatus, "fail");
    assertEquals(result.datasetResults.length, 1);

    const datasetResult = result.datasetResults[0];
    assertEquals(datasetResult.violations.errors.length, 1);

    const enumViolations = datasetResult.violations.errors.filter((v) =>
      v._tag === "EnumViolation"
    );
    assertEquals(enumViolations.length, 1);

    const violation = enumViolations[0];
    assertEquals(violation.fieldName, "basisOfRecord");
    assertEquals(violation.value, "InvalidBasis");
    assertEquals(violation.csvValue, "InvalidBasis");
    assertEquals(violation.rowNumber, 2); // Second row (1-indexed, after header)
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceValidator - detects duplicate identifiers", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "workspace_test_" });

  try {
    // Create CSV with duplicate eventIDs
    const eventCsv = `eventID,country
E1,Canada
E2,USA
E1,Mexico`;

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
            { originName: "eventID", targetName: "eventID" },
            { originName: "country", targetName: "country" },
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

    // NOTE: This test contains duplicate eventIDs (E1 appears twice).
    // With the new row-by-row validation, we detect PRIMARY KEY duplicates before INSERT
    // and return them as structured PrimaryKeyViolation objects.
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    // Verify we get structured violations
    assertEquals(result.overallStatus, "fail");
    assertEquals(result.datasetResults.length, 1);

    const datasetResult = result.datasetResults[0];

    // Should have 2 PrimaryKeyViolations (one for each duplicate row)
    const pkViolations = datasetResult.violations.errors.filter((v) =>
      v._tag === "PrimaryKeyViolation"
    );
    assertEquals(pkViolations.length, 2);

    // Verify both violations reference the duplicate value "E1"
    assertEquals(pkViolations[0].value, "E1");
    assertEquals(pkViolations[1].value, "E1");
    assertEquals(pkViolations[0].csvValue, "E1");
    assertEquals(pkViolations[1].csvValue, "E1");

    // Verify constraint type is "duplicate"
    assertEquals(pkViolations[0].constraintType, "duplicate");
    assertEquals(pkViolations[1].constraintType, "duplicate");

    // Verify duplicate count
    assertEquals(pkViolations[0].duplicateCount, 2);
    assertEquals(pkViolations[1].duplicateCount, 2);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceValidator - reports correct row numbers for violations", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "workspace_test_" });

  try {
    // Create CSV with duplicates on specific rows (1 and 3)
    const eventCsv = `eventID,country
E1,Canada
E2,USA
E1,Mexico
E3,France`;

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
            { originName: "eventID", targetName: "eventID" },
            { originName: "country", targetName: "country" },
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
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    const datasetResult = result.datasetResults[0];
    const pkViolations = datasetResult.violations.errors.filter((v) =>
      v._tag === "PrimaryKeyViolation"
    );

    // Should have violations for rows 1 and 3 (where E1 appears)
    assertEquals(pkViolations.length, 2);

    // Extract row numbers and sort them
    const rowNumbers = pkViolations.map((v) => v.rowNumber).sort((a, b) => a - b);

    // Verify we have row 1 and row 3
    assertEquals(rowNumbers[0], 1, "First duplicate should be on row 1");
    assertEquals(rowNumbers[1], 3, "Second duplicate should be on row 3");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceValidator - row numbers are in ascending order", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "workspace_test_" });

  try {
    // Create CSV with many duplicates to test ordering
    const eventCsv = `eventID,country
DUP,Country1
E2,Country2
DUP,Country3
E4,Country4
DUP,Country5
E6,Country6
DUP,Country7`;

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
            { originName: "eventID", targetName: "eventID" },
            { originName: "country", targetName: "country" },
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
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    const datasetResult = result.datasetResults[0];
    const pkViolations = datasetResult.violations.errors.filter((v) =>
      v._tag === "PrimaryKeyViolation"
    );

    // Should have 4 violations (rows 1, 3, 5, 7)
    assertEquals(pkViolations.length, 4);

    // Extract row numbers - they should already be in order
    const rowNumbers = pkViolations.map((v) => v.rowNumber);

    // Verify they are in ascending order
    const sortedRowNumbers = [...rowNumbers].sort((a, b) => a - b);
    assertEquals(
      rowNumbers,
      sortedRowNumbers,
      "Row numbers should be in ascending order",
    );

    // Verify the specific rows
    assertEquals(rowNumbers, [1, 3, 5, 7], "Should have violations on rows 1, 3, 5, 7");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("WorkspaceValidator - validation is deterministic", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "workspace_test_" });

  try {
    // Create CSV with duplicates
    const eventCsv = `eventID,country
E1,Canada
E2,USA
E1,Mexico
E3,France
E2,Germany`;

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
            { originName: "eventID", targetName: "eventID" },
            { originName: "country", targetName: "country" },
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

    // Run validation twice
    const result1 = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );
    const result2 = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    // Extract violations from both runs
    const getRowNumbers = (result: typeof result1) => {
      const pkViolations = result.datasetResults[0].violations.errors.filter((v) =>
        v._tag === "PrimaryKeyViolation"
      );
      return pkViolations.map((v) => v.rowNumber);
    };

    const rowNumbers1 = getRowNumbers(result1);
    const rowNumbers2 = getRowNumbers(result2);

    // Should get same row numbers in same order
    assertEquals(
      rowNumbers1,
      rowNumbers2,
      "Validation should produce identical results on repeated runs",
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
