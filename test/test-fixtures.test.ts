/**
 * Test Fixtures Validation
 *
 * Ensures that migrated test fixture configurations are valid and can be used
 * by the validation system. These fixtures serve as test cases for various
 * validation scenarios.
 */

import { Workspace } from "@dwkt/core";
import { type WorkspaceConfig, workspaceConfigSchema } from "@dwkt/domain";
import { assert, assertExists } from "@std/assert";
import { parse as parseYAML } from "@std/yaml";
import { Schema } from "effect";
import * as Effect from "effect/Effect";

/**
 * Load and validate a workspace config from a YAML file
 */
async function loadExpectedConfig(configPath: string): Promise<WorkspaceConfig> {
  const configFile = `${configPath}/darwinkit.yaml`;

  return await Effect.runPromise(
    Effect.gen(function* (_) {
      const fileContents = yield* _(
        Effect.tryPromise(() => Deno.readTextFile(configFile)),
      );
      const rawConfig = parseYAML(fileContents);
      return yield* _(Schema.decodeUnknown(workspaceConfigSchema)(rawConfig));
    }),
  );
}

// Schema-aware equivalence checker for configs
const configEquivalence = Schema.equivalence(workspaceConfigSchema);

Deno.test("Test fixtures - fc2022-complete config loads successfully", async () => {
  const configPath = "./packages/cli/test-fixtures/valid-datasets/fc2022-complete";

  const expectedConfig = await loadExpectedConfig(configPath);
  const result = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* (_) {
        const workspace = yield* _(Workspace.open(configPath));
        return { config: workspace.config, configPath: workspace.configPath };
      }),
    ),
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
    Effect.scoped(
      Effect.gen(function* (_) {
        const workspace = yield* _(Workspace.open(configPath));
        return { config: workspace.config, configPath: workspace.configPath };
      }),
    ),
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
    Effect.scoped(
      Effect.gen(function* (_) {
        const workspace = yield* _(Workspace.open(configPath));
        return { config: workspace.config, configPath: workspace.configPath };
      }),
    ),
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
      Effect.scoped(
        Effect.gen(function* (_) {
          const workspace = yield* _(Workspace.open(configPath));
          return { config: workspace.config, configPath: workspace.configPath };
        }),
      ),
    );

    // Verify the config loading mechanism works correctly for all fixtures
    assert(
      configEquivalence(result.config, expectedConfig),
      `Loading config at ${configPath} should match the fixture file`,
    );
  }
});
