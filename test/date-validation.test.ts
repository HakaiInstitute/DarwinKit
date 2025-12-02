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
import { isRangeViolation } from "../packages/domain/mod.ts";

Deno.test({
  name: "WorkspaceValidator - validates date ranges",
  fn: async () => {
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
          datasets: [
            {
              name: "events",
              spec: "dwc-event",
              path: "./events.csv",
              profile: "Event",
              fieldMappings: [
                { originName: "eventID", targetName: "eventID" },
                { originName: "year", targetName: "year" },
                { originName: "month", targetName: "month" },
                { originName: "day", targetName: "day" },
                { originName: "eventDate", targetName: "eventDate" },
              ],
            },
          ],
        },
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

      // Check for specific date range violations
      const rangeErrors = datasetResult.violations.errors
        .filter(isRangeViolation);

      // Should have violations for:
      // - month 13 (> 12)
      // - day 32 (> 31)
      const monthViolation = rangeErrors.find((v) => v.fieldName === "month");
      const dayViolation = rangeErrors.find((v) => v.fieldName === "day");

      assertExists(monthViolation, "Should detect month out of range");
      assertExists(dayViolation, "Should detect day out of range");

      assertEquals(Number(monthViolation.value), 13); // Row E3
      assertEquals(Number(dayViolation.value), 32); // Row E4
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});
