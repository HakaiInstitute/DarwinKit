/**
 * Test Fixtures Validation
 *
 * Ensures that test fixture configurations are valid and can be used by the
 * validation system. These fixtures serve as test cases for various
 * validation scenarios.
 */

import { type WorkspaceConfig, workspaceConfigSchema } from "@dwkt/domain";
import { assert, assertExists } from "@std/assert";
import { Schema } from "effect";
import * as Effect from "effect/Effect";
import { Workspace } from "../packages/core/src/workspace.ts";

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

const assertConfigEquivalence = (expected: WorkspaceConfig, actual: WorkspaceConfig) => {
  assert(
    configEquivalence(expected, actual),
    "Loaded config should be equivalent to the fixture file",
  );
};

// ============================================================================
// Fixture Loading Tests
// ============================================================================

type FixtureLoadingTestCase = {
  description: string;
  configPath: string;
};

const fixtureLoadingTestCases: FixtureLoadingTestCase[] = [
  {
    description: "fc2022-complete config loads successfully",
    configPath: "./packages/cli/test-fixtures/valid-datasets/fc2022-complete",
  },
  {
    description: "mixed-validity config loads successfully",
    configPath: "./packages/cli/test-fixtures/invalid-datasets/mixed-validity",
  },
  {
    description: "na-type-failures config loads successfully",
    configPath: "./packages/cli/test-fixtures/invalid-datasets/na-type-failures",
  },
];

Deno.test("Test fixtures - fixture loading", async (t) => {
  for (const testCase of fixtureLoadingTestCases) {
    await t.step(testCase.description, async () => {
      const expectedConfig = await loadExpectedConfig(testCase.configPath);
      const workspace = await Effect.runPromise(
        Workspace.discover(testCase.configPath),
      );

      assertExists(workspace.getConfig());
      assertConfigEquivalence(expectedConfig, workspace.getConfig());

      workspace.close();
    });
  }
});

Deno.test("Test fixtures - all configs use datasets array format", async () => {
  const configs = [
    "./packages/cli/test-fixtures/valid-datasets/fc2022-complete",
    "./packages/cli/test-fixtures/invalid-datasets/mixed-validity",
    "./packages/cli/test-fixtures/invalid-datasets/na-type-failures",
  ];

  for (const configPath of configs) {
    const expectedConfig = await loadExpectedConfig(configPath);
    const workspace = await Effect.runPromise(
      Workspace.discover(configPath),
    );

    // Verify the config loading mechanism works correctly for all fixtures
    assertConfigEquivalence(
      workspace.getConfig(),
      expectedConfig,
    );

    workspace.close();
  }
});
