/**
 * Test OBIS validation profile
 */

import { makeWorkspaceConfig } from "@dwkt/domain/schemas";
import { isMissingFieldViolation, isRangeViolation } from "@dwkt/domain/types";
import { assert, assertEquals, assertExists, assertGreater } from "@std/assert";
import { join } from "@std/path";
import { stringify as stringifyYAML } from "@std/yaml";
import * as Effect from "effect/Effect";
import { getValidationProfile } from "../packages/domain/src/specs/profiles/registry.ts";
import { WorkspaceValidator } from "../packages/core/src/validation/workspace-validator.ts";
import { prepareConfigForYaml } from "./helpers/config-utils.ts";

// =============================================================================
// Profile Inheritance Chain Tests
// =============================================================================

Deno.test("Profile inheritance - obis-event resolves with Event base fields", () => {
  const profile = getValidationProfile("obis-event");
  assertExists(profile, "obis-event profile should resolve");

  // Should have normalizedFields inherited from Event (JSON base)
  assertExists(profile.normalizedFields, "Should have normalizedFields from Event base");

  // Event base defines eventID, eventDate, decimalLatitude, etc.
  assert(
    "eventID" in profile.normalizedFields!,
    "Should inherit eventID from Event base",
  );
  assert(
    "eventDate" in profile.normalizedFields!,
    "Should inherit eventDate from Event base",
  );
});

Deno.test("Profile inheritance - obis-event field overrides take precedence over Event base", () => {
  const profile = getValidationProfile("obis-event");
  assertExists(profile);

  // decimalLatitude is defined in Event base AND overridden by OBIS base profile.
  // The OBIS override should win (adds range constraint + required requirement).
  const latOverride = profile.fieldOverrides?.["decimalLatitude"];
  assertExists(latOverride, "decimalLatitude should have an override from OBIS");
  assertExists(latOverride.constraints, "Override should include constraints");
  const rangeConstraints = latOverride.constraints!.filter((c) => c.type === "range");
  assertEquals(rangeConstraints.length, 1, "Should have exactly one range constraint");
  if (rangeConstraints[0].type === "range") {
    assertEquals(rangeConstraints[0].min, -90);
    assertEquals(rangeConstraints[0].max, 90);
  }
});

Deno.test("Profile inheritance - obis-event preserves non-overlapping fields from all ancestors", () => {
  const profile = getValidationProfile("obis-event");
  assertExists(profile);

  // eventID override comes from obis-event (not in obis base or Event base overrides)
  const eventIdOverride = profile.fieldOverrides?.["eventID"];
  assertExists(eventIdOverride, "eventID override from obis-event should be present");

  // geodeticDatum override comes from obis base (not overridden by obis-event)
  const geodeticOverride = profile.fieldOverrides?.["geodeticDatum"];
  assertExists(geodeticOverride, "geodeticDatum override from obis base should be preserved");

  // samplingProtocol comes from obis-event only
  const samplingOverride = profile.fieldOverrides?.["samplingProtocol"];
  assertExists(samplingOverride, "samplingProtocol override from obis-event should be present");
});

Deno.test("Profile inheritance - obis resolves with Event base normalizedFields", () => {
  const profile = getValidationProfile("obis");
  assertExists(profile, "obis profile should resolve");
  assertExists(profile.normalizedFields, "obis should inherit normalizedFields from Event");

  // Verify Event base fields are present
  assert("eventID" in profile.normalizedFields!, "Should have eventID from Event");
  assert("decimalLatitude" in profile.normalizedFields!, "Should have decimalLatitude from Event");
});

