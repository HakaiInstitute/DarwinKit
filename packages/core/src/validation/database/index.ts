/**
 * Database module - Exports for database operations
 *
 * This module provides focused functionality for database operations:
 * - Schema creation based on validation profiles
 * - Row-by-row data loading with constraint violation detection
 * - Shared utilities for table naming and type definitions
 */

// Shared utilities and types
export { type DatasetWithProfile, extractRowNumbers, sanitizeTableName } from "./utils.ts";

// Schema creation
export { importSchemaToWorkspace } from "./schema-builder.ts";

// Data loading with violation detection
export { getOriginalCsvValue, insertRowByRow } from "./data-loader.ts";
