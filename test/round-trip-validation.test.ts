/**
 * Round-trip integration tests
 *
 * These tests exercise the full pipeline: create a YAML config programmatically,
 * write it to disk, run WorkspaceValidator, and verify violations are correct.
 * This verifies the complete round-trip from config creation to validation output.
 */

import { makeWorkspaceConfig } from "@dwkt/domain/schemas";
import { isRangeViolation, isRequiredFieldViolation } from "@dwkt/domain/types";
import { assert, assertEquals, assertGreater } from "@std/assert";
import { join } from "@std/path";
import { stringify as stringifyYAML } from "@std/yaml";
import * as Effect from "effect/Effect";
import { WorkspaceValidator } from "../packages/core/src/validation/workspace-validator.ts";
import { prepareConfigForYaml } from "./helpers/config-utils.ts";

// =============================================================================
// Round-trip Integration Tests
// =============================================================================

Deno.test({
  name: "Round-trip: YAML config with range constraints produces violations",
  fn: async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "rt-range-" });

    try {
      // CSV with out-of-range latitude (999.99)
      const eventCsv = `eventID,eventDate,decimalLatitude,decimalLongitude,geodeticDatum
E1,2022-09-15,49.8954,-125.4567,WGS84
E2,2022-09-16,999.99,-125.4789,WGS84
E3,2022-09-17,49.8765,-125.4321,WGS84`;

      Deno.writeTextFileSync(join(tempDir, "events.csv"), eventCsv);

      const config = makeWorkspaceConfig({
        name: "Range Constraint Round-Trip Test",
        standard: "obis",
        validation: {
          datasets: [
            {
              name: "events",
              type: "event",
              path: "./events.csv",
              fieldMappings: [
                { originName: "eventID", targetName: "eventID" },
                { originName: "eventDate", targetName: "eventDate" },
                { originName: "decimalLatitude", targetName: "decimalLatitude" },
                { originName: "decimalLongitude", targetName: "decimalLongitude" },
                { originName: "geodeticDatum", targetName: "geodeticDatum" },
              ],
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

      assertEquals(result.datasetResults.length, 1);

      const eventsResult = result.datasetResults[0];

      // Should detect range violations for decimalLatitude (999.99 is outside -90..90)
      const latViolations = [
        ...eventsResult.fieldViolations.errors,
        ...eventsResult.fieldViolations.warnings,
      ].filter(
        (v) => isRangeViolation(v) && v.targetName === "decimalLatitude",
      );

      assertGreater(
        latViolations.length,
        0,
        "Should detect range violation for decimalLatitude=999.99",
      );

      // The violation should be for row 2 (the row with 999.99)
      const hasRowTwoViolation = latViolations.some((v) => v.rowNumber === 2);
      assert(hasRowTwoViolation, "Should flag row 2 with latitude 999.99");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "Round-trip: config requirement cannot weaken spec requirement",
  fn: async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "rt-weaken-" });

    try {
      // CSV with missing eventDate (empty value) — eventDate is required by OBIS spec
      const eventCsv = `eventID,eventDate,decimalLatitude,decimalLongitude,geodeticDatum
E1,,49.8954,-125.4567,WGS84
E2,,49.9012,-125.4789,WGS84`;

      Deno.writeTextFileSync(join(tempDir, "events.csv"), eventCsv);

      // Config tries to weaken eventDate to "optional" — spec should win
      const config = makeWorkspaceConfig({
        name: "Weakening Prevention Round-Trip Test",
        standard: "obis",
        validation: {
          datasets: [
            {
              name: "events",
              type: "event",
              path: "./events.csv",
              fieldMappings: [
                { originName: "eventID", targetName: "eventID" },
                {
                  originName: "eventDate",
                  targetName: "eventDate",
                  requirement: "optional",
                },
                { originName: "decimalLatitude", targetName: "decimalLatitude" },
                { originName: "decimalLongitude", targetName: "decimalLongitude" },
                { originName: "geodeticDatum", targetName: "geodeticDatum" },
              ],
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

      assertEquals(result.datasetResults.length, 1);

      const eventsResult = result.datasetResults[0];

      // eventDate violations should appear as ERRORS — spec's "required" must win
      // over config's "optional"
      const eventDateErrors = eventsResult.fieldViolations.errors.filter(
        (v) => isRequiredFieldViolation(v) && v.targetName === "eventDate",
      );

      assertGreater(
        eventDateErrors.length,
        0,
        "eventDate should produce error-level violations even when config says 'optional'",
      );

      // eventDate should NOT appear in info bucket (which is where "optional" violations go)
      const eventDateInfo = eventsResult.fieldViolations.info.filter(
        (v) => isRequiredFieldViolation(v) && v.targetName === "eventDate",
      );

      assertEquals(
        eventDateInfo.length,
        0,
        "eventDate should not have info-level violations — spec requirement must not be weakened",
      );
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "Round-trip: preset constraint produces violations",
  fn: async () => {
    const tempDir = await Deno.makeTempDir({ prefix: "rt-preset-" });

    try {
      // CSV with invalid latitude (999.99)
      const eventCsv = `eventID,eventDate,decimalLatitude,decimalLongitude,geodeticDatum
E1,2022-09-15,999.99,-125.4567,WGS84
E2,2022-09-16,49.9012,-125.4789,WGS84`;

      Deno.writeTextFileSync(join(tempDir, "events.csv"), eventCsv);

      // Config uses preset: "latitude" on decimalLatitude
      const config = makeWorkspaceConfig({
        name: "Preset Constraint Round-Trip Test",
        standard: "obis",
        validation: {
          datasets: [
            {
              name: "events",
              type: "event",
              path: "./events.csv",
              fieldMappings: [
                { originName: "eventID", targetName: "eventID" },
                { originName: "eventDate", targetName: "eventDate" },
                {
                  originName: "decimalLatitude",
                  targetName: "decimalLatitude",
                  preset: "latitude",
                },
                { originName: "decimalLongitude", targetName: "decimalLongitude" },
                { originName: "geodeticDatum", targetName: "geodeticDatum" },
              ],
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

      assertEquals(result.datasetResults.length, 1);

      const eventsResult = result.datasetResults[0];

      // Preset "latitude" includes range(-90, 90) — 999.99 should trigger a violation
      const latViolations = [
        ...eventsResult.fieldViolations.errors,
        ...eventsResult.fieldViolations.warnings,
      ].filter(
        (v) => isRangeViolation(v) && v.targetName === "decimalLatitude",
      );

      assertGreater(
        latViolations.length,
        0,
        "Preset 'latitude' should produce range violations for 999.99",
      );

      // The violation should be for row 1 (the row with 999.99)
      const hasRowOneViolation = latViolations.some((v) => v.rowNumber === 1);
      assert(hasRowOneViolation, "Should flag row 1 with latitude 999.99");
    } finally {
      await Deno.remove(tempDir, { recursive: true });
    }
  },
});
