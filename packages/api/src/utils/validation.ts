/**
 * Effect Schema validation utilities for Hono
 */

import type { Context } from "hono";
import * as S from "effect/Schema";
import * as ParseResult from "effect/ParseResult";
import * as Either from "effect/Either";

/**
 * Creates a Hono validator middleware using Effect Schema
 * Uses Either to avoid throwing exceptions
 */
export function effectValidator<A, I>(schema: S.Schema<A, I, never>) {
  return (value: unknown, c: Context) => {
    const result = S.decodeUnknownEither(schema)(value);

    if (Either.isLeft(result)) {
      const error = result.left;
      if (ParseResult.isParseError(error)) {
        // Format the parse error for user-friendly response
        const formatted = ParseResult.ArrayFormatter.formatErrorSync(error);
        return c.json(
          {
            error: "Validation failed",
            details: formatted.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          400,
        );
      }

      // Unexpected error - throw it
      throw error;
    }

    return result.right;
  };
}
