/**
 * Validation Module
 *
 * Re-exports all validation functionality for external consumption.
 *
 * @module validation
 */

// String matching utilities
export { findSuggestedValue } from "./string-matching.ts";

// Summary utilities
export {
  calculateSummary,
  determineOverallStatus,
  hasControlledVocabulary,
  partitionViolations,
  resolveSchemaTableName,
  type ValidationSummary,
} from "./summary.ts";

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

// Row-by-row data loading with violation collection
export { type ColumnMapping, insertRowByRow } from "./data-loader.ts";

// Workspace validation (main entry point)
export { WorkspaceValidator } from "./workspace-validator.ts";

// Validation error classes
export { WorkspaceImportError, WorkspaceValidationError } from "./errors.ts";
