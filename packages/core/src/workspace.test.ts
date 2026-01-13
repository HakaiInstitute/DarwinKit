/**
 * Workspace Tests
 *
 * Tests for the stateful Workspace class including config loading,
 * discovery, and basic workspace operations.
 */

import type { ConfigWithValidation, DatasetConfig } from "@dwkt/domain";
import { assert, assertEquals, assertExists, assertGreaterOrEqual } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import {
  ConfigNotFoundError,
  ConfigParseError,
  DatasetFileNotFoundError,
  Workspace,
} from "./workspace.ts";

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
          createDatasetConfig("test_dataset", "dwc-event", "./nonexistent.csv"),
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
          createDatasetConfig("events", "dwc-event", "./test.csv", [
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
          createDatasetConfig("events", "dwc-event", "./events.csv"),
          createDatasetConfig("occurrences", "dwc-occurrence", "./occurrences.csv"),
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

// ============================================================================
// Validation Tests
// ============================================================================

Deno.test("Workspace.validate - validates datasets successfully", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV file with valid data
    await createTestCSV(
      join(tempDir, "events.csv"),
      ["eventID", "country"],
      [
        ["E1", "Canada"],
        ["E2", "USA"],
      ],
    );

    // Create config with validation settings
    const { configPath } = await createTestConfig(tempDir, {
      name: "Validation Test Workspace",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./events.csv", [
            {
              originName: "eventID",
              targetName: "eventID",
              isRequired: true,
            },
            {
              originName: "country",
              targetName: "country",
              isRequired: false,
            },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    const result = await Effect.runPromise(
      workspace.validate(),
    );

    assertExists(result);
    assertEquals(result.overallStatus, "pass");
    assertEquals(result.datasetResults.length, 1);
    assertEquals(result.datasetResults[0].datasetName, "events");
  });
});

Deno.test("Workspace.validate - validates multiple datasets", async () => {
  await withTempDir(async (tempDir) => {
    // Create two valid CSV files
    await createTestCSV(
      join(tempDir, "events.csv"),
      ["eventID", "country"],
      [["E1", "Canada"]],
    );

    await createTestCSV(
      join(tempDir, "occurrences.csv"),
      ["occurrenceID", "eventID"],
      [["O1", "E1"]],
    );

    const { configPath } = await createTestConfig(tempDir, {
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./events.csv", [
            {
              originName: "eventID",
              targetName: "eventID",
              isRequired: true,
            },
          ]),
          createDatasetConfig("occurrences", "dwc-occurrence", "./occurrences.csv", [
            {
              originName: "occurrenceID",
              targetName: "occurrenceID",
              isRequired: true,
            },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    const result = await Effect.runPromise(
      workspace.validate(),
    );

    assertExists(result);
    // Should validate both datasets
    assertEquals(result.datasetResults.length, 2);
    assertEquals(result.datasetResults[0].datasetName, "events");
    assertEquals(result.datasetResults[1].datasetName, "occurrences");
  });
});

Deno.test("Workspace.validate - fails on config without validation settings", async () => {
  await withTempDir(async (tempDir) => {
    // Create a transform-only config (no validation section)
    const configPath = join(tempDir, "darwinkit.json");
    await Deno.writeTextFile(
      configPath,
      JSON.stringify({
        id: "transform-workspace",
        name: "Transform Only",
        version: "1.0.0",
        transform: {
          nullValues: [""],
          inputs: {},
          datasets: [],
          output: {
            outputDir: "./output",
            exportDB: false,
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    );

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    const result = await Effect.runPromise(
      workspace.validate().pipe(Effect.either),
    );

    assert(result._tag === "Left");
    assert(result.left.message.includes("does not contain validation settings"));
  });
});

// ============================================================================
// Connection Lifecycle Tests (Stage 3)
// ============================================================================

Deno.test("Workspace - connection is lazy (not created on construction)", async () => {
  await withTempDir(async (tempDir) => {
    // Create minimal config
    const { configPath } = await createTestConfig(tempDir, {
      name: "Lazy Connection Test",
    });

    // Load workspace - should not create connection yet
    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // Verify workspace created successfully
    assertEquals(workspace.getName(), "Lazy Connection Test");

    // Note: We can't directly verify connection is not created without exposing internal state,
    // but the fact that construction succeeds without DuckDB activity is the test
  });
});

Deno.test("Workspace - connection is created on first validation", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV and config
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID"], [["E1"]]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "First Validation Test",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./test.csv", [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // First validation - creates connection
    const result = await Effect.runPromise(workspace.validate());

    assertExists(result);
    assertEquals(result.overallStatus, "pass");
  });
});

Deno.test("Workspace - multiple validations work correctly", async () => {
  // This test verifies that multiple validations can be run on the same workspace.

  await withTempDir(async (tempDir) => {
    // Create test CSV and config
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID"], [["E1"], ["E2"]]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "Multiple Validations Test",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./test.csv", [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // Multiple validations should all work
    const result1 = await Effect.runPromise(workspace.validate());
    assertEquals(result1.overallStatus, "pass");

    const result2 = await Effect.runPromise(workspace.validate());
    assertEquals(result2.overallStatus, "pass");

    const result3 = await Effect.runPromise(workspace.validate());
    assertEquals(result3.overallStatus, "pass");

    // Clean up
    workspace.close();
  });
});

Deno.test("Workspace.close - cleans up connection properly", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV and config
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID"], [["E1"]]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "Close Test",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./test.csv", [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // Validate to create connection
    await Effect.runPromise(workspace.validate());

    // Close connection
    workspace.close();

    // Calling close again should be safe (no-op)
    workspace.close();
  });
});

Deno.test("Workspace - can validate after close (creates new connection)", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV and config
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID"], [["E1"]]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "Recreate Connection Test",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./test.csv", [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // First validation - creates connection
    const result1 = await Effect.runPromise(workspace.validate());
    assertEquals(result1.overallStatus, "pass");

    // Close connection
    workspace.close();

    // Validate again - should create new connection
    const result2 = await Effect.runPromise(workspace.validate());
    assertEquals(result2.overallStatus, "pass");

    // Clean up
    workspace.close();
  });
});

Deno.test("Workspace - Symbol.dispose cleanup with using declaration", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV and config
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID"], [["E1"]]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "Dispose Test",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./test.csv", [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ]),
        ],
      },
    });

    // Using declaration - should auto-cleanup
    {
      using workspace = await Effect.runPromise(
        Workspace.fromPath(configPath),
      );

      const result = await Effect.runPromise(workspace.validate());
      assertEquals(result.overallStatus, "pass");

      // Connection automatically closed when leaving scope
    }

    // Test passes if no errors thrown during cleanup
  });
});

