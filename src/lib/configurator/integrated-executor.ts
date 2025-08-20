/**
 * Integrated Executor
 *
 * Executes unified mapping + transformation + validation pipeline
 */

import {
  type ConfigurationValidationResult,
  type FieldExecutionResult,
  type GlobalParameters,
  type IntegratedConfiguration,
  type IntegratedExecutionResult,
  type IntegratedFieldConfiguration,
  type RowExecutionResult,
  type StepResult,
  type TransformationStep,
  type ValidationStep,
} from "./integrated-configuration.ts";
import { executeTransformation } from "./transformations.ts";
import { executeValidation } from "./validations.ts";
import type { DataValue } from "./types/index.ts";

/**
 * Execute mapping step: sourceColumn → targetField
 */
function executeFieldMapping(
  sourceRow: Record<string, DataValue>,
  fieldConfig: IntegratedFieldConfiguration,
): { targetField: string; mappedValue: DataValue } {
  const sourceValue = sourceRow[fieldConfig.sourceColumn];
  return {
    targetField: fieldConfig.targetField,
    mappedValue: sourceValue,
  };
}

/**
 * Execute transformation steps on a single field
 */
function executeFieldTransformations(
  inputValue: DataValue,
  transformations: TransformationStep[],
  globalParameters: GlobalParameters,
): {
  transformedValue: DataValue;
  steps: StepResult[];
  success: boolean;
  errors: string[];
} {
  const steps: StepResult[] = [];
  const errors: string[] = [];
  let currentValue = inputValue;
  let success = true;

  for (let i = 0; i < transformations.length; i++) {
    const step = transformations[i];
    const stepNumber = i + 1;

    // Merge step parameters with global parameters
    const mergedParams: GlobalParameters = {
      ...globalParameters,
      ...step.parameters,
    };

    const result = executeTransformation(
      step.functionName,
      currentValue,
      mergedParams,
    );

    steps.push({
      step: stepNumber,
      functionName: step.functionName,
      inputValue: currentValue,
      outputValue: result.value,
      success: result.success,
      error: result.error,
    });

    if (!result.success) {
      success = false;
      errors.push(
        `Transformation step ${stepNumber} (${step.functionName}): ${result.error}`,
      );
    }

    currentValue = result.value;
  }

  return {
    transformedValue: currentValue,
    steps,
    success,
    errors,
  };
}

/**
 * Execute validation steps on a single field
 */
