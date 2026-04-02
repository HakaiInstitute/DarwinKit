/**
 * Integration test: dataset rules (dependency) in workspace validator
 *
 * Validates that the workspace validator correctly executes dataset-level rules
 * from both resolved specs (profile-sourced) and config-level datasetRules.
 */

import { assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import { WorkspaceValidator } from "./workspace-validator.ts";
import { join } from "@std/path";

Deno.test("workspace validator - OBIS eMoF validates dependency rule", async () => {
  const tempDir = await Deno.makeTempDir();
  const csvPath = join(tempDir, "emof.csv");

  // Row 2: both missing -> should fail dependency (oneOf)
  // Row 3: only eventID present -> should pass
  // Row 4: only occurrenceID present -> should pass
  const csvContent = [
    "measurementID,eventID,occurrenceID,measurementType,measurementValue",
    "M1,EVT-1,OCC-1,temperature,15.5",
    "M2,,,temperature,16.0",
    "M3,EVT-2,,depth,10.0",
    "M4,,OCC-2,salinity,35.0",
  ].join("\n");

  await Deno.writeTextFile(csvPath, csvContent);

  try {
    const validator = new WorkspaceValidator();
    const result = await Effect.runPromise(
      validator.validateDatasets(
        [{
          name: "emof_test",
          class: "ExtendedMeasurementOrFact",
          path: csvPath,
        }],
        {
          nullValues: ["NA", ""],
          failFast: false,
          debug: false,
          outputDir: tempDir,
          enableSuggestions: false,
          datasets: [],
        },
        tempDir,
        { base: "darwin-core", variant: "obis" },
      ),
    );

    const emofResult = result.datasetResults[0];
    assertExists(emofResult);

    // DependencyViolation should appear for row 2 where
    // both eventID and occurrenceID are missing/empty.
    const depViolations = emofResult.fieldViolations.errors.filter(
      (v) => v._tag === "DependencyViolation",
    );

    // Row 2 has both fields empty (mapped to null by nullValues: [""])
    // Row 3 has eventID present, Row 4 has occurrenceID present
    assertEquals(
      depViolations.length >= 1,
      true,
      `Expected at least 1 DependencyViolation, got ${depViolations.length}. ` +
        `All field violations: ${
          JSON.stringify(emofResult.fieldViolations.errors.map((v) => v._tag))
        }`,
    );

    // Verify the violation points to the correct row
    const violationRows = depViolations.map((v) => v.rowNumber).sort();
    assertEquals(
      violationRows.includes(2),
      true,
      `Expected violation on row 2, got rows: ${violationRows}`,
    );
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("workspace validator - config-level dependency rules", async (t) => {
  const tempDir = await Deno.makeTempDir();
  const csvPath = join(tempDir, "obs.csv");

  const csvContent = [
    "eventID,scientificName,decimalLatitude,decimalLongitude",
    "EVT-1,Gadus morhua,55.5,-3.2",
    "EVT-2,Gadus morhua,55.5,",
    "EVT-3,Gadus morhua,,",
  ].join("\n");

  await Deno.writeTextFile(csvPath, csvContent);

  const datasets = [{
    name: "observations",
    class: "Occurrence",
    path: csvPath,
    fieldMappings: [
      { originName: "eventID", targetName: "eventID" },
      { originName: "scientificName", targetName: "scientificName" },
      { originName: "decimalLatitude", targetName: "decimalLatitude" },
      { originName: "decimalLongitude", targetName: "decimalLongitude" },
    ],
  }];

  const settings = {
    nullValues: ["NA", ""],
    failFast: false,
    debug: false,
    outputDir: tempDir,
    enableSuggestions: false,
    datasets: [],
  };

  const standard = { base: "darwin-core" };

  try {
    await t.step("allOf rule fires when any required field is missing", async () => {
      const validator = new WorkspaceValidator();
      const result = await Effect.runPromise(
        validator.validateDatasets(
          datasets,
          settings,
          tempDir,
          standard,
          undefined,
          [{
            ruleType: "dependency" as const,
            sourceDataset: "observations",
            when: "decimalLatitude",
            require: ["decimalLongitude"],
            level: "required" as const,
          }],
        ),
      );

      const dsResult = result.datasetResults[0];
      assertExists(dsResult);

      const depViolations = dsResult.fieldViolations.errors.filter(
        (v) => v._tag === "DependencyViolation",
      );

      // Row 2: latitude present, longitude empty → violation
      // Row 3: latitude empty → when condition not met, no violation
      assertEquals(depViolations.length, 1, `Expected 1 violation, got ${depViolations.length}`);
      assertEquals(depViolations[0].rowNumber, 2);
    });

    await t.step("oneOf rule fires when all candidates missing", async () => {
      const validator = new WorkspaceValidator();
      const result = await Effect.runPromise(
        validator.validateDatasets(
          datasets,
          settings,
          tempDir,
          standard,
          undefined,
          [{
            ruleType: "dependency" as const,
            sourceDataset: "observations",
            require: { oneOf: ["decimalLatitude", "decimalLongitude"] },
            level: "required" as const,
          }],
        ),
      );

      const dsResult = result.datasetResults[0];
      assertExists(dsResult);

      const depViolations = dsResult.fieldViolations.errors.filter(
        (v) => v._tag === "DependencyViolation",
      );

      // Row 3: both lat and lon empty → violation
      // Rows 1-2: at least one present → no violation
      assertEquals(depViolations.length, 1, `Expected 1 violation, got ${depViolations.length}`);
      assertEquals(depViolations[0].rowNumber, 3);
    });

    await t.step("rule without sourceDataset applies to all datasets", async () => {
      const validator = new WorkspaceValidator();
      const result = await Effect.runPromise(
        validator.validateDatasets(
          datasets,
          settings,
          tempDir,
          standard,
          undefined,
          [{
            ruleType: "dependency" as const,
            require: { oneOf: ["decimalLatitude", "decimalLongitude"] },
            level: "required" as const,
          }],
        ),
      );

      const dsResult = result.datasetResults[0];
      assertExists(dsResult);

      const depViolations = dsResult.fieldViolations.errors.filter(
        (v) => v._tag === "DependencyViolation",
      );

      assertEquals(depViolations.length, 1);
      assertEquals(depViolations[0].rowNumber, 3);
    });

    await t.step("level defaults to required (ERROR severity) when omitted", async () => {
      const validator = new WorkspaceValidator();
      const result = await Effect.runPromise(
        validator.validateDatasets(
          datasets,
          settings,
          tempDir,
          standard,
          undefined,
          [{
            ruleType: "dependency" as const,
            sourceDataset: "observations",
            require: { oneOf: ["decimalLatitude", "decimalLongitude"] },
          }],
        ),
      );

      const dsResult = result.datasetResults[0];
      assertExists(dsResult);

      const depViolations = dsResult.fieldViolations.errors.filter(
        (v) => v._tag === "DependencyViolation",
      );

      assertEquals(depViolations.length, 1);
      assertEquals(
        depViolations[0].severity,
        "error",
        "Default level should produce error severity",
      );
    });

    await t.step("rule scoped to different dataset is skipped", async () => {
      const validator = new WorkspaceValidator();
      const result = await Effect.runPromise(
        validator.validateDatasets(
          datasets,
          settings,
          tempDir,
          standard,
          undefined,
          [{
            ruleType: "dependency" as const,
            sourceDataset: "other_dataset",
            require: { oneOf: ["decimalLatitude", "decimalLongitude"] },
            level: "required" as const,
          }],
        ),
      );

      const dsResult = result.datasetResults[0];
      assertExists(dsResult);

      const depViolations = dsResult.fieldViolations.errors.filter(
        (v) => v._tag === "DependencyViolation",
      );

      assertEquals(depViolations.length, 0, "Rule for other dataset should not fire");
    });
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
