/**
 * Date Validation Test
 *
 * Ensures that temporal field validation is working correctly
 * for year, month, and day fields.
 */

import { assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import { join } from "@std/path";
import { WorkspaceValidator } from "../packages/core/src/workspace/workspace-validator.ts";

Deno.test("WorkspaceValidator - validates date ranges", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "date_validation_test_" });

  try {
    // Create CSV with invalid date values
    const eventCsv = `eventID,year,month,day,eventDate
E1,2022,9,15,2022-09-15
E2,1500,1,1,1500-01-01
E3,2022,13,1,2022-13-01
E4,2022,6,32,2022-06-32`;

    await Deno.writeTextFile(join(tempDir, "events.csv"), eventCsv);

    const config = {
      id: "date-test-workspace",
      name: "Date Validation Test",
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
            { originName: "year", targetName: "year" },
            { originName: "month", targetName: "month" },
            { originName: "day", targetName: "day" },
            { originName: "eventDate", targetName: "eventDate" },
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

    // Should detect constraint violations
    assertExists(result);
    assertEquals(result.datasetResults.length, 1);

    const datasetResult = result.datasetResults[0];
    console.log("\n=== Date Validation Results ===");
    console.log(`Status: ${datasetResult.status}`);
    console.log(`Constraint violations: ${datasetResult.constraintViolations.length}`);

    // Check for specific date range violations
    const violations = datasetResult.constraintViolations;
    for (const violation of violations) {
      console.log(`\n${violation.fieldName} (${violation.constraintType}):`);
      for (const v of violation.violations) {
        console.log(`  Row ${v.rowNumber}: ${v.value} - ${v.errorMessage}`);
      }
    }

    // Should have violations for:
    // - year 1500 (before 1600)
    // - month 13 (> 12)
    // - day 32 (> 31)
    const yearViolation = violations.find((v) => v.fieldName === "year");
    const monthViolation = violations.find((v) => v.fieldName === "month");
    const dayViolation = violations.find((v) => v.fieldName === "day");

    assertExists(yearViolation, "Should detect year out of range");
    assertExists(monthViolation, "Should detect month out of range");
    assertExists(dayViolation, "Should detect day out of range");

    assertEquals(yearViolation.violations.length, 1); // Row E2
    assertEquals(monthViolation.violations.length, 1); // Row E3
    assertEquals(dayViolation.violations.length, 1); // Row E4
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
