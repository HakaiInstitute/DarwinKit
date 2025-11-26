/**
 * Test OBIS validation profile
 */

import * as Effect from "effect/Effect";
import { assert, assertEquals, assertExists } from "@std/assert";
import { WorkspaceValidator } from "../packages/core/src/workspace/workspace-validator.ts";
import { join } from "@std/path";

Deno.test("OBIS Profile - validates required fields", async () => {
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      validation: {
        profile: "obis-event",
        nullValues: ["NA", "N/A", "", "NULL", "null"],
        failFast: false,
        outputDir: "./validation_results",
        datasets: [
          {
            name: "events",
            spec: "dwc-event",
            profile: "Event",
            path: "./events.csv",
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
      join(tempDir, "darwinkit.json"),
      JSON.stringify(config, null, 2),
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
      eventsResult.requiredFieldErrors.length,
      0,
      "Should have no required field errors",
    );

    // With the new profile system, we expect warnings for missing strongly-recommended fields
    // (scientificName, scientificNameID, etc. from the base OBIS profile)
    assert(
      eventsResult.warnings.length > 0,
      "Should have warnings for strongly-recommended fields",
    );
    assertEquals(eventsResult.status, "warn", "Status should be warn when there are warnings");
  } finally {
    // Cleanup
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("OBIS Profile - detects missing required fields", async () => {
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      validation: {
        profile: "obis-event",
        nullValues: ["NA", "N/A", "", "NULL", "null"],
        failFast: false,
        outputDir: "./validation_results",
        datasets: [
          {
            name: "events",
            spec: "dwc-event",
            profile: "Event",
            path: "./events.csv",
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
      join(tempDir, "darwinkit.json"),
      JSON.stringify(config, null, 2),
    );

    // Validate
    const validator = new WorkspaceValidator();
    const result = await Effect.runPromise(
      validator.validateFromConfig(tempDir),
    );

    // Should fail validation due to missing required field (geodeticDatum)
    assertExists(result);
    assertEquals(result.datasetResults.length, 1);

    const eventsResult = result.datasetResults[0];

    // geodeticDatum is required by the base OBIS profile
    const geodeticDatumError = eventsResult.requiredFieldErrors.find(
      (e) => e.targetName === "geodeticDatum",
    );

    assertExists(geodeticDatumError, "Should have error for missing geodeticDatum");
    assertEquals(
      geodeticDatumError.message.includes("obis"),
      true,
      "Error should mention OBIS profile",
    );

    assertEquals(eventsResult.status, "fail", "Should fail due to missing required field");
    assertEquals(result.overallStatus, "fail", "Overall status should be fail");
  } finally {
    // Cleanup
    await Deno.remove(tempDir, { recursive: true });
  }
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
    const config = {
      id: "obis-depth-test",
      name: "OBIS Depth Validation Test",
      version: "1.0.0",
      description: "Test OBIS depth range constraints",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      validation: {
        profile: "obis-event",
        nullValues: ["NA", "N/A", "", "NULL", "null"],
        failFast: false,
        outputDir: "./validation_results",
        datasets: [
          {
            name: "events",
            spec: "dwc-event",
            profile: "Event",
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
      join(tempDir, "darwinkit.json"),
      JSON.stringify(config, null, 2),
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
    const depthViolations = eventsResult.violations.errors.filter(
      (v) =>
        v.violationType === "range" &&
        (v.targetName === "minimumDepthInMeters" || v.targetName === "maximumDepthInMeters"),
    );

    assertEquals(depthViolations.length > 0, true, "Should detect depth violations");

    // Verify the violation is for row 3 (depth 12000-12500)
    const hasRowThreeViolation = depthViolations.some((v) => v.rowNumber === 3);

    assertEquals(hasRowThreeViolation, true, "Should flag row 3 with depth > 11000m");
  } finally {
    // Cleanup
    await Deno.remove(tempDir, { recursive: true });
  }
});
