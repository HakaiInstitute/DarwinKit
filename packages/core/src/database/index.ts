/**
 * Database module - Pure utility functions for database operations
 *
 * This module provides stateless utility functions for database operations
 * shared across validation and transformation. All functions operate on
 * DuckDB connections provided by the Workspace class.
 *
 * **Important:** This module does NOT manage database connections. Connection
 * lifecycle is owned exclusively by the Workspace class. All functions in this
 * module are pure utilities that accept a connection parameter.
 *
 * Functions provided:
 * - CSV import with row numbering
 * - Schema creation based on validation profiles
 * - Shared utilities for table naming and type definitions
 */

// CSV import (pure function)
export { type CsvImportOptions, importCsv } from "./csv-importer.ts";

// Schema creation (pure function)
export { importSchemaToWorkspace } from "./schema-builder.ts";

// Shared utilities and types
export { type DatasetWithProfile, extractRowNumbers, sanitizeTableName } from "./utils.ts";
