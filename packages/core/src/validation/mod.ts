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

// Row-by-row data loading with violation collection
export { type ColumnMapping, insertRowByRow } from "./data-loader.ts";

// Dataset rule validators (dependency rules)
export { validateDependencyRule } from "./dataset-rule-validators.ts";

// Workspace validation (main entry point)
export { WorkspaceValidator } from "./workspace-validator.ts";
