/**
 * Transformation errors - Errors specific to transformation operations
 */

import * as Data from "effect/Data";

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
