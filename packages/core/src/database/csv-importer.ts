/**
 * CSV Importer - Import CSV files into DuckDB tables
 *
 * Pure utility function for importing CSV files into DuckDB with automatic
 * row numbering for deterministic validation and error reporting.
 *
 * This module contains stateless functions that operate on DuckDB connections
 * provided by the Workspace class. It does not manage connections itself.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { WorkspaceImportError } from "@dwkt/core";
import { ErrorCode } from "@dwkt/domain";
import * as Effect from "effect/Effect";

/**
 * Options for CSV import
 */
export interface CsvImportOptions {
  /**
   * Values to treat as NULL (defaults to empty array)
   */
  nullValues?: readonly string[];

  /**
   * Whether to drop existing table first (defaults to false)
   */
  dropTable?: boolean;
}

/**
 * Import a CSV file into a DuckDB table with automatic row numbering
 *
 * Pure function that creates a table from the CSV file with all columns
 * auto-detected by DuckDB, plus a special `_row_number` column for tracking
 * original row positions. This enables deterministic validation and clear
 * error reporting.
 *
 * The function:
 * - Creates a sequence for deterministic row numbering
 * - Imports CSV using DuckDB's read_csv_auto() function
 * - Adds _row_number column using the sequence
 * - Handles NULL value specifications
 * - Optionally drops existing table first
 *
 * **Note:** This function does not manage connections. The connection must be
 * provided by the calling code (typically Workspace).
 *
 * @param connection - DuckDB connection (provided by Workspace)
 * @param csvPath - Path to the CSV file to import
 * @param tableName - Name for the database table
 * @param options - Import options (nullValues, dropTable)
 * @returns Effect that completes when import finishes
 *
 * @example
 * ```typescript
 * const connection = yield* _(workspace.getConnection());
 * const result = yield* _(
 *   importCsv(
 *     connection,
 *     "./data/events.csv",
 *     "events",
 *     { nullValues: ["NA", ""], dropTable: true }
 *   )
 * );
 * ```
 */
export function importCsv(
  connection: DuckDBConnection,
  csvPath: string,
  tableName: string,
  options: CsvImportOptions = {},
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    const { nullValues = [], dropTable = false } = options;

    yield* _(
      Effect.tryPromise({
        try: async () => {
          const sequenceName = `${tableName}_seq`;

          if (dropTable) {
            await connection.run(`DROP TABLE IF EXISTS ${tableName}`);
            await connection.run(`DROP SEQUENCE IF EXISTS ${sequenceName}`);
          }

          // Create sequence for deterministic row numbering
          await connection.run(`CREATE SEQUENCE IF NOT EXISTS ${sequenceName} START 1`);

          // Import CSV with row numbers
          const quotedNullValues = nullValues.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
          await connection.run(
            `CREATE TABLE IF NOT EXISTS ${tableName} AS
             SELECT *, nextval('${sequenceName}') as _row_number
             FROM read_csv_auto('${csvPath}', nullstr=[${quotedNullValues}])`,
          );
        },
        catch: (error) =>
          new WorkspaceImportError({
            message: `Failed to create table '${tableName}' from CSV ${csvPath}`,
            code: ErrorCode.DATABASE_ERROR,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }),
    );
  });
}
