/**
 * Validation Module
 *
 * Re-exports all validation functionality for external consumption.
 *
 * @module validation
 */

// Core validation utilities
export {
  calculateSummary,
  determineOverallStatus,
  findSuggestedValue,
  type ParsedErrorInfo,
  parseDuckDBError,
  partitionViolations,
  type ValidationSummary,
} from "./utils.ts";

// Field-level validators
export {
  findRangeViolations,
  findUniquenessViolations,
  findVocabularyViolations,
  validateRangeConstraints,
  validateUniqueness,
  validateVocabulary,
  vocabularyEnforcementToStandard,
} from "./field-validators.ts";

// Cross-dataset constraint validation
export {
  type CrossDatasetRule,
  findCrossDatasetViolations,
  resolveSchemaTableName,
  validateCrossDatasetRule,
} from "./constraint-validator.ts";

// Row-by-row data loading with violation collection
export { type ColumnMapping, getOriginalCsvValue, insertRowByRow } from "./data-loader.ts";

// Workspace validation (main entry point)
export { WorkspaceValidator } from "./workspace-validator.ts";

// Validation error classes
export { WorkspaceImportError, WorkspaceValidationError } from "./validation-errors.ts";
