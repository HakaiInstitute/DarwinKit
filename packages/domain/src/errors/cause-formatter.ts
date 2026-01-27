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
export type ErrorFormatter<E> = (error: E) => string;

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
 * class BarError extends Data.TaggedError("Bar")<{ code: number }> {}
 *
 * const formatter = createTaggedFormatter<FooError | BarError>({
 *   Foo: (error) => `Foo error: ${error.message}`,
 *   Bar: (error) => `Bar error code: ${error.code}`,
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

/**
 * @deprecated Use createTaggedFormatter instead for Effect TaggedError types
 *
 * Create an error formatter that handles multiple error types
 *
 * This helper makes it easy to create formatters that handle different
 * error types with type-safe instanceof checks.
 *
 * Each formatter pair can handle a different error type - the array accepts
 * heterogeneous error types.
 *
 * @param formatters - Array of [constructor, formatter] pairs. Each pair consists of
 *                     an error constructor and a function that formats that error type.
 *                     The function will receive a correctly-typed instance when the
 *                     instanceof check passes at runtime.
 * @param defaultFormatter - Fallback formatter for unknown error types
 * @returns A formatter function that dispatches to the appropriate handler
 */
export function createMultiErrorFormatter<E>(
  formatters: ReadonlyArray<
    readonly [
      // Constructor - can construct a type that E might be
      // deno-lint-ignore no-explicit-any
      abstract new (...args: any[]) => any,
      // Formatter - receives the specific error type from the constructor
      // We use (error: never) => string as a catch-all signature that accepts
      // any function taking a single parameter and returning string
      (error: never) => string,
    ]
  >,
  defaultFormatter: (error: E) => string = (e) => `Unknown error: ${e}`,
): ErrorFormatter<E> {
  return (error: E) => {
    for (const [Constructor, format] of formatters) {
      if (error instanceof Constructor) {
        // The instanceof check ensures error is the correct type for format
        // TypeScript can't verify this statically, but it's safe at runtime
        return format(error as never);
      }
    }
    return defaultFormatter(error);
  };
}
