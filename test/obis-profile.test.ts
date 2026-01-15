/**
 * Test OBIS validation profile
 *
 * Tests validation of marine biodiversity data against OBIS profile requirements
 * including required fields, depth constraints, and coordinate validation.
 */

import { isRangeViolation, type WorkspaceConfig } from "@dwkt/domain";
import {
  assert,
  assertEquals,
  assertExists,
  assertGreater,
  assertGreaterOrEqual,
} from "@std/assert";
import * as Effect from "effect/Effect";
import { Workspace } from "../packages/core/src/workspace.ts";
import { withTestDirectory, writeCsvFile, writeWorkspaceConfig } from "./helpers/config-utils.ts";

// ============================================================================
// Test Data
// ============================================================================

/**
 * Test data for OBIS profile validation scenarios.
 * Structured as objects for readability and maintainability.
 */
const TEST_DATA = {
  /** Valid OBIS event data with all required fields */
  VALID_OBIS_EVENTS: [
    {
      eventID: "E1",
      eventDate: "2022-09-15",
      decimalLatitude: "49.8954",
      decimalLongitude: "-125.4567",
      geodeticDatum: "WGS84",
      locality: "Salish Sea",
    },
    {
      eventID: "E2",
      eventDate: "2022-09-16",
      decimalLatitude: "49.9012",
      decimalLongitude: "-125.4789",
      geodeticDatum: "WGS84",
      locality: "Strait of Georgia",
    },
    {
      eventID: "E3",
      eventDate: "2022-09-17",
      decimalLatitude: "49.8765",
      decimalLongitude: "-125.4321",
      geodeticDatum: "WGS84",
      locality: "Discovery Passage",
    },
  ],

  /** Events missing geodeticDatum (required by OBIS) */
  EVENTS_MISSING_GEODETIC_DATUM: [
    {
      eventID: "E1",
      eventDate: "2022-09-15",
      decimalLatitude: "49.8954",
      decimalLongitude: "-125.4567",
    },
    {
      eventID: "E2",
      eventDate: "2022-09-16",
      decimalLatitude: "49.9012",
      decimalLongitude: "-125.4789",
    },
  ],

  /** Events with depth values - including one exceeding max ocean depth */
  EVENTS_WITH_DEPTHS: [
    {
      eventID: "E1",
      eventDate: "2022-09-15",
      decimalLatitude: "49.8954",
      decimalLongitude: "-125.4567",
      geodeticDatum: "WGS84",
      minimumDepthInMeters: "10",
      maximumDepthInMeters: "50",
    },
    {
      eventID: "E2",
      eventDate: "2022-09-16",
      decimalLatitude: "49.9012",
      decimalLongitude: "-125.4789",
      geodeticDatum: "WGS84",
      minimumDepthInMeters: "100",
      maximumDepthInMeters: "200",
    },
    {
      eventID: "E3",
      eventDate: "2022-09-17",
      decimalLatitude: "49.8765",
      decimalLongitude: "-125.4321",
      geodeticDatum: "WGS84",
      minimumDepthInMeters: "12000", // Exceeds max ocean depth (~11000m)
      maximumDepthInMeters: "12500",
    },
  ],
};

// ============================================================================
// Tests
// ============================================================================

Deno.test({
  name: "OBIS Profile - validates required fields",
  fn: async () => {
    await withTestDirectory(async (tempDir) => {
      // Write CSV with all OBIS-required fields
      await writeCsvFile(tempDir, "events", TEST_DATA.VALID_OBIS_EVENTS);

      const config: WorkspaceConfig = {
        id: "obis-profile-test",
        name: "OBIS Profile Test",
        version: "1.0.0",
        description: "Test OBIS validation profile",
        createdAt: new Date(),
        updatedAt: new Date(),
        validation: {
          nullValues: ["NA", "N/A", "", "NULL", "null"],
          failFast: false,
          outputDir: "./validation_results",
          datasets: [
            {
              name: "events",
              spec: "dwc-event",
              path: "./events.csv",
              profile: "obis-event",
              description: "Marine sampling events",
              fieldMappings: [
                { originName: "eventID", targetName: "eventID" },
                { originName: "eventDate", targetName: "eventDate" },
                { originName: "decimalLatitude", targetName: "decimalLatitude" },
                { originName: "decimalLongitude", targetName: "decimalLongitude" },
                { originName: "geodeticDatum", targetName: "geodeticDatum" },
                { originName: "locality", targetName: "locality" },
              ],
            },
          ],
        },
      };

      await writeWorkspaceConfig(tempDir, config);

      // Validate
      const workspace = await Effect.runPromise(Workspace.discover(tempDir));
      const result = await Effect.runPromise(workspace.validate());
      workspace.close();

      // Should pass validation (may have warnings for strongly-recommended fields)
      assertExists(result);
      assertEquals(result.datasetResults.length, 1);

      const eventsResult = result.datasetResults[0];
      assertEquals(
        eventsResult.schemaViolations.errors.length,
        0,
        "Should have no required field errors",
      );

      // With the new profile system, we expect warnings for missing strongly-recommended fields
      // (scientificName, scientificNameID, etc. from the base OBIS profile)
      assertGreaterOrEqual(
        eventsResult.schemaViolations.warnings.length,
        1,
        "Should have warnings for strongly-recommended fields",
      );
      assertEquals(eventsResult.status, "warn", "Status should be warn when there are warnings");
    });
  },
});

