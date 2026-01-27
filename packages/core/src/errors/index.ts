/**
 * Core Error Types
 *
 * Centralized error definitions for the core package. All error types are defined
 * here to ensure consistency and avoid duplicate definitions across services.
 *
 * Usage:
 * ```typescript
 * import { WorkspaceError, ValidationError } from "@dwkt/core/errors";
 *
 * // In service code
 * return Effect.fail(new WorkspaceError({
 *   message: "Configuration not found",
 *   cause: originalError,
 * }));
 * ```
 */

import * as Data from "effect/Data";

// Re-export error classes from their source modules for backward compatibility
import type { ParseError } from "../parsing/csv-parser.ts";
export { ParseError } from "../parsing/csv-parser.ts";
export { OutputError, TransformationError } from "../transform/transform.ts";
export { CsvReadError } from "../validation/csv-row-reader.ts";
export {
  WorkspaceImportError,
  WorkspaceValidationError,
} from "../validation/workspace-validator.ts";

import type { CsvReadError } from "../validation/csv-row-reader.ts";

import type { OutputError, TransformationError } from "../transform/transform.ts";

import type {
  WorkspaceImportError,
  WorkspaceValidationError,
} from "../validation/workspace-validator.ts";

/**
 * Workspace operation errors
 *
 * Used for configuration loading, file discovery, and workspace management.
 */
export class WorkspaceError extends Data.TaggedError("WorkspaceError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

/**
 * Validation operation errors
 *
 * Used for dataset validation failures including field mapping errors,
 * constraint violations, and validation service errors.
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

/**
 * Configuration error
 *
 * Used for configuration parsing and schema validation errors.
 */
export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly message: string;
  readonly path?: string;
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
  // Workspace & Config Operations
  | ErrorTag<typeof WorkspaceError>
  | ErrorTag<typeof ValidationError>
  | ErrorTag<typeof ConfigError>
  // CSV Parsing & Reading (re-exported)
  | ErrorTag<typeof ParseError>
  | ErrorTag<typeof CsvReadError>
  // Validation & Import (re-exported)
  | ErrorTag<typeof WorkspaceImportError>
  | ErrorTag<typeof WorkspaceValidationError>
  // Transformation & Output (re-exported)
  | ErrorTag<typeof TransformationError>
  | ErrorTag<typeof OutputError>;
