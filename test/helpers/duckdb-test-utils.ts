/**
 * Shared DuckDB test utilities for field validator tests.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import type { DuckDBConnection } from "@duckdb/node-api";
import type { SpecField } from "@dwkt/domain/specs";
import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";

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

export function extractViolations(
  result: Exit.Exit<unknown, unknown>,
): Array<Record<string, unknown>> {
  if (Exit.isSuccess(result)) {
    throw new Error("expected Failure exit");
  }
  const failures = result.cause.reasons
    .filter(Cause.isFailReason)
    .map((reason) => reason.error);
  const flat = failures.flat();
  return flat as Array<Record<string, unknown>>;
}
