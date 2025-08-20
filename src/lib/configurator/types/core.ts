/**
 * Core Type Definitions for DarwinKit Configurator
 *
 * Simplified type system aligned with DuckDB data types for CSV/Parquet processing.
 * Eliminates unnecessary complexity while maintaining type safety.
 */

import type { TransformationResult, ValidationResult } from "./results.ts";

// DuckDB-aligned data types for CSV/Parquet processing
export type DataValue =
  | string // VARCHAR, JSON as string, UUID
  | number // All numeric types (INT, FLOAT, DOUBLE, DECIMAL)
  | boolean // BOOLEAN
  | Date // DATE, TIME, TIMESTAMP
  | bigint // BIGINT, HUGEINT for large integers
  | null // NULL values
  | { latitude: number; longitude: number };

// Simplified row type for tabular data
export type DataRow = Record<string, DataValue>;

export type Dataset = DataRow[];

// Simplified parameters (no complex nested objects)
export type FunctionParameters = Record<string, DataValue>;

// Note: DataValue has been removed. Use DataValue instead.

// Vocabulary types - centralized to eliminate 4x duplication
export interface VocabularyTerm {
  term: string;
  synonyms: string[];
}

export interface MockVocabulary {
  name: string;
  strict: boolean;
  terms: VocabularyTerm[];
}

export interface VocabularyData {
  id: string;
  name: string;
  terms: {
    id: string;
    term: string;
    synonyms: string[];
  }[];
}

// Simplified global parameters interface
export interface GlobalParameters {
  vocabularies?: Record<string, MockVocabulary>;
  [key: string]: DataValue | Record<string, MockVocabulary> | undefined;
}

// Dataset context for validation (simplified)
export interface DatasetValidationContext<TRow = DataRow> {
  currentRow: TRow;
  dataset: TRow[];
  rowIndex: number;

  // Utility functions for dataset-aware validations
  getFieldValues: (fieldName: string) => DataValue[];
  findDuplicates: (fieldName: string, value: DataValue) => number[];
  findRelatedRows: (predicate: (row: TRow) => boolean) => TRow[];
  hasValue: (fieldName: string, value: DataValue) => boolean;

  // Performance cache for repeated lookups
  cache: Map<string, unknown>;
}

// Core Configuration Types - Foundation for Pipeline Interfaces
// These define how components in the pipeline (mapping, transforming, validating) are configured

// Component mode definitions - which pipeline components to use
export type ComponentMode =
  | "mapping_only" // Only field mapping
  | "mapping_transform" // Mapping + transformation
  | "mapping_validate" // Mapping + validation
  | "transform_validate" // Transformation + validation (no mapping)
  | "full_pipeline"; // Complete mapping + transformation + validation

// Pipeline execution modes - how components execute
export type ExecutionMode =
  | "sequential" // Execute transformations then validations
  | "interleaved" // Alternate between transformations and validations
  | "validation_only"; // Skip transformations, validation only

// Step definitions - core building blocks for pipeline operations
export interface TransformationStep {
  functionName: string;
  parameters: GlobalParameters;
}

export interface ValidationStep {
  functionName: string;
  parameters: GlobalParameters;
  fieldName?: string; // Optional field context for dataset-aware validations
}

// Base configuration interfaces - foundation for all configuration types
export interface BaseConfiguration {
  name: string;
  description?: string;
  standard?: string; // Target standard (e.g., "Darwin Core")
  sourceFile?: string;
  globalParameters: GlobalParameters;
}

export interface BaseFieldConfiguration {
  fieldName: string; // Standardized field identifier
}

// Function type definitions - shared interfaces for pipeline components
export type TransformationFunction<T extends DataValue = DataValue> = (
  input: T,
  parameters: GlobalParameters,
) => TransformationResult;

export type ValidationFunction<T extends DataValue = DataValue> = (
  input: T,
  parameters: GlobalParameters,
) => ValidationResult;

// Dataset-aware validation function
export type RowValidationFunction<TRow = Record<string, DataValue>> = (
  value: DataValue,
  context: DatasetValidationContext<TRow>,
) => ValidationResult;

// Cross-component orchestration types - how components work together in pipelines

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

// Modular field configurations based on component mode
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

export interface TransformValidateFieldConfig extends BaseFieldConfiguration {
  mode: "transform_validate";
  transformations: TransformationStep[];
  validations: ValidationStep[];
}

export interface FullPipelineFieldConfig extends BaseFieldConfiguration {
  mode: "full_pipeline";
  sourceColumn: string;
  targetField: string;
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

// Field-level validation configuration (used by validation component and cross-component configs)
export interface FieldValidationConfig {
  fieldName: string;
  validations: ValidationStep[];
}

// Simplified API types - cross-component interfaces for easier usage

// Field operations (replaces separate mapping/transform/validate configs)
export interface FieldOperation {
  field: string; // Target field name
  source?: string; // Source column (for mapping)
  transforms?: TransformationStep[]; // Optional transformations
  validations?: ValidationStep[]; // Optional validations
}

// Pipeline configuration (simplified interface for complete pipeline)
export interface PipelineConfiguration extends BaseConfiguration {
  operations: FieldOperation[];
}

// Dataset-aware validation function (enhanced version with inline context)
export type DatasetValidationFunction = (
  value: DataValue,
  context: {
    currentRow: DataRow;
    dataset: DataRow[];
    rowIndex: number;
    getFieldValues: (fieldName: string) => DataValue[];
    findDuplicates: (fieldName: string, value: DataValue) => number[];
  },
) => { success: boolean; errors: string[]; warnings: string[] };
