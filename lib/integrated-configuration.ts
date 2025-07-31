/**
 * Integrated Configuration Types
 * 
 * Unified schema for mapping + transformation + validation pipeline
 */

interface VocabularyTerm {
  term: string;
  synonyms: string[];
}

interface MockVocabulary {
  name: string;
  strict: boolean;
  terms: VocabularyTerm[];
}

// Function execution step
export interface TransformationStep {
  functionName: string;
  parameters: Record<string, unknown>;
}

export interface ValidationStep {
  functionName: string;
  parameters: Record<string, unknown>;
}

// Field-level configuration combining mapping + transformation + validation
export interface IntegratedFieldConfiguration {
  sourceColumn: string;           // Raw CSV column name
  targetField: string;           // Darwin Core field name
  
  // Transformation pipeline (applied after mapping)
  transformations?: TransformationStep[];
  
  // Validation pipeline (applied after transformations)  
  validations?: ValidationStep[];
}

// Complete integrated configuration
export interface IntegratedConfiguration {
  name: string;
  sourceFile: string;
  standard: string;               // "Darwin Core"
  
  // Global parameters available to all functions
  globalParameters: {
    vocabularies: Record<string, MockVocabulary>;
    [key: string]: unknown;
  };
  
  // Field-level configurations
  fieldMappings: IntegratedFieldConfiguration[];
}

// Execution result tracking
export interface StepResult {
  step: number;
  functionName: string;
  inputValue: unknown;
  outputValue: unknown;
  success: boolean;
  error?: string;
}

export interface FieldExecutionResult {
  sourceColumn: string;
  targetField: string;
  originalValue: unknown;
  mappedValue: unknown;
  transformedValue: unknown;
  finalValue: unknown;
  
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
  transformedRow: Record<string, unknown>;
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
  fieldStatistics: Record<string, {
    totalProcessed: number;
    successful: number;
    failed: number;
    mostCommonErrors: string[];
    mostCommonWarnings: string[];
  }>;
  
  // Output data (valid rows only)
  transformedData: Record<string, unknown>[];
  
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