function executeFieldValidations(
  inputValue: DataValue,
  validations: ValidationStep[],
  globalParameters: GlobalParameters,
): {
  finalValue: DataValue;
  steps: StepResult[];
  success: boolean;
  errors: string[];
  warnings: string[];
} {
  const steps: StepResult[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let success = true;

  for (let i = 0; i < validations.length; i++) {
    const step = validations[i];
    const stepNumber = i + 1;

    // Merge step parameters with global parameters
    const mergedParams: GlobalParameters = {
      ...globalParameters,
      ...step.parameters,
    };

    const result = executeValidation(
      step.functionName,
      inputValue,
      mergedParams,
    );

    steps.push({
      step: stepNumber,
      functionName: step.functionName,
      inputValue: inputValue,
      outputValue: result.value, // Validations pass through the original value
      success: result.valid,
      error: result.errors.join(", ") || undefined,
    });

    if (!result.valid) {
      success = false;
      errors.push(
        ...result.errors.map(
          (err) => `Validation step ${stepNumber} (${step.functionName}): ${err}`,
        ),
      );
    }

    warnings.push(
      ...result.warnings.map(
        (warn) => `Validation step ${stepNumber} (${step.functionName}): ${warn}`,
      ),
    );
  }

  return {
    finalValue: inputValue, // Validations don't change the value
    steps,
    success,
    errors,
    warnings,
  };
}

/**
 * Execute complete pipeline for a single field
 */
function executeIntegratedField(
  sourceRow: Record<string, DataValue>,
  fieldConfig: IntegratedFieldConfiguration,
  globalParameters: GlobalParameters,
): FieldExecutionResult {
  const result: FieldExecutionResult = {
    sourceColumn: fieldConfig.sourceColumn,
    targetField: fieldConfig.targetField,
    originalValue: sourceRow[fieldConfig.sourceColumn],
    mappedValue: null,
    transformedValue: null,
    finalValue: null,
    transformationSteps: [],
    validationSteps: [],
    success: true,
    errors: [],
    warnings: [],
  };

  try {
    // Step 1: Mapping (sourceColumn → targetField)
    const mappingResult = executeFieldMapping(sourceRow, fieldConfig);
    result.mappedValue = mappingResult.mappedValue;
    result.transformedValue = mappingResult.mappedValue; // Default if no transformations

    // Step 2: Transformations (if any)
    if (fieldConfig.transformations && fieldConfig.transformations.length > 0) {
      const transformationResult = executeFieldTransformations(
        result.mappedValue,
        fieldConfig.transformations,
        globalParameters,
      );

      result.transformedValue = transformationResult.transformedValue;
      result.transformationSteps = transformationResult.steps;

      if (!transformationResult.success) {
        result.success = false;
        result.errors.push(...transformationResult.errors);
      }
    }

    // Step 3: Validations (if any)
    if (fieldConfig.validations && fieldConfig.validations.length > 0) {
      const validationResult = executeFieldValidations(
        result.transformedValue,
        fieldConfig.validations,
        globalParameters,
      );

      result.finalValue = validationResult.finalValue;
      result.validationSteps = validationResult.steps;
      result.warnings.push(...validationResult.warnings);

      if (!validationResult.success) {
        result.success = false;
        result.errors.push(...validationResult.errors);
      }
    } else {
      result.finalValue = result.transformedValue;
    }
  } catch (error) {
    result.success = false;
    result.errors.push(
      `Unexpected error processing field ${fieldConfig.sourceColumn}: ${
        String(
          error,
        )
      }`,
    );
    result.finalValue = result.originalValue; // Fallback
  }

  return result;
}

/**
 * Execute pipeline for a single row
 */
function executeIntegratedRow(
  sourceRow: Record<string, DataValue>,
  rowIndex: number,
  config: IntegratedConfiguration,
): RowExecutionResult {
  const result: RowExecutionResult = {
    rowIndex,
    success: true,
    fieldResults: {},
    transformedRow: {},
    errors: [],
    warnings: [],
  };

  // Execute each field mapping
  for (const fieldConfig of config.fieldMappings) {
    const fieldResult = executeIntegratedField(
      sourceRow,
      fieldConfig,
      config.globalParameters,
    );

    result.fieldResults[fieldConfig.targetField] = fieldResult;

    // Add the transformed field to the output row
    result.transformedRow[fieldConfig.targetField] = fieldResult.finalValue;

    // Aggregate field-level errors and warnings
    if (!fieldResult.success) {
      result.success = false;
      result.errors.push(
        ...fieldResult.errors.map(
          (err) => `Field ${fieldConfig.targetField}: ${err}`,
        ),
      );
    }

    result.warnings.push(
      ...fieldResult.warnings.map(
        (warn) => `Field ${fieldConfig.targetField}: ${warn}`,
      ),
    );
  }

  return result;
}

/**
 * Main integrated executor
 */
export function executeIntegratedConfiguration(
  sourceData: Record<string, DataValue>[],
  config: IntegratedConfiguration,
): IntegratedExecutionResult {
  const result: IntegratedExecutionResult = {
    configurationName: config.name,
    success: true,
    processedRows: 0,
    totalRows: sourceData.length,
    validRows: 0,
    invalidRows: 0,
    rowResults: [],
    fieldStatistics: {},
    transformedData: [],
    globalErrors: [],
    globalWarnings: [],
  };

  // Initialize field statistics
  for (const fieldConfig of config.fieldMappings) {
    result.fieldStatistics[fieldConfig.targetField] = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      mostCommonErrors: [],
      mostCommonWarnings: [],
    };
  }

  // Process each row
  for (let i = 0; i < sourceData.length; i++) {
    const sourceRow = sourceData[i];

    try {
      const rowResult = executeIntegratedRow(sourceRow, i, config);
      result.rowResults.push(rowResult);
      result.processedRows++;

      if (rowResult.success) {
        result.validRows++;
        result.transformedData.push(rowResult.transformedRow);
      } else {
        result.invalidRows++;
        result.success = false;
      }

      // Update field statistics
      for (
        const [fieldName, fieldResult] of Object.entries(
          rowResult.fieldResults,
        )
      ) {
        const stats = result.fieldStatistics[fieldName];
        stats.totalProcessed++;

        if (fieldResult.success) {
          stats.successful++;
        } else {
          stats.failed++;
        }
      }
    } catch (error) {
      result.success = false;
      result.invalidRows++;
      result.globalErrors.push(
        `Row ${i + 1}: Unexpected error - ${String(error)}`,
      );
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
 * Validate integrated configuration before execution
 */
export function validateIntegratedConfiguration(
  config: IntegratedConfiguration,
): ConfigurationValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate basic structure
  if (!config.name) {
    errors.push("Configuration name is required");
  }

  if (!config.fieldMappings || !Array.isArray(config.fieldMappings)) {
    errors.push("Configuration must have fieldMappings array");
    return { valid: false, errors, warnings };
  }

  if (config.fieldMappings.length === 0) {
    warnings.push("No field mappings defined");
  }

  // Validate each field mapping
  for (let i = 0; i < config.fieldMappings.length; i++) {
    const fieldConfig = config.fieldMappings[i];

    if (!fieldConfig.sourceColumn) {
      errors.push(`Field mapping ${i + 1}: sourceColumn is required`);
    }

    if (!fieldConfig.targetField) {
      errors.push(`Field mapping ${i + 1}: targetField is required`);
    }

    // Validate transformation steps
    if (fieldConfig.transformations) {
      for (let j = 0; j < fieldConfig.transformations.length; j++) {
        const step = fieldConfig.transformations[j];
        if (!step.functionName) {
          errors.push(
            `Field mapping ${i + 1}, transformation step ${j + 1}: functionName is required`,
          );
        }
      }
    }

    // Validate validation steps
    if (fieldConfig.validations) {
      for (let j = 0; j < fieldConfig.validations.length; j++) {
        const step = fieldConfig.validations[j];
        if (!step.functionName) {
          errors.push(
            `Field mapping ${i + 1}, validation step ${j + 1}: functionName is required`,
          );
        }
      }
    }
  }

  // Check for duplicate target fields
  const targetFields = config.fieldMappings.map((f) => f.targetField);
  const duplicates = targetFields.filter(
    (field, index) => targetFields.indexOf(field) !== index,
  );

  if (duplicates.length > 0) {
    errors.push(
      `Duplicate target fields found: ${[...new Set(duplicates)].join(", ")}`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
