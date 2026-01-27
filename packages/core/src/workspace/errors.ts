/**
 * Workspace Error Types
 *
 * Specialized error types for workspace operations with rich context.
 * Uses Effect's Data.TaggedError for pattern matching support.
 *
 * @module workspace/errors
 */

import * as Data from "effect/Data";
import { createTaggedFormatter, prettyPrintCause } from "@dwkt/domain";
import type * as Cause from "effect/Cause";

/**
 * Error when configuration file is not found after searching
 */
export class ConfigNotFoundError extends Data.TaggedError("ConfigNotFoundError")<{
  readonly message: string;
  readonly searchedPaths: readonly string[];
  readonly startDirectory: string;
}> {
  /**
   * Get a human-readable description of where we searched
   */
  get searchDescription(): string {
    return this.searchedPaths.map((p) => `  - ${p}`).join("\n");
  }
}

/**
 * Error when configuration file cannot be parsed (invalid JSON/YAML)
 */
export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  readonly message: string;
  readonly configPath: string;
  readonly format: "json" | "yaml";
  readonly cause?: Error;
}> {}

/**
 * Error when configuration fails schema validation
 */
export class ConfigValidationError extends Data.TaggedError("ConfigValidationError")<{
  readonly message: string;
  readonly configPath: string;
  readonly validationErrors: readonly string[];
}> {
  /**
   * Get formatted list of validation errors
   */
  get errorList(): string {
    return this.validationErrors.map((e) => `  - ${e}`).join("\n");
  }
}

/**
 * Error when a dataset file referenced in config does not exist
 */
export class DatasetFileNotFoundError extends Data.TaggedError("DatasetFileNotFoundError")<{
  readonly message: string;
  readonly datasetName: string;
  readonly filePath: string;
  readonly configPath: string;
}> {}

/**
 * Error when a transform input file does not exist
 */
export class TransformInputNotFoundError extends Data.TaggedError("TransformInputNotFoundError")<{
  readonly message: string;
  readonly inputName: string;
  readonly filePath: string;
  readonly configPath: string;
}> {}

/**
 * Error when workspace validation configuration is missing
 */
export class ValidationConfigMissingError extends Data.TaggedError("ValidationConfigMissingError")<{
  readonly message: string;
  readonly workspaceName: string;
}> {}

/**
 * Union type of all workspace configuration errors for pattern matching
 *
 * @example
 * ```typescript
 * Effect.catchTags({
 *   ConfigNotFoundError: (e) => Effect.succeed(`Not found: ${e.searchDescription}`),
 *   ConfigParseError: (e) => Effect.succeed(`Parse error in ${e.configPath}`),
 *   ConfigValidationError: (e) => Effect.succeed(`Invalid config: ${e.errorList}`),
 *   DatasetFileNotFoundError: (e) => Effect.succeed(`Missing: ${e.filePath}`),
 * })
 * ```
 */
export type WorkspaceConfigError =
  | ConfigNotFoundError
  | ConfigParseError
  | ConfigValidationError
  | DatasetFileNotFoundError
  | TransformInputNotFoundError
  | ValidationConfigMissingError;

/**
 * Formatter for workspace configuration errors
 *
 * Uses createTaggedFormatter for consistent error message formatting.
 */
export const formatWorkspaceConfigError = createTaggedFormatter<WorkspaceConfigError>({
  ConfigNotFoundError: (error) =>
    `Configuration file not found\n\n` +
    `Started searching from: ${error.startDirectory}\n\n` +
    `Searched paths:\n${error.searchDescription}\n\n` +
    `Create a darwinkit.json file to define your workspace configuration.`,

  ConfigParseError: (error) =>
    `Failed to parse configuration file\n\n` +
    `File: ${error.configPath}\n` +
    `Format: ${error.format.toUpperCase()}\n\n` +
    `${error.cause?.message ?? error.message}\n\n` +
    `Check that the file contains valid ${error.format.toUpperCase()} syntax.`,

  ConfigValidationError: (error) =>
    `Configuration validation failed\n\n` +
    `File: ${error.configPath}\n\n` +
    `Validation errors:\n${error.errorList}\n\n` +
    `Review the configuration schema and fix the errors above.`,

  DatasetFileNotFoundError: (error) =>
    `Dataset file not found\n\n` +
    `Dataset: ${error.datasetName}\n` +
    `Path: ${error.filePath}\n` +
    `Config: ${error.configPath}\n\n` +
    `Check that the path in darwinkit.json is correct and the file exists.`,

  TransformInputNotFoundError: (error) =>
    `Transform input file not found\n\n` +
    `Input: ${error.inputName}\n` +
    `Path: ${error.filePath}\n` +
    `Config: ${error.configPath}\n\n` +
    `Check that the path in darwinkit.json is correct and the file exists.`,

  ValidationConfigMissingError: (error) =>
    `Validation configuration missing\n\n` +
    `Workspace: ${error.workspaceName}\n\n` +
    `Add a "validation" section to darwinkit.json with datasets to validate.`,
});

/**
 * Pretty print a workspace configuration error Cause
 *
 * @param cause - The Effect Cause containing the error
 * @returns Human-readable error message
 *
 * @example
 * ```typescript
 * const result = await Effect.runPromiseExit(loadWorkspace());
 * if (result._tag === "Failure") {
 *   console.error(prettyPrintWorkspaceError(result.cause));
 * }
 * ```
 */
export function prettyPrintWorkspaceError(
  cause: Cause.Cause<WorkspaceConfigError>,
): string {
  return prettyPrintCause(cause, formatWorkspaceConfigError);
}
