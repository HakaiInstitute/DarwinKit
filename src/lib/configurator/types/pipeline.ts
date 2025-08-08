/**
 * Pipeline Type Definitions for DarwinKit Configurator
 *
 * Unified step and pipeline interfaces for transformation and validation
 * operations to eliminate duplication across configurator modules.
 */

import type { GlobalParameters, SomePrimitive, DatasetValidationContext } from "./core";
import type { ValidationResult, TransformationResult } from "./results";

// Step definitions - centralized to eliminate 3x duplication
export interface TransformationStep {
  functionName: string;
  parameters: GlobalParameters;
}

export interface ValidationStep {
  functionName: string;
  parameters: GlobalParameters;
  fieldName?: string; // Optional field context for dataset-aware validations
}

// Function type definitions
export type TransformationFunction<T extends SomePrimitive = SomePrimitive> = (
  input: T,
  parameters: GlobalParameters
) => TransformationResult;

export type ValidationFunction<T extends SomePrimitive = SomePrimitive> = (
  input: T,
  parameters: GlobalParameters
) => ValidationResult;

// Dataset-aware validation function
export type RowValidationFunction<TRow = Record<string, SomePrimitive>> = (
  value: SomePrimitive,
  context: DatasetValidationContext<TRow>
) => ValidationResult;

// Component mode definitions for modular configuration
export type ComponentMode =
  | "mapping_only" // Only field mapping
  | "mapping_transform" // Mapping + transformation
  | "mapping_validate" // Mapping + validation
  | "transform_validate" // Transformation + validation (no mapping)
  | "full_pipeline"; // Complete mapping + transformation + validation

// Pipeline execution modes
export type ExecutionMode =
  | "sequential" // Execute transformations then validations
  | "interleaved" // Alternate between transformations and validations
  | "validation_only"; // Skip transformations, validation only
