/**
 * Validation Functions Library
 *
 * Implements validation functions that can be executed with parameters
 * Validations return validation results (pass/fail + messages) rather than transformed values
 */

import type { SomePrimitive, GlobalParameters, VocabularyTerm, MockVocabulary } from "./types";

// Use centralized ValidationResult but map 'success' to 'valid' for backward compatibility
interface ValidationResult {
  valid: boolean; // Maps to success in centralized type
  errors: string[];
  warnings: string[];
  value: SomePrimitive; // Original value passed through unchanged
}

// Dataset validation context for row-level validations
export interface DatasetValidationContext {
  // Current row being validated
  currentRow: Record<string, SomePrimitive>;
  currentRowIndex: number;

  // Full dataset access
  dataset: Record<string, SomePrimitive>[];
  totalRows: number;

  // Validation state tracking
  validationMetadata: {
    processedRows: number;
    validRows: number;
    invalidRows: number;
  };

  // Utility functions for dataset queries
  getFieldValue: (fieldName: string) => SomePrimitive;
  getRowsWhere: (
    predicate: (row: Record<string, SomePrimitive>) => boolean
  ) => Record<string, SomePrimitive>[];
  getPreviousRows: () => Record<string, SomePrimitive>[];
  getRowsByFieldValue: (fieldName: string, value: SomePrimitive) => Record<string, SomePrimitive>[];

  // Caching for performance
  cache: Map<string, SomePrimitive>;
  wormsData?: Record<string, SomePrimitive>[]; // Example external dataset
  getWormsRecord?: (id: string) => Record<string, SomePrimitive> | null;
}

// Row-level validation function type
type RowValidationFunction = (
  input: SomePrimitive,
  params: GlobalParameters,
  context: DatasetValidationContext
) => ValidationResult | Promise<ValidationResult>;

// Vocabulary types now imported from centralized types

// Controlled vocabulary validation
export function validateControlledVocabulary(
  input: SomePrimitive,
  params: {
    vocabularyName: string;
    vocabularies: Record<string, MockVocabulary>;
    strict?: boolean; // Override vocabulary's default strictness
    allowEmpty?: boolean;
    caseSensitive?: boolean;
  }
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  // Handle empty values
  if (input === null || input === undefined || input === "") {
    if (params.allowEmpty !== false) {
      return result; // Empty values are valid by default
    } else {
      result.valid = false;
      result.errors.push("Value is required but empty");
      return result;
    }
  }

  const inputStr = String(input);
  const vocabulary = params.vocabularies[params.vocabularyName];

  if (!vocabulary) {
    result.valid = false;
    result.errors.push(`Vocabulary '${params.vocabularyName}' not found`);
    return result;
  }

  const caseSensitive = params.caseSensitive ?? false;
  const searchValue = caseSensitive ? inputStr : inputStr.toLowerCase();
  const isStrict = params.strict ?? vocabulary.strict;

  // Check if value exists in vocabulary
  let found = false;
  for (const termData of vocabulary.terms) {
    const termToCheck = caseSensitive ? termData.term : termData.term.toLowerCase();

    // Check canonical term
    if (termToCheck === searchValue) {
      found = true;
      break;
    }

    // Check synonyms
    const synonymsToCheck = caseSensitive
      ? termData.synonyms
      : termData.synonyms.map((s) => s.toLowerCase());
    if (synonymsToCheck.includes(searchValue)) {
      found = true;
      break;
    }
  }

  if (!found) {
    const allowedTerms = vocabulary.terms.map((t) => t.term).join(", ");
    const message = `Value "${input.toString()}" is not in ${
      isStrict ? "controlled" : "recommended"
    } vocabulary "${params.vocabularyName}". ${
      isStrict ? "Allowed" : "Recommended"
    }: ${allowedTerms}`;

    if (isStrict) {
      result.valid = false;
      result.errors.push(message);
    } else {
      result.warnings.push(message);
    }
  }

  return result;
}

