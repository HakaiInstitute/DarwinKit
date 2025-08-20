/**
 * Integrated Configuration Types
 *
 * Unified schema for mapping + transformation + validation pipeline
 */

import type {
  DataValue,
  GlobalParameters,
  IntegratedConfiguration,
  IntegratedFieldConfiguration,
  TransformationStep,
  ValidationStep,
} from "./types/index.ts";

// Re-export commonly used types for backward compatibility
export type {
  DataValue,
  GlobalParameters,
  IntegratedFieldConfiguration,
  TransformationStep,
  ValidationStep,
};

// Use centralized configuration type
export type { IntegratedConfiguration };

// Execution result tracking
export interface StepResult {
  step: number;
  functionName: string;
  inputValue: DataValue;
  outputValue: DataValue;
  success: boolean;
  error?: string;
}

export interface FieldExecutionResult {
  sourceColumn: string;
  targetField: string;
  originalValue: DataValue;
  mappedValue: DataValue;
  transformedValue: DataValue;
  finalValue: DataValue;

  // Step-by-step execution tracking
  transformationSteps: StepResult[];
  validationSteps: StepResult[];

  success: boolean;
  errors: string[];
  warnings: string[];
}

export interface RowExecutionResult {
  rowIndex: number;
  success: boolean;
  fieldResults: Record<string, FieldExecutionResult>;
  transformedRow: Record<string, DataValue>;
  errors: string[];
  warnings: string[];
}

export interface IntegratedExecutionResult {
  configurationName: string;
  success: boolean;
  processedRows: number;
  totalRows: number;
  validRows: number;
  invalidRows: number;

  // Detailed results per row
  rowResults: RowExecutionResult[];

  // Summary statistics
  fieldStatistics: Record<
    string,
    {
      totalProcessed: number;
      successful: number;
      failed: number;
      mostCommonErrors: string[];
      mostCommonWarnings: string[];
    }
  >;

  // Output data (valid rows only)
  transformedData: Record<string, DataValue>[];

  // Overall errors and warnings
  globalErrors: string[];
  globalWarnings: string[];
}

// Helper type for configuration validation
export interface ConfigurationValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
