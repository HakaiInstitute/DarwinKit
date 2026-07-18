/**
 * Example Configuration Test
 *
 * Ensures that the example darwinkit.yaml configuration in test/example-config/
 * is always valid and can successfully validate the sample data.
 *
 * This test serves as both documentation and a smoke test for the validation system.
 */

import { assert, assertEquals, assertMatch } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import { WorkspaceValidator } from "../packages/core/src/validation/workspace-validator.ts";
import { TEST_CONFIG_DIR } from "./helpers/paths.ts";

Deno.test("Example config - validates FC2022 dataset", async () => {
  const validator = new WorkspaceValidator();

  // FC2022 contains values outside Darwin Core vocabularies (e.g. 'Species' in
  // taxonRank). taxonRank is "recommended", so these surface as warnings, not errors.
  const result = await Effect.runPromise(
    validator.validateFromConfig(join(TEST_CONFIG_DIR, "example-config")),
  );

  assertEquals(result.datasetResults.length, 2, "Should have 2 datasets");

  // Events have required-field violations (empty/null values) for fields like
  // parentEventID (null for root events), eventDate, decimalLatitude, etc.
  const eventsResult = result.datasetResults.find((r) => r.datasetName === "events");
  assert(eventsResult, "Should have events dataset");
  assert(
    eventsResult.fieldViolations.errors.length > 0,
    "Events should have required field errors (null values in required fields)",
  );

  const occResult = result.datasetResults.find((r) => r.datasetName === "occurrences");
  assert(occResult, "Should have occurrences dataset");

  assert(
    occResult.fieldViolations.warnings.length > 0,
    "Should have warnings from taxonRank ENUM violations",
  );

  const taxonRankViolations = occResult.fieldViolations.warnings.filter((v) =>
    v.targetName === "taxonRank"
  );
  assert(
    taxonRankViolations.length > 0,
    "Should have taxonRank violations",
  );

  const firstViolation = taxonRankViolations[0];
  assertEquals(firstViolation.severity, "warning", "Should have warning severity");
  assertMatch(firstViolation.errorMessage, /Species|Genus/, "Should mention invalid value");
});
