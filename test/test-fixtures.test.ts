/**
 * Test Fixtures Validation
 *
 * Ensures that migrated test fixture configurations are valid and can be used
 * by the validation system. These fixtures serve as test cases for various
 * validation scenarios.
 */

import { assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import { WorkspaceConfigService } from "../packages/core/src/workspace/workspace-config-service.ts";

Deno.test("Test fixtures - fc2022-complete config loads successfully", async () => {
  const configPath = "./packages/cli/test-fixtures/valid-datasets/fc2022-complete";

  // Test that config can be discovered and loaded
  const result = await Effect.runPromise(
    WorkspaceConfigService.discoverAndLoad(configPath),
  );

  assertExists(result);
  assertExists(result.config);
  assertExists(result.configPath);

  // Verify structure
  assertEquals(result.config.id, "fc2022-complete-test-fixture");
  assertEquals(result.config.name, "FC2022 Marine Biodiversity Dataset");

  // Verify config has validation settings and datasets
  assertEquals("validation" in result.config, true, "Config should have validation settings");
  assertEquals("datasets" in result.config, true, "Config should have datasets");

  // Type assertion after runtime validation
  const config = result.config as typeof result.config & {
    validation: unknown;
    // deno-lint-ignore no-explicit-any
    datasets: any[];
  };

  assertEquals(config.datasets.length, 3);

  // Verify datasets are present
  const datasetNames = config.datasets.map((d: { name: string }) => d.name);
  assertEquals(datasetNames.includes("event_data"), true);
  assertEquals(datasetNames.includes("occurrence_data"), true);
  assertEquals(datasetNames.includes("emof_data"), true);

  // Verify specs are correct
  const eventDataset = config.datasets.find((d: { name: string }) => d.name === "event_data");
  assertExists(eventDataset);
  assertEquals(eventDataset?.spec, "dwc-event");

  const occurrenceDataset = config.datasets.find((d: { name: string }) =>
    d.name === "occurrence_data"
  );
  assertExists(occurrenceDataset);
  assertEquals(occurrenceDataset?.spec, "dwc-occurrence");

  const emofDataset = config.datasets.find((d: { name: string }) => d.name === "emof_data");
  assertExists(emofDataset);
  assertEquals(emofDataset?.spec, "dwc-extendedMeasurementOrFact");

  // Verify cross-dataset rules
  assertEquals(result.config.crossDatasetRules?.length, 2);
});

Deno.test("Test fixtures - mixed-validity config loads successfully", async () => {
  const configPath = "./packages/cli/test-fixtures/invalid-datasets/mixed-validity";

  // Test that config can be discovered and loaded
  const result = await Effect.runPromise(
    WorkspaceConfigService.discoverAndLoad(configPath),
  );

  assertExists(result);
  assertExists(result.config);

  // Verify structure
  assertEquals(result.config.id, "mixed-validity-test-fixture");
  assertEquals(result.config.name, "Mixed Valid/Invalid Dataset");

  // Verify config has validation settings and datasets
  assertEquals("validation" in result.config, true, "Config should have validation settings");
  assertEquals("datasets" in result.config, true, "Config should have datasets");

  // Type assertion after runtime validation
  const config = result.config as typeof result.config & {
    validation: unknown;
    // deno-lint-ignore no-explicit-any
    datasets: any[];
  };

  assertEquals(config.datasets.length, 1);

  // Verify dataset
  const dataset = config.datasets[0];
  assertEquals(dataset?.name, "occurrence_data");
  assertEquals(dataset?.spec, "dwc-occurrence");
  assertEquals(dataset?.path, "data/mixed_occ.csv");
});

Deno.test("Test fixtures - na-type-failures config loads successfully", async () => {
  const configPath = "./packages/cli/test-fixtures/invalid-datasets/na-type-failures";

  // Test that config can be discovered and loaded
  const result = await Effect.runPromise(
    WorkspaceConfigService.discoverAndLoad(configPath),
  );

  assertExists(result);
  assertExists(result.config);

  // Verify structure
  assertEquals(result.config.id, "na-type-failures-test-fixture");
  assertEquals(result.config.name, "Invalid Dataset - NA Type Failures");

  // Verify config has validation settings and datasets
  assertEquals("validation" in result.config, true, "Config should have validation settings");
  assertEquals("datasets" in result.config, true, "Config should have datasets");

  // Type assertion after runtime validation
  const config = result.config as typeof result.config & {
    validation: { nullValues: string[] };
    // deno-lint-ignore no-explicit-any
    datasets: any[];
  };

  assertEquals(config.datasets.length, 1);

  // Verify validation settings - NA should NOT be in nullValues
  assertEquals(config.validation.nullValues.includes("NA"), false);
  assertEquals(config.validation.nullValues.includes("N/A"), false);
  assertEquals(config.validation.nullValues.includes(""), true);
  assertEquals(config.validation.nullValues.includes("NULL"), true);
});

Deno.test("Test fixtures - all configs use datasets array format", async () => {
  const configs = [
    "./packages/cli/test-fixtures/valid-datasets/fc2022-complete",
    "./packages/cli/test-fixtures/invalid-datasets/mixed-validity",
    "./packages/cli/test-fixtures/invalid-datasets/na-type-failures",
  ];

  for (const configPath of configs) {
    const result = await Effect.runPromise(
      WorkspaceConfigService.discoverAndLoad(configPath),
    );

    // Verify config has validation settings and datasets
    assertEquals(
      "validation" in result.config,
      true,
      `Config at ${configPath} should have validation settings`,
    );
    assertEquals(
      "datasets" in result.config,
      true,
      `Config at ${configPath} should have datasets`,
    );

    // Type assertion after runtime validation
    const config = result.config as typeof result.config & {
      validation: unknown;
      // deno-lint-ignore no-explicit-any
      datasets: any[];
    };

    // Verify datasets is an array
    assertEquals(Array.isArray(config.datasets), true);

    // Verify each dataset has required fields
    for (const dataset of config.datasets) {
      assertExists(dataset?.name, `Dataset should have name in ${configPath}`);
      assertExists(dataset?.spec, `Dataset should have spec in ${configPath}`);
      assertExists(dataset?.path, `Dataset should have path in ${configPath}`);
      assertExists(dataset?.fieldMappings, `Dataset should have fieldMappings in ${configPath}`);
      assertEquals(
        Array.isArray(dataset?.fieldMappings),
        true,
        `fieldMappings should be array in ${configPath}`,
      );
    }
  }
});
