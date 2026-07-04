/**
 * Table Import Utilities
 *
 * Shared functions for importing data files (CSV, Parquet) into DuckDB tables.
 * Functions take a connection as a parameter for easy reuse and testing.
 *
 * @module loading/table-import
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { WorkspaceImportError } from "@dwkit/domain/errors";
import * as Effect from "effect/Effect";
import { formatNullValues, queryRows, sanitizeTableName } from "./sql.ts";

/**
 * Import a data file into a fresh `tableName`, adding a 1-based `_row_number`
 * column via a sequence for deterministic row numbering.
 *
 * `source` is the SQL `FROM` expression containing a single `?` placeholder for
 * the path (e.g. `read_parquet(?)`); the path is always bound (handling quotes
 * and special chars). `label` names the format in error messages.
 */
function importTable(
  connection: DuckDBConnection,
  tableName: string,
  path: string,
  source: string,
  label: string,
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

      await connection.run(
        `CREATE TABLE "${safeName}" AS
         SELECT *, nextval('${sequenceName}') as _row_number
         FROM ${source}`,
        [path],
      );
    },
    catch: (error) =>
      new WorkspaceImportError({
        message: `Failed to import ${label} '${path}' into table '${tableName}'`,
        cause: error instanceof Error ? error : new Error(String(error)),
      }),
  });
}

export function importCsv(
  connection: DuckDBConnection,
  tableName: string,
  csvPath: string,
  nullValues: readonly string[],
): Effect.Effect<void, WorkspaceImportError> {
  // nullstr stays a literal list because DuckDB rejects a bound list for that
  // named argument; its values are escaped by formatNullValues.
  const nullStrParam = nullValues.length > 0 ? `, nullstr=[${formatNullValues(nullValues)}]` : "";
  return importTable(connection, tableName, csvPath, `read_csv_auto(?${nullStrParam})`, "CSV");
}

export function importParquet(
  connection: DuckDBConnection,
  tableName: string,
  parquetPath: string,
): Effect.Effect<void, WorkspaceImportError> {
  // No nullstr: Parquet NULLs are native (nullValues is a CSV-only concern).
  return importTable(connection, tableName, parquetPath, `read_parquet(?)`, "Parquet");
}

export function getTableValue(
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
