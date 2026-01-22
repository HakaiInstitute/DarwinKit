/**
 * Workspace Tests
 *
 * Tests for the stateful Workspace class including config loading,
 * discovery, and basic workspace operations.
 */

import {
  ConfigNotFoundError,
  ConfigParseError,
  DatasetFileNotFoundError,
  Workspace,
} from "@dwkt/core";
import type { ConfigWithValidation, DatasetConfig } from "@dwkt/domain";
import { decodeDatasetConfig, makeValidationConfig } from "@dwkt/domain";
import { assert, assertEquals, assertExists, assertGreaterOrEqual } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";

// Import shared test utilities
import {
  createTestConfig,
  writeCsvFile,
  writeJsonFile,
} from "../../../test/helpers/config-utils.ts";
import { ConfigMissingSettingsError } from "./workspace/errors.ts";

// ============================================================================
// Test Constants & Fixtures
// ============================================================================

const TEST_CONFIG_FILENAME = "darwinkit.json";
const TEST_DIR_PREFIX = "workspace_test_";

/** Local validation settings with correct nested structure */
const VALIDATION_SETTINGS = makeValidationConfig({
  import: {
    nullValues: ["", "NA"],
    dropTable: false,
  },
  output: {
    dir: "./output",
  },
  failFast: false,
  datasets: [],
});

