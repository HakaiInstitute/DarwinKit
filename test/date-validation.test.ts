/**
 * Date Validation Test
 *
 * Ensures that temporal field validation is working correctly
 * for year, month, and day fields.
 */

import { Workspace } from "@dwkt/core";
import { isRangeViolation, type WorkspaceConfig } from "@dwkt/domain";
import { assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import { withTestDirectory, writeCsvFile, writeWorkspaceConfig } from "./helpers/config-utils.ts";

// ============================================================================
// Test Data
// ============================================================================

/**
 * Test data for date validation scenarios.
 * Structured as objects for readability and type safety.
 */
const TEST_DATA = {
  /** Events with various date values - some valid, some invalid */
  DATE_VALIDATION_EVENTS: [
    { eventID: "E1", year: "2022", month: "9", day: "15", eventDate: "2022-09-15" }, // Valid
    { eventID: "E2", year: "1500", month: "1", day: "1", eventDate: "1500-01-01" }, // Valid (historical)
    { eventID: "E3", year: "2022", month: "13", day: "1", eventDate: "2022-13-01" }, // Invalid: month > 12
    { eventID: "E4", year: "2022", month: "6", day: "32", eventDate: "2022-06-32" }, // Invalid: day > 31
  ],
};

// ============================================================================
// Tests
// ============================================================================

Deno.test({
  name: "Workspace Validation - validates date ranges",
  fn: async () => {
    await withTestDirectory(async (tempDir) => {
      // Write CSV from structured data
      await writeCsvFile(tempDir, "events", TEST_DATA.DATE_VALIDATION_EVENTS);

      const config: WorkspaceConfig = {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await writeWorkspaceConfig(tempDir, config);

      const workspace = await Effect.runPromise(Workspace.discover(tempDir));
      const result = await Effect.runPromise(workspace.validate());
      workspace.close();

      // Should detect constraint violations
      assertExists(result);
      assertEquals(result.datasetResults.length, 1);

      const datasetResult = result.datasetResults[0];

      // Check for specific date range violations
      const rangeErrors = datasetResult.fieldViolations.errors.filter(isRangeViolation);

      // Should have violations for:
      // - month 13 (> 12)
      // - day 32 (> 31)
      const monthViolation = rangeErrors.find((v) => v.fieldName === "month");
      const dayViolation = rangeErrors.find((v) => v.fieldName === "day");

      assertExists(monthViolation, "Should detect month out of range");
      assertExists(dayViolation, "Should detect day out of range");

      assertEquals(Number(monthViolation.value), 13); // Row E3
      assertEquals(Number(dayViolation.value), 32); // Row E4
    });
  },
});