Deno.test({
  name: "OBIS Profile - detects missing required fields",
  fn: async () => {
    await withTestDirectory(async (tempDir) => {
      // Write CSV WITHOUT geodeticDatum (required by OBIS)
      await writeCsvFile(tempDir, "events", TEST_DATA.EVENTS_MISSING_GEODETIC_DATUM);

      const config: WorkspaceConfig = {
        id: "obis-missing-field-test",
        name: "OBIS Missing Field Test",
        version: "1.0.0",
        description: "Test OBIS validation profile with missing required field",
        createdAt: new Date(),
        updatedAt: new Date(),
        validation: {
          nullValues: ["NA", "N/A", "", "NULL", "null"],
          failFast: false,
          outputDir: "./validation_results",
          datasets: [
            {
              name: "events",
              spec: "dwc-event",
              path: "./events.csv",
              profile: "obis-event",
              description: "Marine sampling events",
              fieldMappings: [
                { originName: "eventID", targetName: "eventID" },
                { originName: "eventDate", targetName: "eventDate" },
                { originName: "decimalLatitude", targetName: "decimalLatitude" },
                { originName: "decimalLongitude", targetName: "decimalLongitude" },
                // Missing geodeticDatum mapping!
              ],
            },
          ],
        },
      };

      await writeWorkspaceConfig(tempDir, config);

      // Validate
      const workspace = await Effect.runPromise(Workspace.discover(tempDir));

      // NOTE: This test is missing the geodeticDatum field mapping, and geodeticDatum
      // is marked as NOT NULL in the OBIS Event Core profile schema.
      // The validation detects this as a required field error and marks the dataset as failed.
      const result = await Effect.runPromise(workspace.validate());
      workspace.close();

      // Verify we get a failed validation result
      assertEquals(result.overallStatus, "fail", "Should fail when required fields are missing");
      assertEquals(result.datasetResults.length, 1, "Should have 1 dataset");

      const eventsResult = result.datasetResults[0];
      assertEquals(eventsResult.status, "fail", "Events dataset should fail");

      // Verify that geodeticDatum is reported as a missing required field
      const missingFieldError = eventsResult.schemaViolations.errors.find(
        (e) => e.fieldName === "geodeticDatum" || e.targetName === "geodeticDatum",
      );
      assert(
        missingFieldError,
        "Should have error about missing geodeticDatum field",
      );
    });
  },
});

Deno.test("OBIS Profile - applies depth range constraints", async () => {
  await withTestDirectory(async (tempDir) => {
    // Write CSV with depth values (one exceeds max ocean depth)
    await writeCsvFile(tempDir, "events", TEST_DATA.EVENTS_WITH_DEPTHS);

    const config: WorkspaceConfig = {
      id: "obis-depth-test",
      name: "OBIS Depth Validation Test",
      version: "1.0.0",
      description: "Test OBIS depth range constraints",
      createdAt: new Date(),
      updatedAt: new Date(),
      validation: {
        nullValues: ["NA", "N/A", "", "NULL", "null"],
        failFast: false,
        outputDir: "./validation_results",
        datasets: [
          {
            name: "events",
            spec: "dwc-event",
            profile: "obis",
            path: "./events.csv",
            description: "Marine sampling events",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID" },
              { originName: "eventDate", targetName: "eventDate" },
              { originName: "decimalLatitude", targetName: "decimalLatitude" },
              { originName: "decimalLongitude", targetName: "decimalLongitude" },
              { originName: "geodeticDatum", targetName: "geodeticDatum" },
              { originName: "minimumDepthInMeters", targetName: "minimumDepthInMeters" },
              { originName: "maximumDepthInMeters", targetName: "maximumDepthInMeters" },
            ],
          },
        ],
      },
    };

    await writeWorkspaceConfig(tempDir, config);

    // Validate
    const workspace = await Effect.runPromise(Workspace.discover(tempDir));
    const result = await Effect.runPromise(workspace.validate());
    workspace.close();

    // Should detect depth constraint violations
    assertExists(result);
    assertEquals(result.datasetResults.length, 1);

    const eventsResult = result.datasetResults[0];

    // Should have constraint violations for depths > 11000m
    // Depth constraints are "recommended" enforcement, so they appear in warnings
    const depthViolations = [
      ...eventsResult.fieldViolations.errors,
      ...eventsResult.fieldViolations.warnings,
    ].filter(
      (v) =>
        isRangeViolation(v) &&
        (v.targetName === "minimumDepthInMeters" || v.targetName === "maximumDepthInMeters"),
    );

    assertGreater(depthViolations.length, 0, "Should detect depth violations");

    // Verify the violation is for row 3 (depth 12000-12500)
    const hasRowThreeViolation = depthViolations.some((v) => v.rowNumber === 3);

    assert(hasRowThreeViolation, "Should flag row 3 with depth > 11000m");
  });
});
