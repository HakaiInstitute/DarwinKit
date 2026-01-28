/**
 * Core Error Types
 *
 * Centralized error definitions for the core package. Re-exports specialized
 * error types from their source modules for convenient imports.
 *
 * Usage:
 * ```typescript
 * import { ValidationError, WorkspaceValidationError } from "@dwkt/core/errors";
 *
 * // For workspace validation operations
 * return Effect.fail(new WorkspaceValidationError({
 *   message: "Validation failed",
 *   cause: originalError,
 * }));
 *
 * // For simplified validation interface
 * return Effect.fail(new ValidationError({
 *   message: "Validation failed",
 * }));
 * ```
 */

import * as Data from "effect/Data";

// Re-export error classes from their source modules
export { ParseError } from "../loading/csv-parser.ts";
export type { OutputError, TransformationError } from "../transform/transform.ts";
export {
  WorkspaceImportError,
  WorkspaceValidationError,
} from "../validation/workspace-validator.ts";
export {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
  formatWorkspaceConfigError,
  prettyPrintWorkspaceError,
  TransformInputNotFoundError,
  ValidationConfigMissingError,
  type WorkspaceConfigError,
} from "../workspace/errors.ts";

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
