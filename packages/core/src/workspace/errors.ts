/**
 * Core Error Tag Types
 *
 * Type-only exports for error tags to enable IDE autocomplete and type safety
 * when writing tests. These tags are derived directly from the error classes
 * using TypeScript's type system, ensuring they stay in sync automatically.
 *
 * Usage in tests:
 * ```typescript
 * import type { CoreErrorTag } from "@dwkt/core/errors";
 *
 * await expectError(
 *   someEffect,
 *   "CsvReadError" as CoreErrorTag,  // ← IDE autocomplete!
 *   (error) => {
 *     // error is automatically typed
 *     assertEquals(error.csvPath, "./test.csv");
 *   }
 * );
 * ```
 */

import type { OutputError, TransformationError } from "@dwkt/core";
import { ConfigMissingSettingsError } from "@dwkt/domain";
import { Data } from "effect";

// Re-export ConfigMissingSettingsError from domain (defined alongside type predicates)
export { ConfigMissingSettingsError };

/**
 * Error classes for workspace validation
 */
const WorkspaceValidationErrorBase = Data.TaggedError("WorkspaceValidationError")<{
  readonly message: string;
  readonly cause?: Error;
}>;

/**
 * Represents an error that occurs during the data importing process.
 */
export class WorkspaceImportError extends WorkspaceValidationErrorBase {}

export class WorkspaceValidationError extends WorkspaceValidationErrorBase {}

/**
 * Error classes for workspace configuration operations
 *
 * Using Data.TaggedError for proper Effect integration and type-safe error handling.
 * Each error extends Data.TaggedError with a unique tag for pattern matching.
 */
export class ConfigNotFoundError extends Data.TaggedError("ConfigNotFoundError")<{
  readonly message: string;
  readonly searchDir: string;
  readonly searchedPaths: readonly string[];
}> {}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  readonly message: string;
  readonly configPath: string;
  readonly cause?: Error;
}> {}

export class ConfigValidationError extends Data.TaggedError("ConfigValidationError")<{
  readonly message: string;
  readonly configPath: string;
  readonly validationErrors: readonly string[];
}> {}

export class DatasetFileNotFoundError extends Data.TaggedError("DatasetFileNotFoundError")<{
  readonly message: string;
  readonly datasetName: string;
  readonly filePath: string;
}> {}

/**
 * Union type of all configuration errors
 */
export type ConfigError =
  | ConfigNotFoundError
  | ConfigParseError
  | ConfigMissingSettingsError
  | ConfigValidationError
  | DatasetFileNotFoundError;

/**
 * Union type of all core package error tags
 *
 * Tags are extracted directly from error class _tag properties using
 * InstanceType<typeof ErrorClass>["_tag"]. This ensures the types stay
 * in sync with the actual error definitions automatically.
 */
export type CoreErrorTag =
  // Configuration Management
  | InstanceType<typeof ConfigNotFoundError>["_tag"]
  | InstanceType<typeof ConfigParseError>["_tag"]
  | InstanceType<typeof ConfigMissingSettingsError>["_tag"]
  | InstanceType<typeof ConfigValidationError>["_tag"]
  | InstanceType<typeof DatasetFileNotFoundError>["_tag"]
  // Validation & Import
  | InstanceType<typeof WorkspaceImportError>["_tag"]
  // Transformation & Output
  | InstanceType<typeof TransformationError>["_tag"]
  | InstanceType<typeof OutputError>["_tag"];