// Data type validation
export function validateDataType(
  input: string | number | boolean | Date,
  params: {
    expectedType: "string" | "number" | "boolean" | "date" | "integer";
    allowEmpty?: boolean;
  }
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  // Handle empty values
  if (input === null || input === undefined || input === "") {
    if (params.allowEmpty !== false) {
      return result;
    } else {
      result.valid = false;
      result.errors.push("Value is required but empty");
      return result;
    }
  }

  switch (params.expectedType) {
    case "string":
      if (typeof input !== "string") {
        result.valid = false;
        result.errors.push(`Expected string, got ${typeof input}`);
      }
      break;

    case "number":
      if (typeof input === "string") {
        const num = parseFloat(input);
        if (isNaN(num)) {
          result.valid = false;
          result.errors.push(`Cannot convert "${input}" to number`);
        }
      } else if (typeof input !== "number") {
        result.valid = false;
        result.errors.push(`Expected number, got ${typeof input}`);
      }
      break;

    case "integer":
      if (typeof input === "string") {
        const num = parseInt(input);
        if (isNaN(num) || !Number.isInteger(num)) {
          result.valid = false;
          result.errors.push(`Cannot convert "${input}" to integer`);
        }
      } else if (!Number.isInteger(input)) {
        result.valid = false;
        result.errors.push(`Expected integer, got ${typeof input}`);
      }
      break;

    case "boolean":
      if (typeof input === "string") {
        const lower = input.toLowerCase();
        if (!["true", "false", "1", "0", "yes", "no"].includes(lower)) {
          result.valid = false;
          result.errors.push(`Cannot convert "${input}" to boolean`);
        }
      } else if (typeof input !== "boolean") {
        result.valid = false;
        result.errors.push(`Expected boolean, got ${typeof input}`);
      }
      break;

    case "date": {
      const dateTest = new Date(String(input));
      if (isNaN(dateTest.getTime())) {
        result.valid = false;
        result.errors.push(`Invalid date format: "${input.toString()}"`);
      }
      break;
    }

    default:
      result.valid = false;
      result.errors.push(`Unknown data type: ${String(params.expectedType)}`);
  }

  return result;
}

// Range validation (for numeric values)
export function validateRange(
  input: number | Date,
  params: {
    min?: number;
    max?: number;
    allowEmpty?: boolean;
  }
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  if (input === null || input === undefined) {
    if (params.allowEmpty !== false) {
      return result;
    } else {
      result.valid = false;
      result.errors.push("Value is required but empty");
      return result;
    }
  }

  const numValue = typeof input === "string" ? parseFloat(input) : Number(input);

  if (isNaN(numValue)) {
    result.valid = false;
    result.errors.push(`Cannot validate range for non-numeric value: "${input.toString()}"`);
    return result;
  }

  if (params.min !== undefined && numValue < params.min) {
    result.valid = false;
    result.errors.push(`Value ${numValue} is below minimum ${params.min}`);
  }

  if (params.max !== undefined && numValue > params.max) {
    result.valid = false;
    result.errors.push(`Value ${numValue} is above maximum ${params.max}`);
  }

  return result;
}

// Length validation (for strings)
export function validateLength(
  input: string | number | Date,
  params: {
    minLength?: number;
    maxLength?: number;
    exactLength?: number;
    allowEmpty?: boolean;
  }
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  if (input === null || input === undefined || input === "") {
    if (params.allowEmpty !== false) {
      return result;
    } else {
      result.valid = false;
      result.errors.push("Value is required but empty");
      return result;
    }
  }

  const strValue = String(input);
  const length = strValue.length;

  if (params.exactLength !== undefined) {
    if (length !== params.exactLength) {
      result.valid = false;
      result.errors.push(`Expected length ${params.exactLength}, got ${length}`);
    }
  } else {
    if (params.minLength !== undefined && length < params.minLength) {
      result.valid = false;
      result.errors.push(`Length ${length} is below minimum ${params.minLength}`);
    }

    if (params.maxLength !== undefined && length > params.maxLength) {
      result.valid = false;
      result.errors.push(`Length ${length} is above maximum ${params.maxLength}`);
    }
  }

  return result;
}

// Pattern validation (regex)
export function validatePattern(
  input: string | number,
  params: {
    pattern: string;
    flags?: string;
    allowEmpty?: boolean;
    description?: string;
  }
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  if (input === null || input === undefined || input === "") {
    if (params.allowEmpty !== false) {
      return result;
    } else {
      result.valid = false;
      result.errors.push("Value is required but empty");
      return result;
    }
  }

  try {
    const regex = new RegExp(params.pattern, params.flags);
    const strValue = String(input);

    if (!regex.test(strValue)) {
      const description = params.description ?? `pattern /${params.pattern}/${params.flags ?? ""}`;
      result.valid = false;
      result.errors.push(`Value "${input}" does not match ${description}`);
    }
  } catch (error) {
    result.valid = false;
    result.errors.push(`Invalid regex pattern: ${(error as Error).toString()}`);
  }

  return result;
}

