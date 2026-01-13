/**
 * Shared test utilities for creating workspace configurations
 */

import type { ConfigWithValidation } from "@dwkt/domain";
import { join } from "@std/path";

/** Default validation settings used across tests */
export const DEFAULT_VALIDATION_SETTINGS = {
  nullValues: ["", "NA"],
  failFast: false,
  outputDir: "./output",
} as const;

/**
 * Create a test workspace configuration file
 *
 * Handles all required fields for ConfigWithValidation schema and allows
 * partial overrides for test-specific configurations.
 */
export async function createTestConfig(
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

  const configPath = join(tempDir, "darwinkit.json");
  await Deno.writeTextFile(configPath, JSON.stringify(fullConfig, null, 2));

  return { config: fullConfig, configPath };
}

/**
 * Create a test CSV file with specific content
 */
export async function createTestCSV(
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
