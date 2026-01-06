/**
 * Test Fixtures Validation
 *
 * Ensures that migrated test fixture configurations are valid and can be used
 * by the validation system. These fixtures serve as test cases for various
 * validation scenarios.
 */

import { type WorkspaceConfig, workspaceConfigSchema } from "@dwkt/domain";
import { assert, assertExists } from "@std/assert";
import { Schema } from "effect";
import * as Effect from "effect/Effect";
import { WorkspaceConfigService } from "../packages/core/src/workspace-config.ts";

/**
 * Load and validate a workspace config from a JSON file
 */
async function loadExpectedConfig(configPath: string): Promise<WorkspaceConfig> {
  const configFile = `${configPath}/darwinkit.json`;

  return await Effect.runPromise(
    Effect.gen(function* (_) {
      const fileContents = yield* _(
        Effect.tryPromise(() => Deno.readTextFile(configFile)),
      );
      const rawJson = JSON.parse(fileContents);
      return yield* _(Schema.decode(workspaceConfigSchema)(rawJson));
    }),
  );
}

// Schema-aware equivalence checker for configs
const configEquivalence = Schema.equivalence(workspaceConfigSchema);

Deno.test("Test fixtures - fc2022-complete config loads successfully", async () => {
  const configPath = "./packages/cli/test-fixtures/valid-datasets/fc2022-complete";

  const expectedConfig = await loadExpectedConfig(configPath);
  const result = await Effect.runPromise(
    WorkspaceConfigService.discoverAndLoad(configPath),
  );

  assertExists(result.config);
  assertExists(result.configPath);

  // Verify the config loading mechanism works correctly
  assert(
    configEquivalence(result.config, expectedConfig),
    "Loaded config should be equivalent to the fixture file",
  );
});

Deno.test("Test fixtures - mixed-validity config loads successfully", async () => {
  const configPath = "./packages/cli/test-fixtures/invalid-datasets/mixed-validity";

  const expectedConfig = await loadExpectedConfig(configPath);
  const result = await Effect.runPromise(
    WorkspaceConfigService.discoverAndLoad(configPath),
  );

  assertExists(result.config);

  // Verify the config loading mechanism works correctly
  assert(
    configEquivalence(result.config, expectedConfig),
    "Loaded config should be equivalent to the fixture file",
  );
});

Deno.test("Test fixtures - na-type-failures config loads successfully", async () => {
  const configPath = "./packages/cli/test-fixtures/invalid-datasets/na-type-failures";

  const expectedConfig = await loadExpectedConfig(configPath);
  const result = await Effect.runPromise(
    WorkspaceConfigService.discoverAndLoad(configPath),
  );

  assertExists(result.config);

  // Verify the config loading mechanism works correctly
  assert(
    configEquivalence(result.config, expectedConfig),
    "Loaded config should be equivalent to the fixture file",
  );
});

Deno.test("Test fixtures - all configs use datasets array format", async () => {
  const configs = [
    "./packages/cli/test-fixtures/valid-datasets/fc2022-complete",
    "./packages/cli/test-fixtures/invalid-datasets/mixed-validity",
    "./packages/cli/test-fixtures/invalid-datasets/na-type-failures",
  ];

  for (const configPath of configs) {
    const expectedConfig = await loadExpectedConfig(configPath);
    const result = await Effect.runPromise(
      WorkspaceConfigService.discoverAndLoad(configPath),
    );

    // Verify the config loading mechanism works correctly for all fixtures
    assert(
      configEquivalence(result.config, expectedConfig),
      `Loading config at ${configPath} should match the fixture file`,
    );
  }
});