// Coordinate validation
export function validateCoordinates(
  input: string | number | null,
  params: {
    type: "latitude" | "longitude";
    allowEmpty?: boolean;
  }
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  if (input === null || input === undefined || input === "") {
    if (params.allowEmpty !== false) {
      return result;
    } else {
      result.valid = false;
      result.errors.push("Coordinate value is required but empty");
      return result;
    }
  }

  const numValue = typeof input === "string" ? parseFloat(input) : Number(input);

  if (isNaN(numValue)) {
    result.valid = false;
    result.errors.push(`Invalid coordinate value: "${input}"`);
    return result;
  }

  if (params.type === "latitude") {
    if (numValue < -90 || numValue > 90) {
      result.valid = false;
      result.errors.push(`Latitude ${numValue} must be between -90 and 90 degrees`);
    }
  } else if (params.type === "longitude") {
    if (numValue < -180 || numValue > 180) {
      result.valid = false;
      result.errors.push(`Longitude ${numValue} must be between -180 and 180 degrees`);
    }
  }

  return result;
}

// Date range validation (with sophisticated date handling)
export function validateDateRange(
  input: SomePrimitive,
  params: {
    allowFuture?: boolean;
    minDate?: string;
    maxDate?: string;
    allowEmpty?: boolean;
  } = {}
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  if (!input || input === "") {
    if (params.allowEmpty !== false) {
      return result;
    } else {
      result.valid = false;
      result.errors.push("Date value is required");
      return result;
    }
  }

  let date: Date;

  if (input instanceof Date) {
    date = input;
  } else if (typeof input === "string") {
    date = new Date(input);
  } else {
    result.valid = false;
    result.errors.push("Date must be a string or Date object");
    return result;
  }

  if (isNaN(date.getTime())) {
    result.valid = false;
    result.errors.push("Invalid date format");
    return result;
  }

  const now = new Date();

  // Check future dates
  if (params.allowFuture === false && date > now) {
    result.valid = false;
    result.errors.push("Future dates are not allowed");
  }

  // Check minimum date
  if (params.minDate) {
    const minDate = new Date(params.minDate);
    if (date < minDate) {
      result.valid = false;
      result.errors.push(`Date must be after ${params.minDate}`);
    }
  }

  // Check maximum date
  if (params.maxDate) {
    const maxDate = new Date(params.maxDate);
    if (date > maxDate) {
      result.valid = false;
      result.errors.push(`Date must be before ${params.maxDate}`);
    }
  }

  return result;
}

// Required field validation
export function validateRequired(
  input: SomePrimitive,
  params: { allowEmpty?: boolean } = {}
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  if (input === null || input === undefined) {
    result.valid = false;
    result.errors.push("Field is required");
    return result;
  }

  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed === "" && !params.allowEmpty) {
      result.valid = false;
      result.errors.push("Field cannot be empty");
    }
  }

  return result;
}

// Dataset-aware validation functions

// Validate uniqueness across the dataset
export function validateUnique(
  input: SomePrimitive,
  params: { fieldName?: string; message?: string },
  context: DatasetValidationContext
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  if (input === null || input === undefined || input === "") {
    return result; // Empty values don't need uniqueness validation
  }

  // const fieldName = params.fieldName || 'this field';
  const inputStr = String(input);

  // Find other rows with the same value
  const duplicateRows = context.getRowsWhere((row) => {
    const otherValue = params.fieldName ? row[params.fieldName] : input;
    return (
      otherValue !== null &&
      otherValue !== undefined &&
      otherValue !== "" &&
      otherValue === inputStr &&
      row !== context.currentRow
    ); // Exclude current row
  });

  if (duplicateRows.length > 0) {
    const duplicateIndices = duplicateRows
      .map(
        (row) => context.dataset.indexOf(row) + 1 // 1-based row numbers
      )
      .join(", ");

    const message =
      params.message ?? `Duplicate value "${input.toString()}" found in rows: ${duplicateIndices}`;

    result.valid = false;
    result.errors.push(message);
  }

  return result;
}

// Validate referential integrity within the dataset
export function validateReferentialIntegrity(
  input: SomePrimitive,
  params: {
    referenceField: string;
    referenceValue?: string;
    message?: string;
  },
  context: DatasetValidationContext
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  if (input === null || input === undefined || input === "") {
    return result; // Empty references are allowed
  }

  const inputStr = input;
  const referenceField = params.referenceField;
  const referenceValue = params.referenceValue ?? inputStr;

  // Look for a row that has the referenced value
  const referencedRows = context.getRowsByFieldValue(referenceField, referenceValue);

  if (referencedRows.length === 0) {
    const message =
      params.message ?? `Reference "${input.toString()}" not found in field "${referenceField}"`;

    result.valid = false;
    result.errors.push(message);
  }

  return result;
}

