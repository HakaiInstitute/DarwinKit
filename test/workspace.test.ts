/**
 * Workspace Integration Tests
 *
 * Integration-level tests for Workspace class functionality using real config files
 * and datasets. Tests the complete workflow from discovery to validation.
 *
 * Note: Unit-level tests for Workspace are in packages/core/src/workspace.test.ts
 */

import { assert, assertEquals, assertExists, assertInstanceOf, assertRejects } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";

import { DatasetFileNotFoundError, Workspace } from "@dwkt/core";

import { cleanupTempDir, createTempDir } from "./helpers/workspace-test-utils.ts";

import { createTestConfig, writeCsvFile } from "./helpers/config-utils.ts";

// ============================================================================
// Test Constants
// ============================================================================

const TEST_CONFIG_DIR = join(Deno.cwd(), "test", "example-config");

// ============================================================================
// Config Discovery & Loading Tests
// ============================================================================

Deno.test("Workspace - discover config in current directory", async () => {
  const tempDir = await createTempDir();

  try {
    // Create config with valid dataset
    await writeCsvFile(tempDir, "test", [{ eventID: "1" }, { eventID: "2" }]);

    await createTestConfig(tempDir, {
      validation: {
        datasets: [{
          name: "test",
          spec: "dwc-event",
          path: "./test.csv",
          fieldMappings: [],
        }],
        nullValues: ["", "NA"],
        failFast: false,
        outputDir: "./output",
      },
    });

    // Discover from directory
    const workspace = await Effect.runPromise(Workspace.discover(tempDir));

    assertEquals(workspace.getName(), "Test Workspace");
    assertEquals(workspace.getVersion(), "1.0.0");
    assertExists(workspace.getConfigPath());

    workspace.close();
  } finally {
    await cleanupTempDir(tempDir);
  }
});

Deno.test("Workspace - discover config in parent directory", async () => {
  const tempDir = await createTempDir();

  try {
    // Create config in temp dir
    await writeCsvFile(tempDir, "test", [{ eventID: "1" }]);

    await createTestConfig(tempDir, {
      validation: {
        datasets: [{
          name: "test",
          spec: "dwc-event",
          path: "./test.csv",
          fieldMappings: [],
        }],
        nullValues: ["", "NA"],
        failFast: false,
        outputDir: "./output",
      },
    });

    // Create subdirectory
    const subDir = join(tempDir, "subdir");
    await Deno.mkdir(subDir);

    // Discover from subdirectory (should find parent config)
    const workspace = await Effect.runPromise(Workspace.discover(subDir));

    assertEquals(workspace.getName(), "Test Workspace");
    assert(workspace.getConfigPath().includes(tempDir));

    workspace.close();
  } finally {
    await cleanupTempDir(tempDir);
  }
});

Deno.test("Workspace - load from specific config path", async () => {
  const tempDir = await createTempDir();

  try {
    await writeCsvFile(tempDir, "test", [{ eventID: "1" }]);

    const { configPath } = await createTestConfig(tempDir, {
      validation: {
        datasets: [{
          name: "test",
          spec: "dwc-event",
          path: "./test.csv",
          fieldMappings: [],
        }],
        nullValues: ["", "NA"],
        failFast: false,
        outputDir: "./output",
      },
    });

    // Load directly from path
    const workspace = await Effect.runPromise(Workspace.fromPath(configPath));

    assertEquals(workspace.getConfigPath(), configPath);
    assertEquals(workspace.getName(), "Test Workspace");

    workspace.close();
  } finally {
    await cleanupTempDir(tempDir);
  }
});

// ============================================================================
// Error Handling Tests
// ============================================================================

Deno.test("Workspace - error on missing config file", async () => {
  const tempDir = await createTempDir();

  try {
    await assertRejects(
      async () => {
        await Effect.runPromise(Workspace.discover(tempDir));
      },
      Error,
      "not found",
    );
  } finally {
    await cleanupTempDir(tempDir);
  }
});

Deno.test("Workspace - error on missing dataset file", async () => {
  const tempDir = await createTempDir();

  try {
    // Create config pointing to non-existent CSV
    await createTestConfig(tempDir, {
      validation: {
        datasets: [{
          name: "missing",
          spec: "dwc-event",
          path: "./nonexistent.csv",
          fieldMappings: [],
        }],
        nullValues: ["", "NA"],
        failFast: false,
        outputDir: "./output",
      },
    });

    // Should fail during discovery (validates dataset paths). Flip to intercept the failure
    const result = await Effect.runPromise(Effect.flip(Workspace.discover(tempDir)));

    assertInstanceOf(result, DatasetFileNotFoundError);
  } finally {
    await cleanupTempDir(tempDir);
  }
});

// ============================================================================
// Workspace Metadata Tests
// ============================================================================

Deno.test("Workspace - access workspace metadata", async () => {
  const tempDir = await createTempDir();

  try {
    await writeCsvFile(tempDir, "events", [{ eventID: "E1" }]);

    const { configPath } = await createTestConfig(tempDir, {
      name: "Marine Survey 2024",
      version: "2.1.0",
      description: "Test survey data",
      validation: {
        datasets: [{
          name: "events",
          spec: "dwc-event",
          path: "./events.csv",
          fieldMappings: [],
        }],
        nullValues: [""],
        failFast: false,
        outputDir: "./output",
      },
    });

    const workspace = await Effect.runPromise(Workspace.fromPath(configPath));

    assertEquals(workspace.getName(), "Marine Survey 2024");
    assertEquals(workspace.getVersion(), "2.1.0");
    assertEquals(workspace.getDescription(), "Test survey data");

    const datasets = workspace.getDatasets();
    assertEquals(datasets.length, 1);
    assertEquals(datasets[0].name, "events");
    assertEquals(datasets[0].spec, "dwc-event");

    const dataset = workspace.getDataset("events");
    assertExists(dataset);
    assertEquals(dataset?.name, "events");

    workspace.close();
  } finally {
    await cleanupTempDir(tempDir);
  }
});

