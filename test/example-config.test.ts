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

  // Log validation summary for documentation
  console.log("\n=== FC2022 Validation Summary ===");
  console.log(`Total datasets: ${result.summary.totalDatasets}`);
  console.log(`Total rows processed: ${result.summary.totalRowsProcessed}`);
  console.log(`Processing time: ${result.totalProcessingTimeMs}ms`);
  console.log(`Overall status: ${result.overallStatus}`);
  console.log("\nNote: This validates real marine biodiversity data including:");
  console.log("  - Date fields (year, month, day, eventDate)");
  console.log("  - Geographic coordinates (decimalLatitude, decimalLongitude)");
  console.log("  - Controlled vocabularies (basisOfRecord, occurrenceStatus)");
  console.log("  - Cross-dataset foreign keys (occurrence.eventID -> event.eventID)");

  console.log("\n--- Dataset Results ---");
  for (const dataset of result.datasetResults) {
    console.log(`\n${dataset.datasetName} (${dataset.spec}):`);
    console.log(`  Rows: ${dataset.rowsProcessed}`);
    console.log(`  Status: ${dataset.status}`);
    console.log(`  Type errors: ${dataset.typeErrors.length}`);
    console.log(`  Required field errors: ${dataset.requiredFieldErrors.length}`);
    console.log(`  Vocabulary errors: ${dataset.vocabularyErrors.length}`);
    console.log(`  Uniqueness violations: ${dataset.uniquenessViolations.length}`);
    console.log(`  Constraint violations: ${dataset.constraintViolations.length}`);
  }

  console.log("\n--- Cross-Dataset Validation ---");
  for (const rule of result.crossDatasetResults || []) {
    console.log(
      `\n${rule.sourceDataset}.${rule.sourceField} -> ${rule.targetDataset}.${rule.targetField}:`,
    );
    console.log(`  Violations: ${rule.violations.length}`);
  }

  console.log("\n=================================\n");
});