Deno.test({
  name: "OBIS Profile - validates required fields",
  fn: async () => {
    // Create temp directory for test workspace
    const tempDir = await Deno.makeTempDir({ prefix: "obis-test-" });

    try {
      // Create test CSV with OBIS-required fields
      const eventCsv =
        `eventID,parentEventID,eventDate,decimalLatitude,decimalLongitude,geodeticDatum,locality
E1,P1,2022-09-15,49.8954,-125.4567,WGS84,Salish Sea
E2,P1,2022-09-16,49.9012,-125.4789,WGS84,Strait of Georgia
E3,P1,2022-09-17,49.8765,-125.4321,WGS84,Discovery Passage`;

      Deno.writeTextFileSync(join(tempDir, "events.csv"), eventCsv);

      // Create config with OBIS profile
      const config = makeWorkspaceConfig({
        name: "OBIS Profile Test",
        description: "Test OBIS validation profile",
        validation: {
          datasets: [
            {
              name: "events",
              spec: "dwc-event",
              path: "./events.csv",
              profile: "obis-event",
              description: "Marine sampling events",
              fieldMappings: [
                { originName: "eventID", targetName: "eventID" },
                { originName: "parentEventID", targetName: "parentEventID" },
                { originName: "eventDate", targetName: "eventDate" },
                { originName: "decimalLatitude", targetName: "decimalLatitude" },
                { originName: "decimalLongitude", targetName: "decimalLongitude" },
                { originName: "geodeticDatum", targetName: "geodeticDatum" },
                { originName: "locality", targetName: "locality" },
              ],
            },
          ],
        },
      });

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

      // With OBIS profile, we expect warnings for missing strongly-recommended fields
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
    const tempDir = await Deno.makeTempDir({ prefix: "obis-test-" });

    try {
      // Create test CSV WITHOUT geodeticDatum column (required by OBIS profile)
      const eventCsv = `eventID,eventDate,decimalLatitude,decimalLongitude
E1,2022-09-15,49.8954,-125.4567
E2,2022-09-16,49.9012,-125.4789`;

      Deno.writeTextFileSync(join(tempDir, "events.csv"), eventCsv);

      // Config uses obis-event profile. No fieldMappings for geodeticDatum —
      // auto-mapping creates an entry from the profile, but the CSV lacks the column.
      const config = makeWorkspaceConfig({
        name: "OBIS Missing Field Test",
        description: "Test OBIS validation profile with missing required field",
        validation: {
          datasets: [
            {
              name: "events",
              spec: "dwc-event",
              path: "./events.csv",
              profile: "obis-event",
              description: "Marine sampling events",
            },
          ],
        },
      });

      Deno.writeTextFileSync(
        join(tempDir, "darwinkit.yaml"),
        stringifyYAML(prepareConfigForYaml(config)),
      );

      const validator = new WorkspaceValidator();
      const result = await Effect.runPromise(
        validator.validateFromConfig(tempDir),
      );

      assertExists(result);
      assertEquals(result.datasetResults.length, 1);

      const eventsResult = result.datasetResults[0];

      // geodeticDatum is required by OBIS — should appear as a MissingFieldViolation
      const missingGeodeticDatum = eventsResult.schemaViolations.errors.find(
        (v) =>
          isMissingFieldViolation(v) &&
          v.fieldName === "geodeticDatum" &&
          v.enforcement === "required",
      );
      assert(
        missingGeodeticDatum,
        "Should report geodeticDatum as missing required field",
      );
    } finally {
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
    const config = makeWorkspaceConfig({
      name: "OBIS Depth Validation Test",
      description: "Test OBIS depth range constraints",
      validation: {
        datasets: [
          {
            name: "events",
            spec: "dwc-event",
            profile: "obis-event",
            path: "./events.csv",
            description: "Marine sampling events",
            fieldMappings: [
              { originName: "eventID", targetName: "eventID" },
              { originName: "eventDate", targetName: "eventDate" },
              { originName: "decimalLatitude", targetName: "decimalLatitude" },
              { originName: "decimalLongitude", targetName: "decimalLongitude" },
              { originName: "geodeticDatum", targetName: "geodeticDatum" },
              {
                originName: "minimumDepthInMeters",
                targetName: "minimumDepthInMeters",
                constraints: [{ type: "range", min: 0, max: 11000 }],
              },
              {
                originName: "maximumDepthInMeters",
                targetName: "maximumDepthInMeters",
                constraints: [{ type: "range", min: 0, max: 11000 }],
              },
            ],
          },
        ],
      },
    });

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
    // Depth violations are always errors (value validity is unconditional)
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
