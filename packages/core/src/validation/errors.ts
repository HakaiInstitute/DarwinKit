/**
 * Validation Error Types
 *
 * Error classes for validation operations. Extracted to avoid circular
 * dependencies between workspace-validator.ts and the modular validation files.
 *
 * @module validation/errors
 */

import * as Data from "effect/Data";

/**
 * Base class for workspace validation errors
 */
const WorkspaceValidationErrorBase = Data.TaggedClass(
  "WorkspaceValidationError",
)<{
  readonly message: string;
  readonly cause?: Error;
}>;

/**
 * Error that occurs during workspace validation
 */
export class WorkspaceValidationError extends WorkspaceValidationErrorBase {}

/**
 * Error that occurs during the data importing process
 */
export class WorkspaceImportError extends WorkspaceValidationErrorBase {}