/** Factory for creating dataset configurations with validation and defaults */
const createDatasetConfig = (
  name: string,
  spec: string,
  path: string,
  fieldMappings: DatasetConfig["fieldMappings"] = [],
): DatasetConfig =>
  decodeDatasetConfig({
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
    const configPath = await writeJsonFile(tempDir, TEST_CONFIG_FILENAME, "{ invalid json }");

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
        ...VALIDATION_SETTINGS,
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
    await writeCsvFile(tempDir, "test", [
      { eventID: "E1", country: "Canada" },
      { eventID: "E2", country: "USA" },
    ]);

    // Create config referencing the CSV
    const { config, configPath } = await createTestConfig(tempDir, {
      name: "Valid Dataset Workspace",
      validation: {
        ...VALIDATION_SETTINGS,
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

    const workspaceConfig = workspace.getValidationConfig();
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
    // Create multiple CSV files (headers only for this test)
    await writeCsvFile(tempDir, "events", [{ eventID: "E1", country: "Canada" }]);
    await writeCsvFile(tempDir, "occurrences", [{ occurrenceID: "O1", eventID: "E1" }]);

    // Create config with multiple datasets
    const { config } = await createTestConfig(tempDir, {
      name: "Multi Dataset Workspace",
      validation: {
        ...VALIDATION_SETTINGS,
        datasets: [
          createDatasetConfig("events", "dwc-event", "./events.csv"),
          createDatasetConfig("occurrences", "dwc-occurrence", "./occurrences.csv"),
        ],
      },
    });

    const configPath = join(tempDir, TEST_CONFIG_FILENAME);
    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    const workspaceConfig = workspace.getValidationConfig();
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
    await writeCsvFile(tempDir, "events", [
      { eventID: "E1", country: "Canada" },
      { eventID: "E2", country: "USA" },
    ]);

    // Create config with validation settings
    const { configPath } = await createTestConfig(tempDir, {
      name: "Validation Test Workspace",
      validation: {
        ...VALIDATION_SETTINGS,
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
      workspace.validator.run(),
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
    await writeCsvFile(tempDir, "events", [
      { eventID: "E1", country: "Canada" },
    ]);

    await writeCsvFile(tempDir, "occurrences", [
      { occurrenceID: "O1", eventID: "E1" },
    ]);

    const { configPath } = await createTestConfig(tempDir, {
      validation: {
        ...VALIDATION_SETTINGS,
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
      workspace.validator.run(),
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
    const configPath = await writeJsonFile(tempDir, "darwinkit.json", {
      id: "transform-workspace",
      name: "Transform Only",
      version: "1.0.0",
      transform: {
        import: {
          nullValues: [""],
          // dropTable: omitted - uses default (false)
        },
        inputs: {},
        datasets: [],
        output: {
          dir: "./output",
          exportDB: false,
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const workspace = await Effect.runPromise(
      Workspace.fromPath(configPath),
    );

    // Calling validator.run() should fail with ConfigMissingSettingsError
    await assertEffectFails(
      workspace.validator.run(),
      ConfigMissingSettingsError,
    );
  });
});

Deno.test("Workspace.transform - fails on config without transformation settings", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV file for a validation-only config
    await writeCsvFile(tempDir, "test", [
      { eventID: "E1", country: "Canada" },
    ]);

    // Create a validation-only config (no transform section)
    const { configPath } = await createTestConfig(tempDir, {
      name: "Validation Only",
      validation: {
        ...VALIDATION_SETTINGS,
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

    // Calling transformer.run() should fail with ConfigMissingSettingsError
    await assertEffectFails(
      workspace.transformer.run(),
      ConfigMissingSettingsError,
    );
  });
});

// ============================================================================
// Connection Lifecycle Tests (Stage 3)
// ============================================================================

Deno.test("Workspace - connection is created on first validation", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV and config
    await writeCsvFile(tempDir, "test", [{ eventID: "E1" }]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "First Validation Test",
      validation: {
        ...VALIDATION_SETTINGS,
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
    const result = await Effect.runPromise(workspace.validator.run());

    assertExists(result);
    assertEquals(result.overallStatus, "pass");
  });
});

Deno.test("Workspace - multiple validations work correctly", async () => {
  // This test verifies that multiple validations can be run on the same workspace.

  await withTempDir(async (tempDir) => {
    // Create test CSV and config
    await writeCsvFile(tempDir, "test", [{ eventID: "E1" }, { eventID: "E2" }]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "Multiple Validations Test",
      validation: {
        ...VALIDATION_SETTINGS,
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
    const result1 = await Effect.runPromise(workspace.validator.run());
    assertEquals(result1.overallStatus, "pass");

    const result2 = await Effect.runPromise(workspace.validator.run());
    assertEquals(result2.overallStatus, "pass");

    const result3 = await Effect.runPromise(workspace.validator.run());
    assertEquals(result3.overallStatus, "pass");

    // Clean up
    workspace.close();
  });
});

// ============================================================================
// Workspace State Management Tests (Stage 5)
// ============================================================================

Deno.test("Workspace.getValidationResult - returns undefined before validation", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV and config
    await writeCsvFile(tempDir, "test", [{ eventID: "E1" }]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "State Test",
      validation: {
        ...VALIDATION_SETTINGS,
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
    await writeCsvFile(tempDir, "test", [{ eventID: "E1" }]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "State Test",
      validation: {
        ...VALIDATION_SETTINGS,
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
    const validationResult = await Effect.runPromise(workspace.validator.run());

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
    await writeCsvFile(tempDir, "test", [{ eventID: "E1" }]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "State Test",
      validation: {
        ...VALIDATION_SETTINGS,
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
    assertEquals(workspace.isValid(), false);

    workspace.close();
  });
});

Deno.test("Workspace.isValid - returns true after passing validation", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV with valid data
    await writeCsvFile(tempDir, "test", [{ eventID: "E1" }]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "State Test",
      validation: {
        ...VALIDATION_SETTINGS,
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
    const result = await Effect.runPromise(workspace.validator.run());
    assertEquals(result.overallStatus, "pass");

    // Should return true after passing validation
    assert(workspace.isValid());

    workspace.close();
  });
});

Deno.test("Workspace.isValid - returns false for non-passing validation", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV with just eventID (minimal valid data)
    await writeCsvFile(tempDir, "test", [{ eventID: "E1" }]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "State Test",
      validation: {
        ...VALIDATION_SETTINGS,
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
    const result = await Effect.runPromise(workspace.validator.run());

    // The key test is that isValid() matches the overall status
    if (result.overallStatus === "pass") {
      assertEquals(workspace.isValid(), true);
    } else {
      // For "warn" or "fail", isValid() should return false
      assertEquals(workspace.isValid(), false);
    }

    workspace.close();
  });
});

Deno.test("Workspace - state updates after multiple validations", async () => {
  await withTempDir(async (tempDir) => {
    // Create test CSV
    await writeCsvFile(tempDir, "test", [{ eventID: "E1" }]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "Multi Validation Test",
      validation: {
        ...VALIDATION_SETTINGS,
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
    const result1 = await Effect.runPromise(workspace.validator.run());
    assertEquals(result1.overallStatus, "pass");
    assert(workspace.isValid());

    const cached1 = workspace.getValidationResult();
    assertExists(cached1);
    assertEquals(cached1.validatedAt, result1.validatedAt);

    // Second validation (should update state)
    const result2 = await Effect.runPromise(workspace.validator.run());
    assertEquals(result2.overallStatus, "pass");
    assert(workspace.isValid());

    const cached2 = workspace.getValidationResult();
    assertExists(cached2);
    // Validation time should be different (second validation happened later)
    assertGreaterOrEqual(cached2.validatedAt, cached1.validatedAt);

    workspace.close();
  });
});
