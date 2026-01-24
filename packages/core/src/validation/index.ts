/**
 * Validation module - Exports for workspace validation functionality
 *
 * This module provides validation functionality using Either-based validators
 * and utility functions. Organized by category for clarity.
 */

// Validation classes
export { ConstraintValidator } from "./constraint-validator.ts";

// Error classes and utilities
export {
  calculateSummary,
  findSuggestedValue,
  type ParsedErrorInfo,
  parseDuckDBError,
  partitionFieldViolations,
} from "./utils.ts";

// Field-level validation functions (Either-based with error channel)
export {
  resolveSchemaTableName,
  validateCrossDatasetRule,
  validateField,
  validateRangeConstraint,
  validateRangeConstraints,
  validateUniqueness,
  validateVocabulary,
  vocabularyEnforcementToStandard,
} from "./field-validators.ts";

// Dataset validation orchestration
export { validateDataset } from "./dataset-validator.ts";

// Database operations
export {
  type DatasetWithProfile,
  importSchemaToWorkspace,
  sanitizeTableName,
} from "../database/index.ts";

// Data loading with constraint violation detection
export { getOriginalCsvValue, insertRowByRow } from "./data-loader.ts";
