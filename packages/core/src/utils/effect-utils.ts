/**
 * Shared Effect utilities for common operations
 */

import * as Effect from "effect/Effect";

/**
 * Convert unknown errors to Error instances
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Read file contents
 */
export function readFile(filePath: string): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: () => Deno.readTextFile(filePath),
    catch: toError,
  });
}

/**
 * Write content to file
 */
export function writeFile(filePath: string, content: string): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => Deno.writeTextFile(filePath, content),
    catch: toError,
  });
}
