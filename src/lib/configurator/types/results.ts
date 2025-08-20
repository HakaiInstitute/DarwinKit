/**
 * Result Type Definitions for DarwinKit Configurator
 *
 * Unified result interfaces to eliminate inconsistencies and provide
 * standardized error handling across all pipeline operations.
 */

import type { DataValue, DataRow } from "./core.ts";

// Base result interface - standardized across all operations
export interface BaseResult {
  success: boolean; // Standardize on 'success' instead of mixed 'valid'/'success'
  errors: string[];
  warnings: string[];
}

// Function execution results
export interface ValidationResult extends BaseResult {
  value: DataValue; // The value being validated (pass-through)
}

export interface TransformationResult extends BaseResult {
  value: DataValue; // The transformed output value
}

// Configuration validation results
export interface ConfigurationValidationResult extends BaseResult {
  // Configuration-specific validation metadata can be added here
}

// Step-level execution tracking
export interface StepExecutionResult extends BaseResult {
  step: number;
  functionName: string;
  inputValue: DataValue;
  outputValue: DataValue;
}

// Field-level execution results
export interface FieldExecutionResult extends BaseResult {
  fieldName: string;
  sourceColumn: string;
  originalValue: DataValue;
  finalValue: DataValue;
  steps: StepExecutionResult[];
}

// Row-level execution results
export interface RowExecutionResult extends BaseResult {
  rowIndex: number;
  sourceRow: Record<string, DataValue>;
  transformedRow: Record<string, DataValue>;
  fieldResults: Record<string, FieldExecutionResult>;
}

// Dataset-level execution results
export interface DatasetExecutionResult extends BaseResult {
  configurationName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  transformedData: Record<string, DataValue>[];
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
  value: DataValue;
}

export interface FieldValidationResult extends BaseResult {
  fieldName: string;
  value: DataValue;
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

// Simplified result types (from simplified.ts)
export interface ExecutionResult {
  success: boolean;
  processedRows: number;
  validRows: number;
  invalidRows: number;
  transformedData: DataRow[];
  errors: string[];
  warnings: string[];
}

export interface FieldResult {
  field: string;
  originalValue: DataValue;
  finalValue: DataValue;
  success: boolean;
  errors: string[];
  warnings: string[];
}

export interface RowResult {
  rowIndex: number;
  success: boolean;
  fieldResults: Record<string, FieldResult>;
  transformedRow: DataRow;
  errors: string[];
  warnings: string[];
}
