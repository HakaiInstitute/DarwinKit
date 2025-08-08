/**
 * Type System Optimizations for DarwinKit Configurator
 *
 * Performance optimizations and efficiency improvements for the type system.
 */

import type { SomePrimitive } from "./core";
import type { ValidationResult, TransformationResult } from "./results";

// Optimized result types using branded types for better type inference
export interface BrandedSuccess {
  readonly __brand: "success";
  success: true;
}
export interface BrandedFailure {
  readonly __brand: "failure";
  success: false;
}

// More efficient result types using discriminated unions
export type OptimizedValidationResult =
  | (BrandedSuccess & { errors: []; warnings: string[]; value: SomePrimitive })
  | (BrandedFailure & { errors: [string, ...string[]]; warnings: string[]; value: SomePrimitive });

export type OptimizedTransformationResult =
  | (BrandedSuccess & { errors: []; warnings: string[]; value: SomePrimitive })
  | (BrandedFailure & { errors: [string, ...string[]]; warnings: string[]; value: SomePrimitive });

// Efficient type guards
export const isValidationSuccess = (
  result: ValidationResult
): result is ValidationResult & { success: true } => result.success === true;

export const isValidationFailure = (
  result: ValidationResult
): result is ValidationResult & { success: false } => result.success === false;

export const isTransformationSuccess = (
  result: TransformationResult
): result is TransformationResult & { success: true } => result.success === true;

export const isTransformationFailure = (
  result: TransformationResult
): result is TransformationResult & { success: false } => result.success === false;

// Readonly variants for immutable operations
export type ReadonlyValidationResult = Readonly<ValidationResult>;
export type ReadonlyTransformationResult = Readonly<TransformationResult>;

// Utility types for common patterns
export type NonNullablePrimitive = NonNullable<SomePrimitive>;

// Generic constraint helpers
export type ValidatableValue<T extends SomePrimitive = SomePrimitive> = T extends null | undefined
  ? never
  : T;

// More specific string literal types for common vocabulary names
export type DarwinCoreField =
  | "catalogNumber"
  | "scientificName"
  | "kingdom"
  | "phylum"
  | "class"
  | "order"
  | "family"
  | "genus"
  | "specificEpithet"
  | "eventDate"
  | "decimalLatitude"
  | "decimalLongitude"
  | "basisOfRecord"
  | "lifeStage"
  | "sex"
  | "recordedBy";

export type VocabularyName = string; // Any vocabulary name including dwc:sex, dwc:life_stage, dwc:basis_of_record

// Performance-optimized cache types
export interface ValidationCache {
  readonly vocabulary: ReadonlyMap<string, ReadonlyMap<string, boolean>>;
  readonly transformations: ReadonlyMap<string, SomePrimitive>;
}

// Type-safe error handling
export interface ValidationError {
  readonly type: "validation_error";
  readonly field: string;
  readonly message: string;
  readonly code?: string;
}

export interface TransformationError {
  readonly type: "transformation_error";
  readonly field: string;
  readonly message: string;
  readonly code?: string;
}

export interface ConfigurationError {
  readonly type: "configuration_error";
  readonly message: string;
  readonly code?: string;
}

export type PipelineError = ValidationError | TransformationError | ConfigurationError;

// Efficient result builders
export const createSuccessResult = <T extends SomePrimitive>(
  value: T,
  warnings: string[] = []
): ValidationResult => ({
  success: true,
  errors: [],
  warnings,
  value,
});

export const createFailureResult = <T extends SomePrimitive>(
  value: T,
  errors: string[],
  warnings: string[] = []
): ValidationResult => ({
  success: false,
  errors,
  warnings,
  value,
});

// Memory-efficient field mapping
export type FieldMapping = readonly [sourceColumn: string, targetField: DarwinCoreField];
export type FieldMappings = readonly FieldMapping[];

// Efficient batch processing types
export interface BatchProcessingOptions {
  readonly batchSize: number;
  readonly concurrency: number;
  readonly failFast: boolean;
}

export type BatchProcessor<TInput, TOutput> = (
  inputs: readonly TInput[],
  options?: BatchProcessingOptions
) => Promise<readonly TOutput[]>;
