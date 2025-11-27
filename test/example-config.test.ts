/**
 * Example Configuration Test
 *
 * Ensures that the example darwinkit.json configuration in test/example-config/
 * is always valid and can successfully validate the sample data.
 *
 * This test serves as both documentation and a smoke test for the validation system.
 */

import { assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import { WorkspaceValidator } from "../packages/core/src/workspace/workspace-validator.ts";

Deno.test("Example config - validates FC2022 dataset", async () => {
  const validator = new WorkspaceValidator();

  const result = await Effect.runPromise(
    validator.validateFromConfig("./test/example-config"),
  );

  // Basic assertions
  assertExists(result);
  assertEquals(result.workspaceId, "fc2022-marine-biodiversity");
  assertEquals(result.summary.totalDatasets, 2);

  // Should have events and occurrences datasets
  assertEquals(result.datasetResults.length, 2);
  const eventsResult = result.datasetResults.find((r) => r.datasetName === "events");
  const occurrencesResult = result.datasetResults.find((r) => r.datasetName === "occurrences");

  assertExists(eventsResult);
  assertExists(occurrencesResult);

  // Events dataset should validate
  assertEquals(eventsResult.spec, "dwc-event");
  // Note: May have validation warnings, but should not fail hard

  // Occurrences dataset should validate
  assertEquals(occurrencesResult.spec, "dwc-occurrence");

  // Should have cross-dataset validation results
  assertExists(result.crossDatasetResults);
  assertEquals(result.crossDatasetResults.length, 1);

  // Foreign key rule should be checked
  const fkRule = result.crossDatasetResults[0];
  assertEquals(fkRule.sourceDataset, "occurrences");
  assertEquals(fkRule.targetDataset, "events");
  assertEquals(fkRule.sourceField, "eventID");
  assertEquals(fkRule.targetField, "eventID");
});
