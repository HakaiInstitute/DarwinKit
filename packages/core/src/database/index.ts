/**
 * Database Repository Layer
 *
 * Provides a repository-based abstraction for DuckDB operations following
 * Effect's service pattern. Each repository has `.layer` for production
 * and `.testLayer` for unit testing.
 *
 * @module database
 */

// Connection service
export { DbConnection } from "./connection.ts";

// Repositories
export { DatasetRepo } from "./dataset-repo.ts";
export { type ColumnDef, type ColumnInfo, SchemaRepo, type TableSchema } from "./schema-repo.ts";

// Query Runner (escape hatch for arbitrary SQL)
export { type QueryRow, QueryRunner } from "./query-runner.ts";

// Errors
export {
  type DatabaseError,
  DatasetImportError,
  QueryError,
  SchemaCreationError,
  TableNotFoundError,
} from "./errors.ts";

// Utilities
export { escapeString, formatNullValues, sanitizeTableName } from "./utils.ts";
