/**
 * Example Configuration Test
 *
 * Ensures that the example darwinkit.json configuration in test/example-config/
 * is always valid and can successfully validate the sample data.
 *
 * This test serves as both documentation and a smoke test for the validation system.
 */

import { assert, assertEquals, assertMatch } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import { WorkspaceValidator } from "../packages/core/src/workspace/workspace-validator.ts";
import { TEST_CONFIG_DIR } from "./helpers/paths.ts";

Deno.test("Example config - validates FC2022 dataset", async () => {
  const validator = new WorkspaceValidator();

  // NOTE: This test uses real-world marine survey data (FC2022) which contains values
  // that aren't in Darwin Core controlled vocabularies (e.g., 'Species' in taxonRank).
  // With row-by-row insertion fallback, ENUM constraint violations are collected as
  // EnumViolations with enforcement level based on the field's vocabulary enforcement.
  //
  // The bulk INSERT fails due to ENUM constraints, then falls back to row-by-row
  // insertion which collects detailed violations for each invalid value.
  //
  // taxonRank uses "recommended" enforcement in Darwin Core, so violations are
  // collected as warnings rather than errors.
  const result = await Effect.runPromise(
    validator.validateFromConfig(join(TEST_CONFIG_DIR, "example-config")),
  );

  // Verify we get successful validation result
  assertEquals(result.overallStatus, "warn", "Should have warnings due to taxonRank violations");
  assertEquals(result.datasetResults.length, 2, "Should have 2 datasets");

  // Find occurrences dataset result
  const occResult = result.datasetResults.find((r) => r.datasetName === "occurrences");
  assert(occResult, "Should have occurrences dataset");

  // Verify we collected ENUM violations for taxonRank
  assert(
    occResult.violations.warnings.length > 0,
    "Should have warnings from taxonRank ENUM violations",
  );

  // Check that violations are EnumViolation type with correct details
  const taxonRankViolations = occResult.violations.warnings.filter((v) =>
    v.targetName === "taxonRank"
  );
  assert(
    taxonRankViolations.length > 0,
    "Should have taxonRank violations",
  );

  // Verify violation structure
  const firstViolation = taxonRankViolations[0];
  assertEquals(firstViolation.enforcement, "recommended", "Should have recommended enforcement");
  assertEquals(firstViolation.severity, "warning", "Should have warning severity");
  assertMatch(firstViolation.errorMessage, /Species|Genus/, "Should mention invalid value");
});
