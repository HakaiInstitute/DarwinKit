/**
 * Integration test: dataset rules (dependency) in workspace validator
 *
 * Validates that the workspace validator correctly executes dataset-level rules
 * from the resolved spec (e.g., OBIS-eMoF's dependency rule for
 * eventID/occurrenceID).
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
