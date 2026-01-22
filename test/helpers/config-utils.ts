/**
 * Shared test utilities for creating workspace configurations
 *
 * This module provides helpers for:
 * - Creating test workspace configurations (darwinkit.json)
 * - Creating test CSV files
 * - Writing JSON files (valid or invalid for error testing)
 * - Managing test temp directories
 */

import type { ConfigWithValidation, WorkspaceConfig } from "@dwkt/domain";
import { makeTransformConfig, makeValidationConfig, makeWorkspaceConfig } from "@dwkt/domain";
import { join } from "@std/path";

// Re-export shared CSV utilities from the core testing module
export {
  createTestDirectory,
  readCsvFile,
  toCsvString,
  withTestDirectory,
  withTestWorkspace,
  writeCsvFile,
} from "../../packages/core/src/testing/csv-fixtures.ts";

// ============================================================================
// Workspace Config Utilities
// ============================================================================

/** Default validation settings used across tests */
export const DEFAULT_VALIDATION_SETTINGS = makeValidationConfig({
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

/** Default transform settings used across tests */
export const DEFAULT_TRANSFORM_SETTINGS = makeTransformConfig({
  inputs: {},
  datasets: [],
  // output omitted - uses schema defaults: { dir: "./output", exportDB: false, ... }
});

/**
 * Create a test workspace configuration file
 *
 * Handles all required fields for ConfigWithValidation schema and allows
 * partial overrides for test-specific configurations.
 *
 * Note: If you pass a custom validation.import config with nullValues but omit
 * dropTable, use makeImportConfig to ensure defaults are applied correctly.
 */
export async function createTestConfig(
  tempDir: string,
  config?: Partial<ConfigWithValidation>,
): Promise<{ config: ConfigWithValidation; configPath: string }> {
  const validation = config?.validation
    ? { ...DEFAULT_VALIDATION_SETTINGS, ...config.validation }
    : DEFAULT_VALIDATION_SETTINGS;

  const fullConfig = makeWorkspaceConfig({
    id: config?.id ?? "test-workspace",
    name: config?.name ?? "Test Workspace",
    version: config?.version ?? "1.0.0",
    description: config?.description,
    validation,
    createdAt: config?.createdAt ?? new Date(),
    updatedAt: config?.updatedAt ?? new Date(),
  }) as ConfigWithValidation;

  const configPath = join(tempDir, "darwinkit.json");
  await Deno.writeTextFile(configPath, JSON.stringify(fullConfig, null, 2));

  return { config: fullConfig, configPath };
}

// ============================================================================
// JSON File Writing Utilities
// ============================================================================

/**
 * Write a JSON file with arbitrary content.
 *
 * Use this for:
 * - Writing valid workspace configs that don't need ConfigWithValidation defaults
 * - Writing invalid JSON to test error handling
 * - Writing any JSON structure for test scenarios
 *
 * @param dir - Directory to write the file in
 * @param filename - Name for the JSON file (with or without .json extension)
 * @param content - Object to serialize as JSON, or raw string for invalid JSON testing
 * @returns Full path to the created JSON file
 *
 * @example
 * ```typescript
 * // Write valid config
 * const configPath = await writeJsonFile(tempDir, "darwinkit.json", myConfig);
 *
 * // Write invalid JSON for error testing
 * const invalidPath = await writeJsonFile(tempDir, "bad.json", "{ invalid json }");
 * ```
 */
export async function writeJsonFile(
  dir: string,
  filename: string,
  content: unknown,
): Promise<string> {
  const normalizedFilename = filename.endsWith(".json") ? filename : `${filename}.json`;
  const filePath = join(dir, normalizedFilename);

  const textContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);

  await Deno.writeTextFile(filePath, textContent);
  return filePath;
}

/**
 * Write a workspace config file (darwinkit.json).
 *
 * Unlike `createTestConfig`, this writes the config as-is without applying defaults.
 * Use this when you need full control over the config structure.
 *
 * @param dir - Directory to write the config in
 * @param config - Full workspace config object
 * @returns Full path to the created darwinkit.json file
 */
export function writeWorkspaceConfig(
  dir: string,
  config: WorkspaceConfig,
): Promise<string> {
  return writeJsonFile(dir, "darwinkit.json", config);
}