Deno.test("Workspace - getDataset returns undefined for missing dataset", async () => {
  const tempDir = await createTempDir();

  try {
    await writeCsvFile(tempDir, "test", [{ eventID: "1" }]);

    await createTestConfig(tempDir, {
      validation: {
        datasets: [{
          name: "test",
          spec: "dwc-event",
          path: "./test.csv",
          fieldMappings: [],
        }],
        nullValues: ["", "NA"],
        failFast: false,
        outputDir: "./output",
      },
    });

    const workspace = await Effect.runPromise(Workspace.discover(tempDir));

    const missing = workspace.getDataset("nonexistent");
    assertEquals(missing, undefined);

    workspace.close();
  } finally {
    await cleanupTempDir(tempDir);
  }
});

// ============================================================================
// Validation Integration Tests
// ============================================================================

Deno.test("Workspace - validate with passing dataset", async () => {
  const tempDir = await createTempDir();

  try {
    // Create valid event CSV
    await writeCsvFile(tempDir, "events", [
      { eventID: "E1", eventDate: "2024-01-15" },
      { eventID: "E2", eventDate: "2024-01-16" },
    ]);

    // Create config with field mappings
    const { configPath } = await createTestConfig(tempDir, {
      name: "Valid Events",
      validation: {
        datasets: [{
          name: "events",
          spec: "dwc-event",
          path: "./events.csv",
          fieldMappings: [
            { originName: "eventID", targetName: "eventID", isRequired: true },
            { originName: "eventDate", targetName: "eventDate" },
          ],
        }],
        nullValues: [""],
        failFast: false,
        outputDir: "./output",
      },
    });

    const workspace = await Effect.runPromise(Workspace.fromPath(configPath));

    // Run validation
    const result = await Effect.runPromise(workspace.validate());

    assertEquals(result.overallStatus, "pass");
    assertEquals(result.datasetResults.length, 1);
    assertEquals(result.datasetResults[0].datasetName, "events");
    assertEquals(result.datasetResults[0].status, "pass");

    // Check cached validation state
    const cachedResult = workspace.getValidationResult();
    assertExists(cachedResult);
    assertEquals(cachedResult.overallStatus, "pass");
    assert(workspace.isValid());

    workspace.close();
  } finally {
    await cleanupTempDir(tempDir);
  }
});

Deno.test("Workspace - validation state before validation", async () => {
  const tempDir = await createTempDir();

  try {
    await writeCsvFile(tempDir, "test", [{ eventID: "1" }]);

    await createTestConfig(tempDir, {
      validation: {
        datasets: [{
          name: "test",
          spec: "dwc-event",
          path: "./test.csv",
          fieldMappings: [],
        }],
        nullValues: ["", "NA"],
        failFast: false,
        outputDir: "./output",
      },
    });

    const workspace = await Effect.runPromise(Workspace.discover(tempDir));

    // Before validation, state should be undefined
    assertEquals(workspace.getValidationResult(), undefined);
    assertEquals(workspace.isValid(), false);

    workspace.close();
  } finally {
    await cleanupTempDir(tempDir);
  }
});

Deno.test("Workspace - validate updates cached state", async () => {
  const tempDir = await createTempDir();

  try {
    await writeCsvFile(tempDir, "events", [{ eventID: "E1" }, { eventID: "E2" }]);

    const { configPath } = await createTestConfig(tempDir, {
      validation: {
        datasets: [{
          name: "events",
          spec: "dwc-event",
          path: "./events.csv",
          fieldMappings: [
            { originName: "eventID", targetName: "eventID", isRequired: true },
          ],
        }],
        nullValues: [""],
        failFast: false,
        outputDir: "./output",
      },
    });

    const workspace = await Effect.runPromise(Workspace.fromPath(configPath));

    // State before validation
    assertEquals(workspace.getValidationResult(), undefined);

    // Run validation
    await Effect.runPromise(workspace.validate());

    // State after validation
    const cached = workspace.getValidationResult();
    assertExists(cached);
    assertEquals(cached.overallStatus, "pass");
    assert(workspace.isValid());

    workspace.close();
  } finally {
    await cleanupTempDir(tempDir);
  }
});

// ============================================================================
// Connection Management Tests
// ============================================================================

// ============================================================================
// Real Config Integration Test
// ============================================================================

Deno.test("Workspace - validate with real example-config", async () => {
  // This test uses the real example config to ensure the Workspace class
  // works correctly with actual Darwin Core datasets

  const workspace = await Effect.runPromise(Workspace.discover(TEST_CONFIG_DIR));

  try {
    assertEquals(workspace.getName(), "FC2022 Marine Biodiversity Dataset");
    assertEquals(workspace.getVersion(), "1.0.0");

    const datasets = workspace.getDatasets();
    assertEquals(datasets.length, 2);

    // Validate
    const result = await Effect.runPromise(workspace.validate());

    // Should have results for both datasets
    assertEquals(result.datasetResults.length, 2);

    // Should have cross-dataset validation (FK check)
    assert(result.crossDatasetResults.length > 0);

    // Cached state should be available
    assert(workspace.getValidationResult() !== undefined);
  } finally {
    workspace.close();
  }
});
