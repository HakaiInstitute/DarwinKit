/**
 * SQL utilities for DuckDB operations
 *
 * @module loading/sql
 */

import type { DuckDBConnection, DuckDBValue, Json } from "@duckdb/node-api";
import * as Effect from "effect/Effect";

export function sanitizeTableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Run a read query against our own in-memory DuckDB and return the row objects.
 * A failure here is a defect (`Effect.orDie`): these queries run against tables
 * we created, so a failure is a bug, not a user-fixable error.
 *
 * NOTE: callers that must treat a query failure as an *expected* error (e.g. a
 * user-supplied regex in `findPatternViolations`) deliberately use
 * `Effect.tryPromise` + `Effect.result` directly instead of this helper.
 */
export function queryRows(
  connection: DuckDBConnection,
  sql: string,
  values?: DuckDBValue[] | Record<string, DuckDBValue>,
): Effect.Effect<Record<string, Json>[]> {
  return Effect.tryPromise(() => connection.runAndReadAll(sql, values)).pipe(
    Effect.orDie,
    Effect.map((result) => result.getRowObjectsJson()),
  );
}

function escapeString(value: string): string {
  return value.replace(/'/g, "''");
}

export function formatNullValues(nullValues: readonly string[]): string {
  return nullValues.map((v) => `'${escapeString(v)}'`).join(", ");
}