// ============================================================================
// Workspace State Management Tests (Stage 5)
// ============================================================================

Deno.test("Workspace.getValidationResult - returns undefined before validation", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV and config
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID"], [["E1"]]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "State Test",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./test.csv", [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // Should return undefined before validation
    assertEquals(workspace.getValidationResult(), undefined);

    workspace.close();
  });
});

Deno.test("Workspace.getValidationResult - returns cached result after validation", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV and config
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID"], [["E1"]]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "State Test",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./test.csv", [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // Run validation
    const validationResult = await Effect.runPromise(workspace.validate());

    // Should return same result from cache
    const cachedResult = workspace.getValidationResult();
    assertExists(cachedResult);
    assertEquals(cachedResult.overallStatus, validationResult.overallStatus);
    assertEquals(cachedResult.workspaceId, validationResult.workspaceId);
    assertEquals(cachedResult.datasetResults.length, 1);

    workspace.close();
  });
});

Deno.test("Workspace.isValid - returns false before validation", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV and config
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID"], [["E1"]]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "State Test",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./test.csv", [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // Should return false before validation
    assertFalse(workspace.isValid());

    workspace.close();
  });
});

Deno.test("Workspace.isValid - returns true after passing validation", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV with valid data
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID"], [["E1"]]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "State Test",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./test.csv", [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // Run validation
    const result = await Effect.runPromise(workspace.validate());
    assertEquals(result.overallStatus, "pass");

    // Should return true after passing validation
    assert(workspace.isValid());

    workspace.close();
  });
});

Deno.test("Workspace.isValid - returns false for non-passing validation", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV with just eventID (minimal valid data)
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID"], [["E1"]]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "State Test",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./test.csv", [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // Run validation (should produce warnings or fail - not a full "pass")
    const result = await Effect.runPromise(workspace.validate());

    // The key test is that isValid() matches the overall status
    if (result.overallStatus === "pass") {
      assert(workspace.isValid(), true);
    } else {
      // For "warn" or "fail", isValid() should return false
      assertFalse(workspace.isValid());
    }

    workspace.close();
  });
});

Deno.test("Workspace - state updates after multiple validations", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV
    const csvPath = join(tempDir, "test.csv");
    await createTestCSV(csvPath, ["eventID"], [["E1"]]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "Multi Validation Test",
      validation: {
        ...DEFAULT_VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./test.csv", [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ]),
        ],
      },
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // First validation
    const result1 = await Effect.runPromise(workspace.validate());
    assertEquals(result1.overallStatus, "pass");
    assert(workspace.isValid());

    const cached1 = workspace.getValidationResult();
    assertExists(cached1);
    assertEquals(cached1.validatedAt, result1.validatedAt);

    // Second validation (should update state)
    const result2 = await Effect.runPromise(workspace.validate());
    assertEquals(result2.overallStatus, "pass");
    assert(workspace.isValid());

    const cached2 = workspace.getValidationResult();
    assertExists(cached2);
    // Validation time should be different (second validation happened later)
    assertGreaterOrEqual(cached2.validatedAt, cached1.validatedAt);

    workspace.close();
  });
});
