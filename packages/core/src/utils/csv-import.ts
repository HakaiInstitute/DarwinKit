/**
 * CSV Import Utilities
 *
 * Shared functions for importing CSV files into DuckDB tables.
 * Functions take a connection as a parameter for easy reuse and testing.
 *
 * @module utils/csv-import
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";
import { CsvImportError } from "../errors/index.ts";

/**
 * Sanitize a string for use as a SQL table name
 *
 * Replaces any characters that are not alphanumeric or underscore
 * with underscores to create a valid SQL identifier.
 *
 * @param name - The string to sanitize
 * @returns A sanitized string safe for use as a table name
 *
 * @example
 * ```typescript
 * sanitizeTableName("my-dataset") // "my_dataset"
 * sanitizeTableName("data.csv") // "data_csv"
 * sanitizeTableName("events 2024") // "events_2024"
 * ```
 */
export function sanitizeTableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * Escape a string value for use in SQL
 *
 * Escapes single quotes by doubling them, making the string
 * safe for use in SQL string literals.
 *
 * @param value - The string to escape
 * @returns An escaped string safe for SQL
 *
 * @example
 * ```typescript
 * escapeString("it's fine") // "it''s fine"
 * escapeString("normal") // "normal"
 * ```
 */
export function escapeString(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Format an array of null values for DuckDB's nullstr parameter
 *
 * @param nullValues - Array of strings to treat as NULL
 * @returns Formatted string for DuckDB nullstr parameter
 *
 * @example
 * ```typescript
 * formatNullValues(["NA", "N/A", ""]) // "'NA', 'N/A', ''"
 * ```
 */
export function formatNullValues(nullValues: readonly string[]): string {
  return nullValues.map((v) => `'${escapeString(v)}'`).join(", ");
}

/**
 * Import a CSV file into a DuckDB table with row numbers
 *
 * Creates a table from the CSV with an additional `_row_number` column
 * for tracking original row positions. If the table exists, it will be
 * dropped and recreated.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name for the table (will be sanitized)
 * @param csvPath - Path to the CSV file
 * @param nullValues - Strings to treat as NULL values
 */
export function importCsv(
  connection: DuckDBConnection,
  tableName: string,
  csvPath: string,
  nullValues: readonly string[],
): Effect.Effect<void, CsvImportError> {
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

      // Import CSV with row numbers
      await connection.run(
        `CREATE TABLE "${safeName}" AS
         SELECT *, nextval('${sequenceName}') as _row_number
         FROM read_csv_auto('${csvPath}'${nullStrParam})`,
      );
    },
    catch: (error) =>
      new CsvImportError(
        `Failed to import CSV '${csvPath}' into table '${tableName}'`,
        tableName,
        csvPath,
        error instanceof Error ? error : new Error(String(error)),
      ),
  });
}

/**
 * Get a single cell value from a table by field name and row number
 *
 * Used to retrieve the original value from an imported CSV table,
 * typically for error reporting or validation feedback.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table
 * @param fieldName - Name of the column/field
 * @param rowNumber - Row number (1-indexed, from _row_number column)
 * @returns The value as a string, or empty string if not found
 */
export function getCsvValue(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  rowNumber: number,
): Effect.Effect<string> {
  return Effect.gen(function* (_) {
    const safeName = sanitizeTableName(tableName);
    const query = `
      SELECT "${fieldName}" as value
      FROM "${safeName}"
      WHERE _row_number = ${rowNumber}
    `;

    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
    );

    const rows = result.getRowObjects();
    if (rows.length === 0) {
      return "";
    }

    return String(rows[0].value ?? "");
  });
}
