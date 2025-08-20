/**
 * Modular Executor
 *
 * Executes modular configurations with selective component usage
 */

import { type IntegratedExecutionResult } from "./integrated-configuration.ts";
import { executeIntegratedConfiguration } from "./integrated-executor.ts";
import {
  convertToIntegratedConfiguration,
  type ModularConfiguration,
  validateModularConfiguration,
} from "./modular-configuration.ts";
import { type DataValue } from "./types/index.ts";

/**
 * Execute a modular configuration
 */
export function executeModularConfiguration(
  sourceData: Record<string, DataValue>[],
  modularConfig: ModularConfiguration,
): IntegratedExecutionResult {
  // Validate the modular configuration first
  const validationResult = validateModularConfiguration(modularConfig);
  if (!validationResult.valid) {
    // Return error result if configuration is invalid
    return {
      configurationName: modularConfig.name,
      success: false,
      processedRows: 0,
      totalRows: sourceData.length,
      validRows: 0,
      invalidRows: sourceData.length,
      rowResults: [],
      fieldStatistics: {},
      transformedData: [],
      globalErrors: validationResult.errors,
      globalWarnings: validationResult.warnings,
    };
  }

  // Convert modular config to integrated config for execution
  const integratedConfig = convertToIntegratedConfiguration(modularConfig);

  // Execute using the existing integrated executor
  return executeIntegratedConfiguration(sourceData, integratedConfig);
}

/**
 * Execute mapping-only pipeline (just field renaming)
 */
export function executeMappingOnly(
  sourceData: Record<string, DataValue>[],
  mappings: { sourceColumn: string; targetField: string }[],
): Record<string, DataValue>[] {
  return sourceData.map((row) => {
    const mappedRow: Record<string, DataValue> = {};

    for (const mapping of mappings) {
      mappedRow[mapping.targetField] = row[mapping.sourceColumn];
    }

    return mappedRow;
  });
}

/**
 * Execute transformation and validation pipeline (no mapping)
 */
export function executeTransformValidate(
  data: Record<string, DataValue>[],
  config: ModularConfiguration,
): IntegratedExecutionResult {
  if (config.mode !== "transform-validate") {
    throw new Error("Configuration must be in transform-validate mode");
  }

  return executeModularConfiguration(data, config);
}

/**
 * Execute mapping and validation pipeline (skip transformations)
 */
export function executeMappingValidate(
  sourceData: Record<string, DataValue>[],
  config: ModularConfiguration,
): IntegratedExecutionResult {
  if (config.mode !== "mapping-validate") {
    throw new Error("Configuration must be in mapping-validate mode");
  }

  return executeModularConfiguration(sourceData, config);
}

/**
 * Execute mapping and transformation pipeline (skip validations)
 */
export function executeMappingTransform(
  sourceData: Record<string, DataValue>[],
  config: ModularConfiguration,
): IntegratedExecutionResult {
  if (config.mode !== "mapping-transform") {
    throw new Error("Configuration must be in mapping-transform mode");
  }

  return executeModularConfiguration(sourceData, config);
}

/**
 * Helper to create and execute a simple mapping-only configuration
 */
export function createAndExecuteMappingOnly(params: {
  name: string;
  sourceData: Record<string, DataValue>[];
  mappings: { sourceColumn: string; targetField: string }[];
}): { transformedData: Record<string, DataValue>[]; success: boolean } {
  try {
    const transformedData = executeMappingOnly(
      params.sourceData,
      params.mappings,
    );
    return { transformedData, success: true };
  } catch (error) {
    console.error(`Mapping execution failed: ${String(error)}`);
    return { transformedData: [], success: false };
  }
}

// Export all modular configuration functions for easy access
export * from "./modular-configuration.ts";
