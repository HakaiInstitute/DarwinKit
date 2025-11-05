/**
 * Shared Effect utilities for common operations
 */

import * as Effect from "effect/Effect";
import type { DuckDBConnection } from "@duckdb/node-api";

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

/**
 * Ensure directory exists (creates recursively)
 */
export function ensureDir(dirPath: string): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => Deno.mkdir(dirPath, { recursive: true }),
    catch: toError,
  });
}

/**
 * Run DuckDB query and return typed results
 */
export function runQuery<T>(
  connection: DuckDBConnection,
  query: string,
): Effect.Effect<T[], Error> {
  return Effect.tryPromise({
    try: async () => {
      const result = await connection.runAndReadAll(query);
      return result.getRowObjects() as T[];
    },
    catch: toError,
  });
}
