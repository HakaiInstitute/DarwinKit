/**
 * Validation Configuration Executor
 *
 * Executes validation configurations on data with proper error handling and result tracking
 */

import { type GlobalParameters } from "./integrated-configuration.js";
import {
  type DatasetValidationContext,
  executeValidation,
  executeValidationWithContext,
  type SomePrimitive,
} from "./validations.js";

interface ValidationStep {
  functionName: string;
  parameters: GlobalParameters;
}

interface FieldValidationConfig {
  field: string;
  validations: ValidationStep[];
}

export interface ValidationConfiguration {
  name: string;
  description?: string;
  validations: FieldValidationConfig[];
}

interface ValidationStepResult {
  step: number;
  functionName: string;
  inputValue: SomePrimitive;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface FieldValidationResult {
  field: string;
  value: SomePrimitive;
  valid: boolean;
  errors: string[];
  warnings: string[];
  steps: ValidationStepResult[];
}

interface RowValidationResult {
  rowIndex: number;
  valid: boolean;
  fieldResults: Record<string, FieldValidationResult>;
  errors: string[];
  warnings: string[];
}

interface DatasetValidationResult {
  configurationName: string;
  success: boolean;
  processedRows: number;
  totalRows: number;
  validRows: number;
  invalidRows: number;

  // Detailed results per row
  rowResults: RowValidationResult[];

  // Summary statistics
  fieldStatistics: Record<
    string,
    {
      totalProcessed: number;
      valid: number;
      invalid: number;
      mostCommonErrors: string[];
      mostCommonWarnings: string[];
    }
  >;

