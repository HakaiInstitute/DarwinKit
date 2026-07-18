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

  // NOTE: This test uses real-world marine survey data (FC2022) which contains values
  // that aren't in Darwin Core controlled vocabularies (e.g., 'Species' in taxonRank).
  // The query-based vocabulary validator (findVocabularyViolations) flags these as
  // EnumViolations, with severity based on the field's vocabulary requirement.
  //
  // taxonRank uses "recommended" requirement in Darwin Core, so violations are
  // collected as warnings rather than errors.
  const result = await Effect.runPromise(
    validator.validateFromConfig(join(TEST_CONFIG_DIR, "example-config")),
  );

  // Verify we get a validation result with 2 datasets
  assertEquals(result.datasetResults.length, 2, "Should have 2 datasets");

  // Events dataset now correctly detects required field violations (empty/null values)
  // for fields like parentEventID (null for root events), eventDate, decimalLatitude, etc.
  const eventsResult = result.datasetResults.find((r) => r.datasetName === "events");
  assert(eventsResult, "Should have events dataset");
  assert(
    eventsResult.fieldViolations.errors.length > 0,
    "Events should have required field errors (null values in required fields)",
  );

  // Find occurrences dataset result
  const occResult = result.datasetResults.find((r) => r.datasetName === "occurrences");
  assert(occResult, "Should have occurrences dataset");

  // Verify we collected ENUM violations for taxonRank
  assert(
    occResult.fieldViolations.warnings.length > 0,
    "Should have warnings from taxonRank ENUM violations",
  );

  // Check that violations are EnumViolation type with correct details
  const taxonRankViolations = occResult.fieldViolations.warnings.filter((v) =>
    v.targetName === "taxonRank"
  );
  assert(
    taxonRankViolations.length > 0,
    "Should have taxonRank violations",
  );

  // Verify violation structure
  const firstViolation = taxonRankViolations[0];
  assertEquals(firstViolation.severity, "warning", "Should have warning severity");
  assertMatch(firstViolation.errorMessage, /Species|Genus/, "Should mention invalid value");
});
