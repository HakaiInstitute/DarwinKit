/**
 * CSV Import - Operations for importing CSV files into DuckDB tables
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { ErrorCode } from "@dwkt/domain";
import * as Effect from "effect/Effect";
import { WorkspaceImportError } from "../utils.ts";

/**
 * Imports a CSV file into a DuckDB table with a _row_number column.
 *
 * This function creates a table from a CSV file with deterministic row numbering,
 * which is essential for tracking validation violations back to their source rows.
 *
 * @param connection - The DuckDB connection to use for the import
 * @param tableName - The name of the table to create or import into
 * @param fullPath - The full file path to the CSV file to import
 * @param nullStr - The string value(s) to treat as NULL in the CSV (e.g., "NA", "null")
 * @param dropTable - If true, drops the table if it exists before creating it. Defaults to false
 * @returns An Effect that completes when the CSV has been successfully imported, or fails with a WorkspaceImportError
 *
 * @example
 * ```typescript
 * const result = yield* _(
 *   WorkspaceImportCSV(
 *     connection,
 *     "raw_events",
 *     "/path/to/events.csv",
 *     "'NA', 'N/A'",
 *     true // dropTable
 *   )
 * );
 * ```
 */

export function WorkspaceImportCSV(
  connection: DuckDBConnection,
  tableName: string,
  fullPath: string,
  nullStr: string,
  dropTable: boolean = false,
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    yield* _(Effect.tryPromise({
      try: async () => {
        const sequenceName = `${tableName}_seq`;

        if (dropTable) {
          connection.run(`DROP TABLE IF EXISTS ${tableName}`);
          connection.run(`DROP SEQUENCE IF EXISTS ${sequenceName}`);
        }

        // Create sequence for deterministic row numbering
        await connection.run(`CREATE SEQUENCE IF NOT EXISTS ${sequenceName} START 1`);

        await connection.run(
          `CREATE TABLE IF NOT EXISTS ${tableName} AS
           SELECT *, nextval('${sequenceName}') as _row_number
           FROM read_csv_auto('${fullPath}', nullstr=[${nullStr}])`,
        );
      },
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to create table '${tableName}' from CSV ${fullPath}`,
          code: ErrorCode.DATABASE_ERROR,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    }));
  });
}
