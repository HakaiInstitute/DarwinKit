/**
 * Core Error Types
 *
 * Error definitions specific to the core package.
 * Workspace error types (ConfigNotFoundError, WorkspaceValidationError, etc.)
 * should be imported from @dwkt/domain.
 *
 * Usage:
 * ```typescript
 * import { ValidationError, CsvImportError } from "@dwkt/core";
 * import { WorkspaceValidationError } from "@dwkt/domain";
 * ```
 */

import * as Data from "effect/Data";

// Core-specific error types
export { ParseError } from "../loading/csv-parser.ts";
export type { OutputError, TransformationError } from "../transform/transform.ts";

/**
 * Validation operation errors
 *
 * Used as a simplified error interface for validation operations.
 * Wraps WorkspaceValidationError with a consistent interface.
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

/**
 * CSV import operation errors
 */
export class CsvImportError extends Data.TaggedClass("CsvImportError")<{
  readonly message: string;
  readonly tableName: string;
  readonly csvPath: string;
  readonly cause?: Error;
}> {
  constructor(message: string, tableName: string, csvPath: string, cause?: Error) {
    super({ message, tableName, csvPath, cause });
  }
}
