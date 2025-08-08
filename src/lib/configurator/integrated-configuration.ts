/**
 * Integrated Configuration Types
 *
 * Unified schema for mapping + transformation + validation pipeline
 */

import type {
  SomePrimitive,
  GlobalParameters,
  TransformationStep,
  ValidationStep,
  IntegratedFieldConfiguration,
  IntegratedConfiguration,
} from "./types";

// Re-export commonly used types for backward compatibility
export type {
  SomePrimitive,
  GlobalParameters,
  TransformationStep,
  ValidationStep,
  IntegratedFieldConfiguration,
};

// Use centralized configuration type
export type { IntegratedConfiguration };

// Legacy interface maintained for backward compatibility
interface _LegacyIntegratedConfiguration {
  name: string;
  sourceFile: string;
  standard: string; // "Darwin Core"

  // Global parameters available to all functions
  globalParameters: GlobalParameters;

  // Field-level configurations
  fieldMappings: IntegratedFieldConfiguration[];
}

// Execution result tracking
export interface StepResult {
  step: number;
  functionName: string;
  inputValue: SomePrimitive;
  outputValue: SomePrimitive;
  success: boolean;
  error?: string;
}

export interface FieldExecutionResult {
  sourceColumn: string;
  targetField: string;
  originalValue: SomePrimitive;
  mappedValue: SomePrimitive;
  transformedValue: SomePrimitive;
  finalValue: SomePrimitive;

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
  transformedRow: Record<string, SomePrimitive>;
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
  transformedData: Record<string, SomePrimitive>[];

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
