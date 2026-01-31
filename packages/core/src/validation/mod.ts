/**
 * Validation Module
 *
 * Exports validation functionality for external consumption.
 * Note: Error types and domain utilities should be imported from @dwkt/domain.
 *
 * @module validation
 */

// String matching utilities
export { findSuggestedValue } from "./string-matching.ts";

// Summary utilities (resolveSchemaTableName is core-specific due to DuckDB dependency)
export { resolveSchemaTableName } from "./summary.ts";

// Field-level validators
export {
  findRangeViolations,
  findUniquenessViolations,
  findVocabularyViolations,
  validateRangeConstraints,
  validateUniqueness,
  validateVocabulary,
} from "./field-validators.ts";

// Row-by-row data loading with violation collection
export { type ColumnMapping, insertRowByRow } from "./data-loader.ts";

// Workspace validation (main entry point)
export { WorkspaceValidator } from "./workspace-validator.ts";
