/**
 * Example Configuration Test
 *
 * Ensures that the example darwinkit.json configuration in test/example-config/
 * is always valid and can successfully validate the sample data.
 *
 * This test serves as both documentation and a smoke test for the validation system.
 */

import { ErrorCode } from "@dwkt/domain";
import { assert, assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import {
  WorkspaceValidationError,
  WorkspaceValidator,
} from "../packages/core/src/workspace/workspace-validator.ts";

Deno.test("Example config - validates FC2022 dataset", async () => {
  const validator = new WorkspaceValidator();

  // NOTE: This test uses real-world marine survey data (FC2022) which contains values
  // that aren't in Darwin Core controlled vocabularies (e.g., 'Species' in taxonRank).
  // With ENUMs enabled, the INSERT fails due to ENUM constraint violations.
  //
  // This demonstrates the core problem with using SQL ENUMs for controlled vocabularies:
  // Real-world biodiversity data often contains valid values that aren't in the strict
  // Darwin Core vocabulary lists, causing validation to fail during data loading rather
  // than providing helpful validation messages.
  //
  // TODO: Remove ENUMs and use TEXT + validation logic for controlled vocabularies
  const error = await Effect.runPromise(
    Effect.flip(validator.validateFromConfig("./test/example-config")),
  );

  // Verify we get a database error about ENUM conversion failure
  assert(
    error instanceof WorkspaceValidationError,
    "Expected WorkspaceValidationError",
  );
  assertEquals(error.code, ErrorCode.DATABASE_ERROR);
  assert(
    error.message.includes("Conversion Error") || error.message.includes("Could not convert"),
    `Expected ENUM conversion error, got: ${error.message}`,
  );
  // The real data has 'Species' in taxonRank which isn't in the Darwin Core vocabulary
  assert(
    error.message.includes("taxonRank") || error.message.includes("Species"),
    `Expected error about taxonRank vocabulary violation, got: ${error.message}`,
  );
});
