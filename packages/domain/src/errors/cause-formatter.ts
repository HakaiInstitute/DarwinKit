/**
 * Generic utilities for pretty-printing Effect Causes
 *
 * This module provides reusable infrastructure for formatting errors
 * using Effect's Cause type, separating Cause-handling logic from
 * domain-specific error formatting.
 */

import * as Cause from "effect/Cause";
// import type {
//   ConfigNotFoundError,
//   ConfigParseError,
//   ConfigValidationError,
//   DatasetFileNotFoundError,
// } from "../../../core/src/workspace/workspace-config-service.ts";

/**
 * Generic error formatter function type
 *
 * Takes an error instance and returns a human-readable string.
 */
type ErrorFormatter<E> = (error: E) => string;

/**
 * Pretty print any Effect Cause with custom error formatting
 *
 * This generic utility handles the Cause API logic (extracting failures,
 * defects, handling multiple errors) while delegating error-specific
 * formatting to the provided formatter function.
 *
 * @param cause - The Effect Cause to format
 * @param formatter - Function to format individual error instances
 * @returns Human-readable error message
 *
 * @example
 * ```typescript
 * const cause = getSomeCause();
 * const message = prettyPrintCause(cause, (error) => {
 *   if (error instanceof MyError) {
 *     return `My error: ${error.message}`;
 *   }
 *   return String(error);
 * });
 * ```
 */
export function prettyPrintCause<E>(
  cause: Cause.Cause<E>,
  formatter: ErrorFormatter<E>,
): string {
  // Extract failures and defects using Cause API
  const failures = Cause.failures(cause);
  const defects = Cause.defects(cause);

  // Handle empty cause
  if (Cause.isEmpty(cause)) {
    return "No errors";
  }

  // Handle defects first (unexpected errors)
  if (defects.length > 0) {
    const defectList = Array.from(defects).map((d) => String(d)).join("\n  - ");
    return `Unexpected defect: ${defectList}\n\nThis indicates a bug. Please report this issue.`;
  }

  // Handle expected errors using provided formatter
  if (failures.length > 0) {
    const errorMessages = Array.from(failures).map(formatter);

    // Multiple errors - show them all
    if (errorMessages.length > 1) {
      return `Multiple errors occurred:\n\n${
        errorMessages.map((msg, idx) => `${idx + 1}. ${msg}`).join("\n\n")
      }`;
    }

    // Single error
    return errorMessages[0] || "Unknown error";
  }

  return "Unknown error state";
}

/**
 * Create an error formatter using Effect's tagged error pattern matching
 *
 * This helper leverages the _tag property from Data.TaggedError to dispatch
 * to the appropriate formatter function, similar to Effect.catchTags.
 * Uses the same pattern matching approach as Effect's error handling.
 *
 * @param formatters - Object mapping _tag values to formatter functions
 * @returns A formatter function that dispatches based on _tag
 *
 * @example
 * ```typescript
 * class FooError extends Data.TaggedError("Foo")<{ message: string }> {}
 * class BarError extends Data.TaggedError("Bar")<{ count: number }> {}
 *
 * const formatter = createTaggedFormatter<FooError | BarError>({
 *   Foo: (error) => `Foo error: ${error.message}`,
 *   Bar: (error) => `Bar error count: ${error.count}`,
 * });
 * ```
 */
export function createTaggedFormatter<
  Errors extends Error & { readonly _tag: string },
>(
  formatters: {
    [K in Errors["_tag"]]: (error: Extract<Errors, { _tag: K }>) => string;
  },
): (error: Errors) => string {
  return (error: Errors) => {
    const formatter = formatters[error._tag as keyof typeof formatters];
    // TypeScript can't narrow the type based on runtime _tag check, but we know it's safe
    return formatter(error as never);
  };
}
