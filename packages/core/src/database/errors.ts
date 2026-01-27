/**
 * Database Error Types
 *
 * Specialized error types for database operations with rich context.
 * Uses Effect's Data.TaggedError for pattern matching support.
 *
 * @module database/errors
 */

import * as Data from "effect/Data";

/**
 * Error when importing a CSV file into a table fails
 */
export class DatasetImportError extends Data.TaggedError("DatasetImportError")<{
  readonly tableName: string;
  readonly csvPath: string;
  readonly message: string;
  readonly cause?: Error;
}> {}

/**
 * Error when creating schema elements (tables, enums, constraints) fails
 */
export class SchemaCreationError extends Data.TaggedError("SchemaCreationError")<{
  readonly tableName: string;
  readonly operation: "createTable" | "createEnum" | "addConstraint" | "dropTable";
  readonly message: string;
  readonly sql?: string;
  readonly cause?: Error;
}> {}

/**
 * Error when a referenced table does not exist
 */
export class TableNotFoundError extends Data.TaggedError("TableNotFoundError")<{
  readonly tableName: string;
  readonly message: string;
}> {}

/**
 * Union of all database errors for pattern matching
 */
export type DatabaseError =
  | DatasetImportError
  | SchemaCreationError
  | TableNotFoundError;