  // Overall errors and warnings
  globalErrors: string[];
  globalWarnings: string[];
}

// Dataset validation context interface (imported from validations.ts conceptually)
// interface DatasetValidationContext {
//   currentRow: Record<string, SomePrimitive>;
//   currentRowIndex: number;
//   dataset: Record<string, SomePrimitive>[];
//   totalRows: number;
//   validationMetadata: {
//     processedRows: number;
//     validRows: number;
//     invalidRows: number;
//   };
//   getFieldValue: (fieldName: string) => SomePrimitive;
//   getRowsWhere: (
//     predicate: (row: Record<string, SomePrimitive>) => boolean
//   ) => Record<string, SomePrimitive>[];
//   getPreviousRows: () => Record<string, SomePrimitive>[];
//   getRowsByFieldValue: (fieldName: string, value: SomePrimitive) => Record<string, SomePrimitive>[];
//   cache: Map<string, SomePrimitive>;
// }

/**
 * Execute validations for a single field value
 */
export function executeFieldValidation(
  fieldValue: SomePrimitive,
  fieldConfig: FieldValidationConfig,
  globalParameters: GlobalParameters = {}
): FieldValidationResult {
  const result: FieldValidationResult = {
    field: fieldConfig.field,
    value: fieldValue,
    valid: true,
    errors: [],
    warnings: [],
    steps: [],
  };

  for (let i = 0; i < fieldConfig.validations.length; i++) {
    const step = fieldConfig.validations[i];
    const stepNumber = i + 1;

    // Merge step parameters with global parameters
    const mergedParams: GlobalParameters = { ...globalParameters, ...step.parameters };

    const validationResult = executeValidation(step.functionName, fieldValue, mergedParams);

    const stepResult: ValidationStepResult = {
      step: stepNumber,
      functionName: step.functionName,
      inputValue: fieldValue,
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
    };

    result.steps.push(stepResult);

    // Accumulate errors and warnings
    if (!validationResult.valid) {
      result.valid = false;
      result.errors.push(
        ...validationResult.errors.map((err) => `Step ${stepNumber} (${step.functionName}): ${err}`)
      );
    }

    result.warnings.push(
      ...validationResult.warnings.map(
        (warn) => `Step ${stepNumber} (${step.functionName}): ${warn}`
      )
    );
  }

  return result;
}

/**
 * Execute validations for a single data row
 */
export function executeRowValidation(
  dataRow: Record<string, SomePrimitive>,
  config: ValidationConfiguration,
  globalParameters: GlobalParameters = {}
): RowValidationResult {
  const result: RowValidationResult = {
    rowIndex: 0, // Will be set by caller
    valid: true,
    fieldResults: {},
    errors: [],
    warnings: [],
  };

  for (const fieldConfig of config.validations) {
    const fieldValue = dataRow[fieldConfig.field];
    const fieldResult = executeFieldValidation(fieldValue, fieldConfig, globalParameters);

    result.fieldResults[fieldConfig.field] = fieldResult;

    // Aggregate field-level results
    if (!fieldResult.valid) {
      result.valid = false;
      result.errors.push(...fieldResult.errors.map((err) => `Field ${fieldConfig.field}: ${err}`));
    }

    result.warnings.push(
      ...fieldResult.warnings.map((warn) => `Field ${fieldConfig.field}: ${warn}`)
    );
  }

  return result;
}

/**
 * Create dataset validation context with utility functions
 */
function createDatasetValidationContext(
  dataset: Record<string, SomePrimitive>[],
  currentRowIndex: number
): DatasetValidationContext {
  const currentRow = dataset[currentRowIndex];

  return {
    currentRow,
    currentRowIndex,
    dataset,
    totalRows: dataset.length,
    validationMetadata: {
      processedRows: currentRowIndex,
      validRows: 0, // Will be updated during processing
      invalidRows: 0,
    },
    cache: new Map(),

    getFieldValue: (fieldName: string) => currentRow[fieldName],

    getRowsWhere: (predicate: (row: Record<string, SomePrimitive>) => boolean) =>
      dataset.filter(predicate),

    getPreviousRows: () => dataset.slice(0, currentRowIndex),

    getRowsByFieldValue: (fieldName: string, value: SomePrimitive) =>
      dataset.filter((row) => row[fieldName] === value),
  };
}

/**
 * Execute validations for a single field value with dataset context
 */
export function executeFieldValidationWithContext(
  fieldValue: SomePrimitive,
  fieldConfig: FieldValidationConfig,
  globalParameters: GlobalParameters = {},
  context?: DatasetValidationContext
): FieldValidationResult {
  const result: FieldValidationResult = {
    field: fieldConfig.field,
    value: fieldValue,
    valid: true,
    errors: [],
    warnings: [],
    steps: [],
  };

  for (let i = 0; i < fieldConfig.validations.length; i++) {
    const step = fieldConfig.validations[i];
    const stepNumber = i + 1;

    // Merge step parameters with global parameters
    const mergedParams: GlobalParameters = { ...globalParameters, ...step.parameters };

    const validationResult = executeValidationWithContext(
      step.functionName,
      fieldValue,
      mergedParams,
      context
    );

    const stepResult: ValidationStepResult = {
      step: stepNumber,
      functionName: step.functionName,
      inputValue: fieldValue,
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
    };

    result.steps.push(stepResult);

    // Accumulate errors and warnings
    if (!validationResult.valid) {
      result.valid = false;
      result.errors.push(
        ...validationResult.errors.map((err) => `Step ${stepNumber} (${step.functionName}): ${err}`)
      );
    }

    result.warnings.push(
      ...validationResult.warnings.map(
        (warn) => `Step ${stepNumber} (${step.functionName}): ${warn}`
      )
    );
  }

  return result;
}

/**
 * Execute validations for an entire dataset (original version for backward compatibility)
 */
export function executeDatasetValidation(
  dataset: Record<string, SomePrimitive>[],
  config: ValidationConfiguration,
  globalParameters: GlobalParameters = {}
): DatasetValidationResult {
  return executeDatasetValidationWithContext(dataset, config, globalParameters);
}

/**
 * Execute validations for an entire dataset with full context support
 */
export function executeDatasetValidationWithContext(
  dataset: Record<string, SomePrimitive>[],
  config: ValidationConfiguration,
  globalParameters: GlobalParameters = {}
): DatasetValidationResult {
  const result: DatasetValidationResult = {
    configurationName: config.name,
    success: true,
    processedRows: 0,
    totalRows: dataset.length,
    validRows: 0,
    invalidRows: 0,
    rowResults: [],
    fieldStatistics: {},
    globalErrors: [],
    globalWarnings: [],
  };

  // Initialize field statistics
  for (const fieldConfig of config.validations) {
    result.fieldStatistics[fieldConfig.field] = {
      totalProcessed: 0,
      valid: 0,
      invalid: 0,
      mostCommonErrors: [],
      mostCommonWarnings: [],
    };
  }

  // Process each row with dataset context
  for (let i = 0; i < dataset.length; i++) {
    const row = dataset[i];

    try {
      // Create context for this row
      const context = createDatasetValidationContext(dataset, i);

      const rowResult: RowValidationResult = {
        rowIndex: i,
        valid: true,
        fieldResults: {},
        errors: [],
        warnings: [],
      };

      // Execute validations for each field with context
      for (const fieldConfig of config.validations) {
        const fieldValue = row[fieldConfig.field];
        const fieldResult = executeFieldValidationWithContext(
          fieldValue,
          fieldConfig,
          globalParameters,
          context
        );

        rowResult.fieldResults[fieldConfig.field] = fieldResult;

        // Aggregate field-level results
        if (!fieldResult.valid) {
          rowResult.valid = false;
          rowResult.errors.push(
            ...fieldResult.errors.map((err) => `Field ${fieldConfig.field}: ${err}`)
          );
        }

        rowResult.warnings.push(
          ...fieldResult.warnings.map((warn) => `Field ${fieldConfig.field}: ${warn}`)
        );
      }

      result.rowResults.push(rowResult);
      result.processedRows++;

      if (rowResult.valid) {
        result.validRows++;
      } else {
        result.invalidRows++;
        result.success = false;
      }

      // Update field statistics
      for (const [fieldName, fieldResult] of Object.entries(rowResult.fieldResults)) {
        const stats = result.fieldStatistics[fieldName];
        stats.totalProcessed++;

        if (fieldResult.valid) {
          stats.valid++;
        } else {
          stats.invalid++;
        }
      }
    } catch (error) {
      result.success = false;
      result.invalidRows++;
      result.globalErrors.push(`Row ${i + 1}: Unexpected error - ${error as Error}`);
    }
  }

  // Calculate most common errors and warnings for each field
  for (const [fieldName, stats] of Object.entries(result.fieldStatistics)) {
    const errorCounts: Record<string, number> = {};
    const warningCounts: Record<string, number> = {};

    for (const rowResult of result.rowResults) {
      const fieldResult = rowResult.fieldResults[fieldName];
      if (fieldResult) {
        for (const error of fieldResult.errors) {
          errorCounts[error] = (errorCounts[error] || 0) + 1;
        }
        for (const warning of fieldResult.warnings) {
          warningCounts[warning] = (warningCounts[warning] || 0) + 1;
        }
      }
    }

    stats.mostCommonErrors = Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([error]) => error);

    stats.mostCommonWarnings = Object.entries(warningCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([warning]) => warning);
  }

