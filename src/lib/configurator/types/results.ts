/**
 * Result Type Definitions for DarwinKit Configurator
 *
 * Unified result interfaces to eliminate inconsistencies and provide
 * standardized error handling across all pipeline operations.
 */

import type { SomePrimitive } from "./core";

// Base result interface - standardized across all operations
export interface BaseResult {
  success: boolean; // Standardize on 'success' instead of mixed 'valid'/'success'
  errors: string[];
  warnings: string[];
}

// Function execution results
export interface ValidationResult extends BaseResult {
  value: SomePrimitive; // The value being validated (pass-through)
}

export interface TransformationResult extends BaseResult {
  value: SomePrimitive; // The transformed output value
}

// Configuration validation results
export interface ConfigurationValidationResult extends BaseResult {
  // Configuration-specific validation metadata can be added here
}

// Step-level execution tracking
export interface StepExecutionResult extends BaseResult {
  step: number;
  functionName: string;
  inputValue: SomePrimitive;
  outputValue: SomePrimitive;
}

// Field-level execution results
export interface FieldExecutionResult extends BaseResult {
  fieldName: string;
  sourceColumn: string;
  originalValue: SomePrimitive;
  finalValue: SomePrimitive;
  steps: StepExecutionResult[];
}

// Row-level execution results
export interface RowExecutionResult extends BaseResult {
  rowIndex: number;
  sourceRow: Record<string, SomePrimitive>;
  transformedRow: Record<string, SomePrimitive>;
  fieldResults: Record<string, FieldExecutionResult>;
}

// Dataset-level execution results
export interface DatasetExecutionResult extends BaseResult {
  configurationName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  transformedData: Record<string, SomePrimitive>[];
  rowResults: RowExecutionResult[];
  globalErrors: string[];

  // Field-level statistics
  fieldStatistics: Record<
    string,
    {
      totalProcessed: number;
      successful: number;
      failed: number;
      mostCommonErrors: string[];
    }
  >;
}

// Validation-specific result types
export interface ValidationStepResult extends BaseResult {
  functionName: string;
  value: SomePrimitive;
}

export interface FieldValidationResult extends BaseResult {
  fieldName: string;
  value: SomePrimitive;
  steps: ValidationStepResult[];
}

export interface RowValidationResult extends BaseResult {
  rowIndex: number;
  fieldResults: Record<string, FieldValidationResult>;
}

export interface DatasetValidationResult extends BaseResult {
  configurationName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rowResults: RowValidationResult[];

  // Field-level statistics
  fieldStatistics: Record<
    string,
    {
      valid: number;
      invalid: number;
      totalProcessed: number;
      mostCommonErrors: string[];
    }
  >;
}
