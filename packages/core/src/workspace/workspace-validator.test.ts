/**
 * Tests for WorkspaceValidator
 */

import { assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import { join } from "@std/path";
import { WorkspaceValidator } from "./workspace-validator.ts";
import { isRangeViolation, isUniquenessViolation, isVocabularyViolation } from "@dwkt/domain";

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
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    // Should detect missing required field
    assertEquals(result.datasetResults[0].requiredFieldErrors.length, 1);
    assertEquals(result.datasetResults[0].requiredFieldErrors[0].fieldName, "countryCode");
    assertEquals(result.datasetResults[0].status, "fail");
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
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    // Should detect invalid vocabulary value
    const vocabErrors = result.datasetResults[0].violations.errors
      .filter(isVocabularyViolation);
    assertEquals(vocabErrors.length, 1);
    assertEquals(vocabErrors[0].fieldName, "basisOfRecord");
    assertEquals(vocabErrors[0].value, "InvalidBasis");
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

    // Should detect duplicate eventID
    const uniquenessErrors = result.datasetResults[0].violations.errors
      .filter(isUniquenessViolation);
    assertEquals(uniquenessErrors.length, 2); // Two rows with duplicate E1
    assertEquals(uniquenessErrors[0].value, "E1");
    assertEquals(uniquenessErrors[0].fieldName, "eventID");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
