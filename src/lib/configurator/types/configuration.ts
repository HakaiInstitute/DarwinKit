/**
 * Configuration Type Definitions for DarwinKit Configurator
 *
 * Unified configuration interfaces for integrated and modular configurations
 * to eliminate duplication and ensure consistency across configuration systems.
 */

import type { GlobalParameters, SomePrimitive } from "./core";
import type { TransformationStep, ValidationStep, ComponentMode, ExecutionMode } from "./pipeline";

// Base configuration interface
export interface BaseConfiguration {
  name: string;
  description?: string;
  standard?: string; // Target standard (e.g., "Darwin Core")
  sourceFile?: string;
  globalParameters: GlobalParameters;
}

// Base field configuration
export interface BaseFieldConfiguration {
  fieldName: string; // Standardized field identifier
}

// Integrated configuration (comprehensive pipeline)
export interface IntegratedFieldConfiguration extends BaseFieldConfiguration {
  sourceColumn: string;
  targetField: string;
  transformations?: TransformationStep[];
  validations?: ValidationStep[];
}

export interface IntegratedConfiguration extends BaseConfiguration {
  fieldMappings: IntegratedFieldConfiguration[];
  executionMode?: ExecutionMode;
}

// Modular configuration (selective components)
export interface MappingConfiguration extends BaseFieldConfiguration {
  sourceColumn: string;
  targetField: string;
}

export interface TransformConfiguration extends BaseFieldConfiguration {
  transformations: TransformationStep[];
}

export interface ValidateConfiguration extends BaseFieldConfiguration {
  validations: ValidationStep[];
}

// Modular field configurations based on component mode
export interface MappingOnlyFieldConfig extends MappingConfiguration {
  mode: "mapping_only";
}

export interface MappingTransformFieldConfig extends MappingConfiguration {
  mode: "mapping_transform";
  transformations: TransformationStep[];
}

export interface MappingValidateFieldConfig extends MappingConfiguration {
  mode: "mapping_validate";
  validations: ValidationStep[];
}

export interface TransformValidateFieldConfig extends TransformConfiguration {
  mode: "transform_validate";
  validations: ValidationStep[];
}

export interface FullPipelineFieldConfig extends MappingConfiguration {
  mode: "full_pipeline";
  transformations: TransformationStep[];
  validations: ValidationStep[];
}

// Discriminated union for modular field configuration
export type ModularFieldConfiguration =
  | MappingOnlyFieldConfig
  | MappingTransformFieldConfig
  | MappingValidateFieldConfig
  | TransformValidateFieldConfig
  | FullPipelineFieldConfig;

export interface ModularConfiguration extends BaseConfiguration {
  mode: ComponentMode;
  fields: ModularFieldConfiguration[];
  executionMode?: ExecutionMode;
}

// Validation-only configuration for validation executor
export interface FieldValidationConfig {
  fieldName: string;
  validations: ValidationStep[];
}

export interface ValidationConfiguration extends BaseConfiguration {
  fields: FieldValidationConfig[];
  datasetValidations?: ValidationStep[]; // Dataset-wide validations
}
