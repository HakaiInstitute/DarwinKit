/**
 * Shared DuckDB test utilities for field validator tests.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import type { DuckDBConnection } from "@duckdb/node-api";
import { assert } from "@std/assert";
import type { SpecField } from "@dwkt/domain/specs";

export const TABLE = "test_data";

export async function setupTable(
  connection: DuckDBConnection,
  columns: string,
  rows: string[],
): Promise<void> {
  await connection.run(`CREATE TABLE ${TABLE} (_row_number INTEGER, ${columns})`);
  for (const row of rows) {
    await connection.run(`INSERT INTO ${TABLE} VALUES (${row})`);
  }
}

export function makeField(
  name: string,
  constraints: SpecField["constraints"],
): SpecField {
  return { name, constraints };
}

export async function withConnection(fn: (conn: DuckDBConnection) => Promise<void>): Promise<void> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  try {
    await fn(connection);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

// deno-lint-ignore no-explicit-any
export function extractViolations(result: any): Array<Record<string, unknown>> {
  assert(result._tag === "Failure", "expected Failure exit");
  return (result.cause as { error: unknown }).error as Array<Record<string, unknown>>;
}
