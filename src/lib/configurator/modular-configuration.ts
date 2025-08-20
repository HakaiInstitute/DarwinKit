/**
 * Modular Configuration System
 *
 * Allows selective use of mapping, transformation, and validation components
 */

import {
  type GlobalParameters,
  type IntegratedConfiguration,
  type IntegratedFieldConfiguration,
  type TransformationStep,
  type ValidationStep,
} from "./integrated-configuration.ts";

// Component selection options
export type ComponentMode =
  | "mapping-only" // Just field mapping (sourceColumn → targetField)
  | "transform-validate" // Transformations + validations (no mapping)
  | "mapping-validate" // Mapping + validations (skip transformations)
  | "mapping-transform" // Mapping + transformations (skip validations)
  | "full-pipeline"; // All three components (default)

// Base field configuration for all modes
export interface BaseFieldConfiguration {
  // Always required for field identification
  fieldName: string;
}

// Mapping-specific configuration
export interface MappingConfiguration extends BaseFieldConfiguration {
  sourceColumn: string; // Source CSV column
  targetField: string; // Target Darwin Core field
}

// Transform-only configuration (no mapping)
export interface TransformConfiguration extends BaseFieldConfiguration {
  transformations: TransformationStep[];
}

// Combined configurations for specific modes
export type MappingOnlyFieldConfig = MappingConfiguration;

export interface TransformValidateFieldConfig extends TransformConfiguration {
  validations: ValidationStep[];
}

export interface MappingValidateFieldConfig extends MappingConfiguration {
  validations: ValidationStep[];
}

export interface MappingTransformFieldConfig extends MappingConfiguration {
  transformations: TransformationStep[];
}

export type FullPipelineFieldConfig = IntegratedFieldConfiguration;

// Union type for all possible field configurations
export type ModularFieldConfiguration =
  | { mode: "mapping-only"; config: MappingOnlyFieldConfig }
  | { mode: "transform-validate"; config: TransformValidateFieldConfig }
  | { mode: "mapping-validate"; config: MappingValidateFieldConfig }
  | { mode: "mapping-transform"; config: MappingTransformFieldConfig }
  | { mode: "full-pipeline"; config: FullPipelineFieldConfig };

// Top-level modular configuration
export interface ModularConfiguration {
  name: string;
  mode: ComponentMode;

  // Global parameters (vocabularies, etc.)
  globalParameters: GlobalParameters;

  // Field configurations based on selected mode
  fields: ModularFieldConfiguration[];

  // Optional metadata
  description?: string;
  sourceFile?: string;
  standard?: string;
}

// Configuration factory functions for each mode

/**
 * Create a mapping-only configuration (CSV column renaming)
 */
export function createMappingOnlyConfig(params: {
  name: string;
  mappings: { sourceColumn: string; targetField: string; fieldName?: string }[];
  globalParameters?: GlobalParameters;
}): ModularConfiguration {
  return {
    name: params.name,
    mode: "mapping-only",
    globalParameters: params.globalParameters ?? ({} as GlobalParameters),
    fields: params.mappings.map((mapping) => ({
      mode: "mapping-only" as const,
      config: {
        fieldName: mapping.fieldName ?? mapping.targetField,
        sourceColumn: mapping.sourceColumn,
        targetField: mapping.targetField,
      },
    })),
  };
}

/**
 * Create a transform-validate configuration (no mapping)
 */
export function createTransformValidateConfig(params: {
  name: string;
  fields: {
    fieldName: string;
    transformations: TransformationStep[];
    validations: ValidationStep[];
  }[];
  globalParameters?: GlobalParameters;
}): ModularConfiguration {
  return {
    name: params.name,
    mode: "transform-validate",
    globalParameters: params.globalParameters ?? ({} as GlobalParameters),
    fields: params.fields.map((field) => ({
      mode: "transform-validate" as const,
      config: {
        fieldName: field.fieldName,
        transformations: field.transformations,
        validations: field.validations,
      },
    })),
  };
}

/**
 * Create a mapping-validate configuration (skip transformations)
 */
export function createMappingValidateConfig(params: {
  name: string;
  mappings: {
    sourceColumn: string;
    targetField: string;
    fieldName?: string;
    validations: ValidationStep[];
  }[];
  globalParameters?: GlobalParameters;
}): ModularConfiguration {
  return {
    name: params.name,
    mode: "mapping-validate",
    globalParameters: params.globalParameters ?? ({} as GlobalParameters),
    fields: params.mappings.map((mapping) => ({
      mode: "mapping-validate" as const,
      config: {
        fieldName: mapping.fieldName ?? mapping.targetField,
        sourceColumn: mapping.sourceColumn,
        targetField: mapping.targetField,
        validations: mapping.validations,
      },
    })),
  };
}

/**
 * Create a mapping-transform configuration (skip validations)
 */