  return result;
}

/**
 * Validate configuration before execution
 */
export function validateValidationConfiguration(config: ValidationConfiguration): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.name) {
    errors.push("Configuration name is required");
  }

  if (!config.validations || !Array.isArray(config.validations)) {
    errors.push("Configuration must have a validations array");
    return { valid: false, errors };
  }

  for (let i = 0; i < config.validations.length; i++) {
    const fieldConfig = config.validations[i];

    if (!fieldConfig.field) {
      errors.push(`Validation ${i + 1}: Missing field name`);
    }

    if (!fieldConfig.validations || !Array.isArray(fieldConfig.validations)) {
      errors.push(`Validation ${i + 1}: Missing or invalid validations array`);
      continue;
    }

    for (let j = 0; j < fieldConfig.validations.length; j++) {
      const step = fieldConfig.validations[j];

      if (!step.functionName) {
        errors.push(`Validation ${i + 1}, Step ${j + 1}: Missing function name`);
      }

      if (!step.parameters || typeof step.parameters !== "object") {
        errors.push(`Validation ${i + 1}, Step ${j + 1}: Missing or invalid parameters`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate validation summary for reporting
 */
export function generateValidationSummary(result: DatasetValidationResult): {
  totalFields: number;
  validFields: number;
  invalidFields: number;
  totalValidations: number;
  passedValidations: number;
  failedValidations: number;
  fieldSummaries: Record<
    string,
    {
      totalRows: number;
      validRows: number;
      invalidRows: number;
      mostCommonErrors: string[];
      mostCommonWarnings: string[];
    }
  >;
} {
  const summary = {
    totalFields: Object.keys(result.fieldStatistics).length,
    validFields: 0,
    invalidFields: 0,
    totalValidations: 0,
    passedValidations: 0,
    failedValidations: 0,
    fieldSummaries: {} as Record<
      string,
      {
        totalRows: number;
        validRows: number;
        invalidRows: number;
        mostCommonErrors: string[];
        mostCommonWarnings: string[];
      }
    >,
  };

  for (const [fieldName, fieldStats] of Object.entries(result.fieldStatistics)) {
    if (fieldStats.invalid === 0) {
      summary.validFields++;
    } else {
      summary.invalidFields++;
    }

    const fieldSummary = {
      totalRows: fieldStats.totalProcessed,
      validRows: fieldStats.valid,
      invalidRows: fieldStats.invalid,
      mostCommonErrors: fieldStats.mostCommonErrors,
      mostCommonWarnings: fieldStats.mostCommonWarnings,
    };

    summary.fieldSummaries[fieldName] = fieldSummary;

    // Count individual validation steps
    for (const rowResult of result.rowResults) {
      const fieldResult = rowResult.fieldResults[fieldName];
      if (fieldResult) {
        for (const step of fieldResult.steps) {
          summary.totalValidations++;
          if (step.valid) {
            summary.passedValidations++;
          } else {
            summary.failedValidations++;
          }
        }
      }
    }
  }

  return summary;
}
