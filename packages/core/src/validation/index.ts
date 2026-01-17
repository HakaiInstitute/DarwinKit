/**
 * Validation module - Exports for workspace validation functionality
 *
 * This module provides validation functionality using class-based validators
 * and utility functions. Organized by category for clarity.
 */

// Validation classes (NEW - preferred approach)
export { ConstraintValidator } from "./constraint-validator.ts";
export { FieldValidator } from "./field-validator.ts";

// Error classes and utilities
export {
  calculateSummary,
  findSuggestedValue,
  type ParsedErrorInfo,
  parseDuckDBError,
  partitionFieldViolations,
} from "./utils.ts";

// Backward-compatible validation functions (kept for compatibility)
export {
  findCrossDatasetViolations,
  findRangeViolations,
  findUniquenessViolations,
  findVocabularyViolations,
  resolveSchemaTableName,
  validateCrossDatasetRule,
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
