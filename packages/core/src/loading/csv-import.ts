/**
 * CSV Import Utilities
 *
 * Shared functions for importing CSV files into DuckDB tables.
 * Functions take a connection as a parameter for easy reuse and testing.
 *
 * @module loading/csv-import
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { WorkspaceImportError } from "@dwkt/domain/errors";
import * as Effect from "effect/Effect";
import { formatNullValues, queryRows, sanitizeTableName } from "./sql.ts";

export function importCsv(
  connection: DuckDBConnection,
  tableName: string,
  csvPath: string,
  nullValues: readonly string[],
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.tryPromise({
    try: async () => {
      const safeName = sanitizeTableName(tableName);
      const sequenceName = `${safeName}_seq`;
      const nullStrParam = nullValues.length > 0
        ? `, nullstr=[${formatNullValues(nullValues)}]`
        : "";

      // Drop existing table and sequence for clean import
      await connection.run(`DROP TABLE IF EXISTS "${safeName}"`);
      await connection.run(`DROP SEQUENCE IF EXISTS ${sequenceName}`);

      // Create sequence for deterministic row numbering
      await connection.run(`CREATE SEQUENCE ${sequenceName} START 1`);

      await connection.run(
        `CREATE TABLE "${safeName}" AS
         SELECT *, nextval('${sequenceName}') as _row_number
         FROM read_csv_auto('${csvPath}'${nullStrParam})`,
      );
    },
    catch: (error) =>
      new WorkspaceImportError({
        message: `Failed to import CSV '${csvPath}' into table '${tableName}'`,
        cause: error instanceof Error ? error : new Error(String(error)),
      }),
  });
}

export function importParquet(
  connection: DuckDBConnection,
  tableName: string,
  parquetPath: string,
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.tryPromise({
    try: async () => {
      const safeName = sanitizeTableName(tableName);
      const sequenceName = `${safeName}_seq`;

      // Drop existing table and sequence for clean import
      await connection.run(`DROP TABLE IF EXISTS "${safeName}"`);
      await connection.run(`DROP SEQUENCE IF EXISTS ${sequenceName}`);

      // Create sequence for deterministic row numbering
      await connection.run(`CREATE SEQUENCE ${sequenceName} START 1`);

      // No nullstr: Parquet NULLs are native (nullValues is a CSV-only concern).
      await connection.run(
        `CREATE TABLE "${safeName}" AS
         SELECT *, nextval('${sequenceName}') as _row_number
         FROM read_parquet('${parquetPath}')`,
      );
    },
    catch: (error) =>
      new WorkspaceImportError({
        message: `Failed to import Parquet '${parquetPath}' into table '${tableName}'`,
        cause: error instanceof Error ? error : new Error(String(error)),
      }),
  });
}

export function getCsvValue(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  rowNumber: number,
): Effect.Effect<string> {
  return Effect.gen(function* () {
    const safeName = sanitizeTableName(tableName);
    const query = `
      SELECT "${fieldName}" as value
      FROM "${safeName}"
      WHERE _row_number = ${rowNumber}
    `;

    const rows = yield* queryRows(connection, query);
    if (rows.length === 0) {
      return "";
    }

    return String(rows[0].value ?? "");
  });
}
