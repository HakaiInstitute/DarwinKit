/**
 * CLI Error Types
 *
 * CLI-specific error types with structured data for consistent error handling.
 * Uses Effect's Data.TaggedError for proper Error extension and stack traces.
 *
 * @module errors
 */

import * as Data from 'effect/Data';

/**
 * General CLI error for command execution failures
 *
 * Used for configuration errors, validation failures, and user-facing errors
 * that should display hints and suggest next actions.
 */
export class CLIError extends Data.TaggedError('CLIError')<{
  readonly message: string;
  readonly hint?: string;
  readonly exitCode: number;
}> {}

/**
 * Error when writing output files fails
 *
 * Used for file system errors during result output (JSON files, reports, etc.)
 */
export class OutputError extends Data.TaggedError('OutputError')<{
  readonly message: string;
  readonly outputPath: string;
  readonly cause?: Error;
}> {}

/**
 * Union type of all CLI errors for pattern matching
 */
export type CLIErrorType = CLIError | OutputError;
