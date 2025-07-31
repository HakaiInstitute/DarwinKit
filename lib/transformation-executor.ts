/**
 * Transformation Configuration Executor
 * 
 * Executes transformation configurations on data with proper error handling and result tracking
 */

import { executeTransformation } from './transformations.js';

interface TransformationStep {
  functionName: string;
  parameters: Record<string, unknown>;
}

interface FieldTransformationConfig {
  field: string;
  functions: TransformationStep[];
}

interface TransformationConfig {
  transformations: FieldTransformationConfig[];
}

interface TransformationResult {
  value: unknown;
  success: boolean;
  error?: string;
  executedSteps: number;
  totalSteps: number;
}

interface FieldTransformationResult {
  field: string;
  originalValue: unknown;
  transformedValue: unknown;
  success: boolean;
  errors: string[];
  steps: Array<{
    step: number;
    functionName: string;
    inputValue: unknown;
    outputValue: unknown;
    success: boolean;
    error?: string;
  }>;
}

interface DatasetTransformationResult {
  success: boolean;
  processedRows: number;
  totalRows: number;
  fieldResults: Record<string, FieldTransformationResult[]>;
  errors: string[];
}

/**
 * Execute transformations for a single field value
 */
export function executeFieldTransformation(
  fieldValue: unknown,
  fieldConfig: FieldTransformationConfig,
  globalParameters: Record<string, unknown> = {}
): FieldTransformationResult {
  const result: FieldTransformationResult = {
    field: fieldConfig.field,
    originalValue: fieldValue,
    transformedValue: fieldValue,
    success: true,
    errors: [],
    steps: [],
  };

  let currentValue = fieldValue;

  for (let i = 0; i < fieldConfig.functions.length; i++) {
    const step = fieldConfig.functions[i];
    const stepNumber = i + 1;

    // Merge step parameters with global parameters
    const mergedParams = { ...globalParameters, ...step.parameters };

    const transformResult = executeTransformation(
      step.functionName,
      currentValue,
      mergedParams
    );

    result.steps.push({
      step: stepNumber,
      functionName: step.functionName,
      inputValue: currentValue,
      outputValue: transformResult.value,
      success: transformResult.success,
      error: transformResult.error,
    });

    if (!transformResult.success) {
      result.success = false;
      result.errors.push(
        `Step ${stepNumber} (${step.functionName}): ${transformResult.error}`
      );
    }

    currentValue = transformResult.value;
  }

  result.transformedValue = currentValue;
  return result;
}

/**
 * Execute transformations for a single data row
 */
export function executeRowTransformation(
  dataRow: Record<string, unknown>,
  config: TransformationConfig,
  globalParameters: Record<string, unknown> = {}
): Record<string, FieldTransformationResult> {
  const results: Record<string, FieldTransformationResult> = {};

  for (const fieldConfig of config.transformations) {
    const fieldValue = dataRow[fieldConfig.field];
    const fieldResult = executeFieldTransformation(
      fieldValue,
      fieldConfig,
      globalParameters
    );
    results[fieldConfig.field] = fieldResult;

    // Update the row with transformed value
    if (fieldResult.success) {
      dataRow[fieldConfig.field] = fieldResult.transformedValue;
    }
  }

  return results;
}

/**
 * Execute transformations for an entire dataset
 */
export function executeDatasetTransformation(
  dataset: Record<string, unknown>[],
  config: TransformationConfig,
  globalParameters: Record<string, unknown> = {}
): DatasetTransformationResult {
  const result: DatasetTransformationResult = {
    success: true,
    processedRows: 0,
    totalRows: dataset.length,
    fieldResults: {},
    errors: [],
  };

  // Initialize field results structure
  for (const fieldConfig of config.transformations) {
    result.fieldResults[fieldConfig.field] = [];
  }

  for (let rowIndex = 0; rowIndex < dataset.length; rowIndex++) {
    const row = dataset[rowIndex];

    try {
      const rowResults = executeRowTransformation(row, config, globalParameters);

      // Collect field results
      for (const [fieldName, fieldResult] of Object.entries(rowResults)) {
        result.fieldResults[fieldName].push(fieldResult);

        if (!fieldResult.success) {
          result.success = false;
          result.errors.push(
            `Row ${rowIndex + 1}, Field ${fieldName}: ${fieldResult.errors.join('; ')}`
          );
        }
      }

      result.processedRows++;
    } catch (error) {
      result.success = false;
      result.errors.push(`Row ${rowIndex + 1}: Unexpected error - ${error}`);
    }
  }

  return result;
}

/**
 * Validate transformation configuration before execution
 */
export function validateTransformationConfig(config: TransformationConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.transformations || !Array.isArray(config.transformations)) {
    errors.push('Configuration must have a transformations array');
    return { valid: false, errors };
  }

  for (let i = 0; i < config.transformations.length; i++) {
    const fieldConfig = config.transformations[i];

    if (!fieldConfig.field) {
      errors.push(`Transformation ${i + 1}: Missing field name`);
    }

    if (!fieldConfig.functions || !Array.isArray(fieldConfig.functions)) {
      errors.push(`Transformation ${i + 1}: Missing or invalid functions array`);
      continue;
    }

    for (let j = 0; j < fieldConfig.functions.length; j++) {
      const step = fieldConfig.functions[j];

      if (!step.functionName) {
        errors.push(
          `Transformation ${i + 1}, Step ${j + 1}: Missing function name`
        );
      }

      if (!step.parameters || typeof step.parameters !== 'object') {
        errors.push(
          `Transformation ${i + 1}, Step ${j + 1}: Missing or invalid parameters`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Generate execution summary for reporting
 */
export function generateExecutionSummary(result: DatasetTransformationResult): {
  totalFields: number;
  successfulFields: number;
  failedFields: number;
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  fieldSummaries: Record<string, {
    totalValues: number;
    successfulTransformations: number;
    failedTransformations: number;
    mostCommonErrors: string[];
  }>;
} {
  const summary = {
    totalFields: Object.keys(result.fieldResults).length,
    successfulFields: 0,
    failedFields: 0,
    totalSteps: 0,
    successfulSteps: 0,
    failedSteps: 0,
    fieldSummaries: {} as Record<string, any>,
  };

  for (const [fieldName, fieldResults] of Object.entries(result.fieldResults)) {
    const fieldSummary = {
      totalValues: fieldResults.length,
      successfulTransformations: 0,
      failedTransformations: 0,
      mostCommonErrors: [] as string[],
    };

    const errorCounts: Record<string, number> = {};

    for (const fieldResult of fieldResults) {
      if (fieldResult.success) {
        fieldSummary.successfulTransformations++;
        summary.successfulFields++;
      } else {
        fieldSummary.failedTransformations++;
        summary.failedFields++;

        // Count error types
        for (const error of fieldResult.errors) {
          errorCounts[error] = (errorCounts[error] || 0) + 1;
        }
      }

      // Count steps
      for (const step of fieldResult.steps) {
        summary.totalSteps++;
        if (step.success) {
          summary.successfulSteps++;
        } else {
          summary.failedSteps++;
        }
      }
    }

    // Find most common errors
    fieldSummary.mostCommonErrors = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([error]) => error);

    summary.fieldSummaries[fieldName] = fieldSummary;
  }

  return summary;
}