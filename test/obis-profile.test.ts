/**
 * Test OBIS validation profile
 */

import { isRangeViolation } from "@dwkt/domain/types";
import type { WorkspaceConfig } from "@dwkt/domain/schemas";
import { assert, assertEquals, assertExists, assertGreater } from "@std/assert";
import { join } from "@std/path";
import { stringify as stringifyYAML } from "@std/yaml";
import * as Effect from "effect/Effect";
import { WorkspaceValidator } from "../packages/core/src/validation/workspace-validator.ts";
import { prepareConfigForYaml } from "./helpers/config-utils.ts";

Deno.test({
  name: "OBIS Profile - validates required fields",
  fn: async () => {
    // Create temp directory for test workspace
    const tempDir = await Deno.makeTempDir({ prefix: "obis-test-" });

    try {
      // Create test CSV with OBIS-required fields
      const eventCsv = `eventID,eventDate,decimalLatitude,decimalLongitude,geodeticDatum,locality
E1,2022-09-15,49.8954,-125.4567,WGS84,Salish Sea
E2,2022-09-16,49.9012,-125.4789,WGS84,Strait of Georgia
E3,2022-09-17,49.8765,-125.4321,WGS84,Discovery Passage`;

      Deno.writeTextFileSync(join(tempDir, "events.csv"), eventCsv);

      // Create config with OBIS profile
      const config = {
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

      Deno.writeTextFileSync(
        join(tempDir, "darwinkit.yaml"),
        stringifyYAML(prepareConfigForYaml(config)),
      );

      // Validate
      const validator = new WorkspaceValidator();
      const result = await Effect.runPromise(
        validator.validateFromConfig(tempDir),
      );

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
      assert(
        eventsResult.schemaViolations.warnings.length > 0,
        "Should have warnings for strongly-recommended fields",
      );
      assertEquals(eventsResult.status, "warn", "Status should be warn when there are warnings");
    } finally {
      // Cleanup
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "OBIS Profile - detects missing required fields",
  fn: async () => {
    // Create temp directory for test workspace
    const tempDir = await Deno.makeTempDir({ prefix: "obis-test-" });

    try {
      // Create test CSV WITHOUT geodeticDatum (required by OBIS)
      const eventCsv = `eventID,eventDate,decimalLatitude,decimalLongitude
E1,2022-09-15,49.8954,-125.4567
E2,2022-09-16,49.9012,-125.4789`;

      Deno.writeTextFileSync(join(tempDir, "events.csv"), eventCsv);

      // Create config with OBIS profile
      const config = {
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

      Deno.writeTextFileSync(
        join(tempDir, "darwinkit.yaml"),
        stringifyYAML(prepareConfigForYaml(config)),
      );

      // Validate
      const validator = new WorkspaceValidator();

      // NOTE: This test is missing the geodeticDatum field mapping, and geodeticDatum
      // is marked as NOT NULL in the OBIS Event Core profile schema.
      // The validation detects this as a required field error and marks the dataset as failed.
      const result = await Effect.runPromise(
        validator.validateFromConfig(tempDir),
      );

      // Verify we get a failed validation result
      assertEquals(result.overallStatus, "fail", "Should fail when required fields are missing");
      assertEquals(result.datasetResults.length, 1, "Should have 1 dataset");

      const eventsResult = result.datasetResults[0];
      assertEquals(eventsResult.status, "fail", "Events dataset should fail");

      // Verify that geodeticDatum is reported as a missing required field
      const missingFieldError = eventsResult.schemaViolations.errors.find((e) =>
        e.fieldName === "geodeticDatum" || e.targetName === "geodeticDatum"
      );
      assert(
        missingFieldError,
        "Should have error about missing geodeticDatum field",
      );
    } finally {
      // Cleanup
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test("OBIS Profile - applies depth range constraints", async () => {
  // Create temp directory for test workspace
  const tempDir = await Deno.makeTempDir({ prefix: "obis-test-" });

  try {
    // Create test CSV with depth values (one invalid)
    const eventCsv =
      `eventID,eventDate,decimalLatitude,decimalLongitude,geodeticDatum,minimumDepthInMeters,maximumDepthInMeters
E1,2022-09-15,49.8954,-125.4567,WGS84,10,50
E2,2022-09-16,49.9012,-125.4789,WGS84,100,200
E3,2022-09-17,49.8765,-125.4321,WGS84,12000,12500`;

    Deno.writeTextFileSync(join(tempDir, "events.csv"), eventCsv);

    // Create config with OBIS profile
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

    Deno.writeTextFileSync(
      join(tempDir, "darwinkit.yaml"),
      stringifyYAML(prepareConfigForYaml(config)),
    );

    // Validate
    const validator = new WorkspaceValidator();
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

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
  } finally {
    // Cleanup
    await Deno.remove(tempDir, { recursive: true });
  }
});
