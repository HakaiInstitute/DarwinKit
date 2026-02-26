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

// Field-level validators
export {
  findRangeViolations,
  findUniquenessViolations,
  validateRangeConstraints,
  validateUniqueness,
} from "./field-validators.ts";

// Row-by-row data loading with violation collection
export { type ColumnMapping, insertRowByRow } from "./data-loader.ts";

// Workspace validation (main entry point)
export { WorkspaceValidator } from "./workspace-validator.ts";