export function createMappingTransformConfig(params: {
  name: string;
  mappings: {
    sourceColumn: string;
    targetField: string;
    fieldName?: string;
    transformations: TransformationStep[];
  }[];
  globalParameters?: GlobalParameters;
}): ModularConfiguration {
  return {
    name: params.name,
    mode: "mapping-transform",
    globalParameters: params.globalParameters ?? ({} as GlobalParameters),
    fields: params.mappings.map((mapping) => ({
      mode: "mapping-transform" as const,
      config: {
        fieldName: mapping.fieldName ?? mapping.targetField,
        sourceColumn: mapping.sourceColumn,
        targetField: mapping.targetField,
        transformations: mapping.transformations,
      },
    })),
  };
}

/**
 * Convert modular configuration to integrated configuration for execution
 */
export function convertToIntegratedConfiguration(
  modularConfig: ModularConfiguration,
): IntegratedConfiguration {
  // Convert modular fields back to integrated format
  const fieldMappings: IntegratedFieldConfiguration[] = [];

  for (const field of modularConfig.fields) {
    let integratedField: IntegratedFieldConfiguration;

    switch (field.mode) {
      case "mapping-only":
        integratedField = {
          fieldName: field.config.targetField,
          sourceColumn: field.config.sourceColumn,
          targetField: field.config.targetField,
        };
        break;

      case "transform-validate": {
        // For transform-validate mode, use fieldName as both source and target
        const config = field.config;
        integratedField = {
          fieldName: config.fieldName,
          sourceColumn: config.fieldName,
          targetField: config.fieldName,
          transformations: config.transformations,
          validations: config.validations,
        };
        break;
      }

      case "mapping-validate": {
        const config = field.config;
        integratedField = {
          fieldName: config.targetField,
          sourceColumn: config.sourceColumn,
          targetField: config.targetField,
          validations: config.validations,
        };
        break;
      }

      case "mapping-transform": {
        const config = field.config;
        integratedField = {
          fieldName: config.targetField,
          sourceColumn: config.sourceColumn,
          targetField: config.targetField,
          transformations: config.transformations,
        };
        break;
      }

      case "full-pipeline": {
        const config = field.config;
        integratedField = {
          fieldName: config.targetField,
          sourceColumn: config.sourceColumn,
          targetField: config.targetField,
          transformations: config.transformations,
          validations: config.validations,
        };
        break;
      }
    }

    fieldMappings.push(integratedField);
  }

  return {
    name: modularConfig.name,
    sourceFile: modularConfig.sourceFile ?? "",
    standard: modularConfig.standard ?? "Darwin Core",
    globalParameters: modularConfig.globalParameters,
    fieldMappings,
  };
}

// Validation for modular configurations
export interface ModularConfigurationValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateModularConfiguration(
  config: ModularConfiguration,
): ModularConfigurationValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.name) {
    errors.push("Configuration name is required");
  }

  if (!config.fields || config.fields.length === 0) {
    warnings.push("No field configurations defined");
  }

  // Validate each field based on its mode
  for (let i = 0; i < config.fields.length; i++) {
    const field = config.fields[i];
    const fieldNum = i + 1;

    switch (field.mode) {
      case "mapping-only": {
        const config = field.config;
        if (!config.sourceColumn) {
          errors.push(
            `Field ${fieldNum}: sourceColumn is required for mapping-only mode`,
          );
        }
        if (!config.targetField) {
          errors.push(
            `Field ${fieldNum}: targetField is required for mapping-only mode`,
          );
        }
        break;
      }

      case "transform-validate": {
        const config = field.config;
        if (!config.fieldName) {
          errors.push(
            `Field ${fieldNum}: fieldName is required for transform-validate mode`,
          );
        }
        if (!config.transformations || config.transformations.length === 0) {
          warnings.push(
            `Field ${fieldNum}: No transformations defined in transform-validate mode`,
          );
        }
        if (!config.validations || config.validations.length === 0) {
          warnings.push(
            `Field ${fieldNum}: No validations defined in transform-validate mode`,
          );
        }
        break;
      }

      case "mapping-validate": {
        const config = field.config;
        if (!config.sourceColumn) {
          errors.push(
            `Field ${fieldNum}: sourceColumn is required for mapping-validate mode`,
          );
        }
        if (!config.targetField) {
          errors.push(
            `Field ${fieldNum}: targetField is required for mapping-validate mode`,
          );
        }
        if (!config.validations || config.validations.length === 0) {
          warnings.push(
            `Field ${fieldNum}: No validations defined in mapping-validate mode`,
          );
        }
        break;
      }

      case "mapping-transform": {
        const config = field.config;
        if (!config.sourceColumn) {
          errors.push(
            `Field ${fieldNum}: sourceColumn is required for mapping-transform mode`,
          );
        }
        if (!config.targetField) {
          errors.push(
            `Field ${fieldNum}: targetField is required for mapping-transform mode`,
          );
        }
        if (!config.transformations || config.transformations.length === 0) {
          warnings.push(
            `Field ${fieldNum}: No transformations defined in mapping-transform mode`,
          );
        }
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
