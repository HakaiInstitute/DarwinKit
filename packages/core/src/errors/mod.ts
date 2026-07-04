/**
 * Core Error Types
 *
 * Error definitions specific to the core package.
 * Workspace error types (ConfigNotFoundError, WorkspaceValidationError, etc.)
 * should be imported from @dwkit/domain/errors. `ValidationError` here is an
 * internal core type, not part of the package's public exports.
 */

import * as Data from "effect/Data";

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
