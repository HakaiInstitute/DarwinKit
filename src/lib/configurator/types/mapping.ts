/**
 * Mapping Component Type Definitions for DarwinKit Configurator
 *
 * Types specific to the mapping component of the pipeline,
 * which handles field mapping from source to target columns.
 */

import type { BaseFieldConfiguration, TransformationStep, ValidationStep } from "./core.ts";

// Basic mapping configuration
export interface MappingConfiguration extends BaseFieldConfiguration {
  sourceColumn: string;
  targetField: string;
}

// Hybrid mapping configurations (mapping component as primary + other components)
export interface MappingOnlyFieldConfig extends BaseFieldConfiguration {
  mode: "mapping_only";
  sourceColumn: string;
  targetField: string;
}

export interface MappingTransformFieldConfig extends BaseFieldConfiguration {
  mode: "mapping_transform";
  sourceColumn: string;
  targetField: string;
  transformations: TransformationStep[];
}

export interface MappingValidateFieldConfig extends BaseFieldConfiguration {
  mode: "mapping_validate";
  sourceColumn: string;
  targetField: string;
  validations: ValidationStep[];
}

export interface FullPipelineFieldConfig extends BaseFieldConfiguration {
  mode: "full_pipeline";
  sourceColumn: string;
  targetField: string;
  transformations: TransformationStep[];
  validations: ValidationStep[];
}