// Validate consistency across related records
export function validateConsistentWithRelated(
  input: SomePrimitive,
  params: {
    groupByField: string;
    consistentFields: string[];
    message?: string;
  },
  context: DatasetValidationContext
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  const groupByValue = context.getFieldValue(params.groupByField);
  if (!groupByValue) return result; // No grouping value

  // Find all rows with the same grouping value
  const relatedRows = context.getRowsByFieldValue(params.groupByField, groupByValue);

  for (const field of params.consistentFields) {
    const currentValue = context.getFieldValue(field);
    if (currentValue === null || currentValue === undefined) continue;

    // Check if all related rows have the same value for this field
    const inconsistentRows = relatedRows.filter((row) => {
      const otherValue = row[field];
      return otherValue !== null && otherValue !== undefined && otherValue !== currentValue;
    });

    if (inconsistentRows.length > 0) {
      const inconsistentIndices = inconsistentRows
        .map((row) => context.dataset.indexOf(row) + 1)
        .join(", ");

      const message =
        params.message ??
        `Field "${field}" should be consistent across records with same ${params.groupByField}. ` +
          `Inconsistent values found in rows: ${inconsistentIndices}`;

      result.valid = false;
      result.errors.push(message);
    }
  }

  return result;
}

// Validate sequential order within the dataset
export function validateSequentialOrder(
  input: SomePrimitive,
  params: {
    orderField: string;
    direction?: "asc" | "desc";
    allowEqual?: boolean;
    message?: string;
  },
  context: DatasetValidationContext
): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    value: input,
  };

  if (input === null || input === undefined || input === "") {
    return result;
  }

  const previousRows = context.getPreviousRows();
  if (previousRows.length === 0) return result; // First row is always valid

  const currentValue = input;
  const direction = params.direction ?? "asc";
  const allowEqual = params.allowEqual ?? false;

  // Check against the immediately previous row
  const previousRow = previousRows[previousRows.length - 1];
  const previousValue = previousRow[params.orderField];

  if (previousValue === null || previousValue === undefined) {
    return result; // Can't compare with null/undefined
  }

  let isValid = true;

  if (direction === "asc") {
    isValid = allowEqual ? currentValue >= previousValue : currentValue > previousValue;
  } else {
    isValid = allowEqual ? currentValue <= previousValue : currentValue < previousValue;
  }

  if (!isValid) {
    const message =
      params.message ??
      `Sequential order violation: expected ${direction}ending order, but ` +
        `"${currentValue.toString()}" ${
          direction === "asc" ? "<=" : ">="
        } "${previousValue.toString()}" from previous row`;

    result.valid = false;
    result.errors.push(message);
  }

  return result;
}

// Function registry for dynamic execution
export const VALIDATION_FUNCTIONS = {
  validateControlledVocabulary,
  validateDataType,
  validateRange,
  validateLength,
  validatePattern,
  validateCoordinates,
  validateDateRange,
  validateRequired,
  // Dataset-aware functions
  validateUnique,
  validateReferentialIntegrity,
  validateConsistentWithRelated,
  validateSequentialOrder,
};

// Generic validation function type (for backward compatibility)
type ValidationFunction = (input: SomePrimitive, params?: GlobalParameters) => ValidationResult;

// Dataset-aware validation functions that need context
const DATASET_AWARE_FUNCTIONS = new Set([
  "validateUnique",
  "validateReferentialIntegrity",
  "validateConsistentWithRelated",
  "validateSequentialOrder",
]);

// Execute validation function by name (backward compatible version)
export function executeValidation(
  functionName: string,
  input: SomePrimitive,
  parameters: GlobalParameters = {}
): ValidationResult {
  return executeValidationWithContext(functionName, input, parameters);
}

// Execute validation function with optional dataset context
export function executeValidationWithContext(
  functionName: string,
  input: SomePrimitive,
  parameters: GlobalParameters = {},
  context?: DatasetValidationContext
): ValidationResult {
  const func = VALIDATION_FUNCTIONS[functionName as keyof typeof VALIDATION_FUNCTIONS];

  if (!func) {
    return {
      valid: false,
      errors: [`Validation function '${functionName}' not found`],
      warnings: [],
      value: input,
    };
  }

  try {
    // Check if this function requires dataset context
    if (DATASET_AWARE_FUNCTIONS.has(functionName)) {
      if (!context) {
        return {
          valid: false,
          errors: [
            `Validation function '${functionName}' requires dataset context but none was provided`,
          ],
          warnings: [],
          value: input,
        };
      }
      // Call with context (handle potential async)
      const result = (func as RowValidationFunction)(input, parameters, context);
      if (result instanceof Promise) {
        // For now, we'll not support async validation functions in the executor
        // This would require making the entire validation pipeline async
        return {
          valid: false,
          errors: [
            `Validation function '${functionName}' returned a Promise but async validation is not yet supported`,
          ],
          warnings: [],
          value: input,
        };
      }
      return result;
    } else {
      // Call regular validation function
      return (func as ValidationFunction)(input, parameters);
    }
  } catch (error) {
    return {
      valid: false,
      errors: [
        `Validation execution error in '${functionName}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      warnings: [],
      value: input,
    };
  }
}
