/**
 * Validation module - Exports for workspace validation functionality
 *
 * This module provides a single entry point for all validation-related functionality.
 * Organized by category for clarity.
 */

// Error classes and utilities
export {
  calculateSummary,
  findSuggestedValue,
  type ParsedErrorInfo,
  parseDuckDBError,
  partitionFieldViolations,
  WorkspaceImportError,
  WorkspaceValidationError,
} from "./utils.ts";

// Field-level validators
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
  getOriginalCsvValue,
  importCsvToWorkspace,
  importSchemaToWorkspace,
  insertRowByRow,
  sanitizeTableName,
} from "./database/index.ts";
