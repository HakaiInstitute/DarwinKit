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

// Re-export error classes from their source modules for backward compatibility
import type { ParseError } from "../parsing/csv-parser.ts";
export { ParseError } from "../parsing/csv-parser.ts";
export {
  WorkspaceImportError,
  WorkspaceValidationError,
} from "../validation/workspace-validator.ts";

import type {
  WorkspaceImportError,
  WorkspaceValidationError,
} from "../validation/workspace-validator.ts";

/**
 * Represents an error that occurs during the data transformation process.
 */
export class TransformationError extends Data.TaggedError("TransformationError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

/**
 * Represents an error that occurs during the output process.
 */
export class OutputError extends Data.TaggedError("OutputError")<{
  readonly message: string;
  readonly outputPath: string;
  readonly cause?: Error;
}> {}

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
 * Extract the _tag literal type from a tagged error class.
 *
 * Works with any class that has instances with a readonly _tag property,
 * which includes all Data.TaggedError subclasses.
 */
type ErrorTag<T extends abstract new (...args: never[]) => { readonly _tag: string }> =
  InstanceType<T>["_tag"];

/**
 * Union type of all core package error tags
 *
 * Tags are extracted directly from error class _tag properties using
 * InstanceType<typeof ErrorClass>["_tag"]. This ensures the types stay
 * in sync with the actual error definitions automatically.
 */
export type CoreErrorTag =
  // Validation Operations
  | ErrorTag<typeof ValidationError>
  // CSV Parsing & Reading (re-exported)
  | ErrorTag<typeof ParseError>
  // Validation & Import (re-exported)
  | ErrorTag<typeof WorkspaceImportError>
  | ErrorTag<typeof WorkspaceValidationError>
  // Transformation & Output (re-exported)
  | ErrorTag<typeof TransformationError>
  | ErrorTag<typeof OutputError>;
