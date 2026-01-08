/**
 * Workspace Tests
 *
 * Tests for the stateful Workspace class including config loading,
 * discovery, and basic workspace operations.
 */

import type { ConfigWithValidation, DatasetConfig } from "@dwkt/domain";
import { assert, assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import {
  ConfigNotFoundError,
  ConfigParseError,
  DatasetFileNotFoundError,
} from "./workspace-config.ts";
import { Workspace } from "./workspace.ts";

// ============================================================================
// Test Constants & Fixtures
// ============================================================================

const TEST_CONFIG_FILENAME = "darwinkit.json";
const TEST_DIR_PREFIX = "workspace_test_";

/** Default validation settings used across tests */
const DEFAULT_VALIDATION_SETTINGS = {
  nullValues: ["", "NA"],
  failFast: false,
  outputDir: "./output",
} as const;

/** Factory for creating dataset configurations */
const createDatasetConfig = (
  name: string,
  spec: string,
  path: string,
  fieldMappings: DatasetConfig["fieldMappings"] = [],
): DatasetConfig => ({
  name,
  spec,
  path,
  fieldMappings,
});

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Run a test with automatic temp directory cleanup
 *
 * This helper eliminates the repetitive try-finally pattern by:
 * - Creating a temp directory before the test
 * - Passing it to the test function
 * - Cleaning up automatically, even if the test fails
 */
async function withTempDir(
  testFn: (tempDir: string) => Promise<void>,
): Promise<void> {
  const tempDir = await Deno.makeTempDir({ prefix: TEST_DIR_PREFIX });
  try {
    await testFn(tempDir);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

/**
 * Create a test workspace configuration file
 */
async function createTestConfig(
  tempDir: string,
  config?: Partial<ConfigWithValidation>,
): Promise<{ config: ConfigWithValidation; configPath: string }> {
  const fullConfig: ConfigWithValidation = {
    id: config?.id ?? "test-workspace",
    name: config?.name ?? "Test Workspace",
    version: config?.version ?? "1.0.0",
    description: config?.description,
    validation: {
      ...DEFAULT_VALIDATION_SETTINGS,
      datasets: [],
      ...config?.validation,
    },
    createdAt: config?.createdAt ?? new Date(),
    updatedAt: config?.updatedAt ?? new Date(),
  };

  const configPath = join(tempDir, TEST_CONFIG_FILENAME);
  await Deno.writeTextFile(configPath, JSON.stringify(fullConfig, null, 2));

  return { config: fullConfig, configPath };
}

/**
 * Create a test CSV file
 */
async function createTestCSV(
  filePath: string,
  headers: string[],
  rows: string[][] = [],
): Promise<void> {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  await Deno.writeTextFile(filePath, csvContent);
}

/**
 * Test that an Effect fails with a specific error type
 *
 * This eliminates the repetitive Effect.either pattern by:
 * - Running the effect and converting to Either
 * - Asserting it failed (Left)
 * - Asserting the error type matches
 *
 * @template E - The error type expected in the failure channel
 * @param effect - The Effect to test
 * @param errorType - Constructor for the expected error type (must be a tagged error)
 *
 * @example
 * ```typescript
 * await assertEffectFails(
 *   Workspace.discover("/nonexistent"),
 *   ConfigNotFoundError
 * );
 * ```
 */
async function assertEffectFails<E>(
  effect: Effect.Effect<unknown, E>,
  errorType: abstract new (...args: never[]) => E,
): Promise<void> {
  const result = await Effect.runPromise(effect.pipe(Effect.either));

  assert(result._tag === "Left", "Expected effect to fail");
  assert(
    result.left instanceof errorType,
    `Expected error type ${errorType.name}, got ${result.left?.constructor.name}`,
  );
}

// ============================================================================
// Discovery Tests
// ============================================================================

Deno.test("Workspace.discover - finds config in current directory", async () => {
  await withTempDir(async (tempDir) => {
    const { config } = await createTestConfig(tempDir, {
      name: "Current Dir Workspace",
    });

    const workspace = await Effect.runPromise(
      Workspace.discover(tempDir),
    );

    assertExists(workspace);
    assertEquals(workspace.getName(), config.name);
    assertEquals(workspace.getVersion(), config.version);
    assertEquals(workspace.getConfigPath(), join(tempDir, TEST_CONFIG_FILENAME));
  });
});

Deno.test("Workspace.discover - finds config in parent directory", async () => {
  await withTempDir(async (tempDir) => {
    const subDir = join(tempDir, "subdir", "nested");
    await Deno.mkdir(subDir, { recursive: true });

    const { config } = await createTestConfig(tempDir, {
      name: "Parent Dir Workspace",
    });

    const workspace = await Effect.runPromise(
      Workspace.discover(subDir),
    );

    assertExists(workspace);
    assertEquals(workspace.getName(), config.name);
    assertEquals(workspace.getConfigPath(), join(tempDir, TEST_CONFIG_FILENAME));
  });
});

Deno.test("Workspace.discover - fails when no config found", async () => {
  await withTempDir(async (tempDir) => {
    await assertEffectFails(
      Workspace.discover(tempDir),
      ConfigNotFoundError,
    );
  });
});

// ============================================================================
// fromPath Tests
// ============================================================================

Deno.test("Workspace.fromPath - loads config from specific path", async () => {
  await withTempDir(async (tempDir) => {
    const { config, configPath } = await createTestConfig(tempDir, {
      name: "Specific Path Workspace",
      version: "2.0.0",
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    assertExists(workspace);
    assertEquals(workspace.getName(), config.name);
    assertEquals(workspace.getVersion(), config.version);
    assertEquals(workspace.getConfigPath(), configPath);
  });
});

Deno.test("Workspace.fromPath - fails on invalid JSON", async () => {
  await withTempDir(async (tempDir) => {
    const configPath = join(tempDir, TEST_CONFIG_FILENAME);
    await Deno.writeTextFile(configPath, "{ invalid json }");

    await assertEffectFails(
      Workspace.fromPath(configPath),
      ConfigParseError,
    );
  });
});

Deno.test("Workspace.fromPath - validates dataset file paths exist", async () => {
  await withTempDir(async (tempDir) => {
    const { configPath } = await createTestConfig(tempDir, {
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("test_dataset", "Event", "./nonexistent.csv"),
        ],
      },
    });

    await assertEffectFails(
      Workspace.fromPath(configPath),
      DatasetFileNotFoundError,
    );
  });
});

Deno.test("Workspace.fromPath - succeeds when dataset files exist", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV file
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID", "country"], [
      ["E1", "Canada"],
      ["E2", "USA"],
    ]);

    // Create config referencing the CSV
    const { config, configPath } = await createTestConfig(tempDir, {
      name: "Valid Dataset Workspace",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "Event", "./test.csv", [
            {
              originName: "eventID",
              targetName: "eventID",
              isRequired: true,
            },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    assertExists(workspace);
    assertEquals(workspace.getName(), config.name);

    const workspaceConfig = workspace.getConfig();
    assert("validation" in workspaceConfig);
    assertEquals(
      workspaceConfig.validation.datasets.length,
      config.validation.datasets.length,
    );
    assertEquals(
      workspaceConfig.validation.datasets[0].name,
      config.validation.datasets[0].name,
    );
  });
});

// ============================================================================
// Getter Tests
// ============================================================================

Deno.test("Workspace - getters return correct values", async () => {
  await withTempDir(async (tempDir) => {
    const expectedConfig: Partial<ConfigWithValidation> = {
      name: "Getter Test Workspace",
      version: "3.2.1",
      description: "Testing all the getter methods",
    };

    await createTestConfig(tempDir, expectedConfig);

    const workspace = await Effect.runPromise(
      Workspace.discover(tempDir),
    );

    assertEquals(workspace.getName(), expectedConfig.name);
    assertEquals(workspace.getVersion(), expectedConfig.version);
    assertEquals(workspace.getDescription(), expectedConfig.description);

    const workspaceConfig = workspace.getConfig();
    assertExists(workspaceConfig);
    assertEquals(workspaceConfig.name, expectedConfig.name);

    const configPath = workspace.getConfigPath();
    assertEquals(configPath, join(tempDir, TEST_CONFIG_FILENAME));
  });
});

Deno.test("Workspace - handles missing optional fields", async () => {
  await withTempDir(async (tempDir) => {
    // Create config without description (it's optional)
    const { config, configPath } = await createTestConfig(tempDir, {
      name: "Minimal Workspace",
      description: undefined,
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    assertEquals(workspace.getName(), config.name);
    assertEquals(workspace.getVersion(), config.version);
    assertEquals(workspace.getDescription(), undefined);
  });
});

// ============================================================================
// Multi-Dataset Tests
// ============================================================================

Deno.test("Workspace - multiple datasets validation", async () => {
  await withTempDir(async (tempDir) => {
    // Create multiple CSV files
    await createTestCSV(
      join(tempDir, "events.csv"),
      ["eventID", "country"],
    );
    await createTestCSV(
      join(tempDir, "occurrences.csv"),
      ["occurrenceID", "eventID"],
    );

    // Create config with multiple datasets
    const { config } = await createTestConfig(tempDir, {
      name: "Multi Dataset Workspace",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "Event", "./events.csv"),
          createDatasetConfig("occurrences", "Occurrence", "./occurrences.csv"),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(config.id ? join(tempDir, TEST_CONFIG_FILENAME) : ""),
    );

    const workspaceConfig = workspace.getConfig();
    assert("validation" in workspaceConfig);
    assertEquals(
      workspaceConfig.validation.datasets.length,
      config.validation.datasets.length,
    );
  });
});
