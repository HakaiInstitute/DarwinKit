/**
 * CSV Row Reader
 *
 * Utility for reading specific rows from CSV files to get exact source values.
 * Used when transformation inference isn't sufficient and we need the actual
 * CSV value for error reporting.
 *
 * This is more efficient than dual-table loading for small error rates.
 */

import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import { DuckDBConnection as DuckDB } from "@duckdb/node-api";
import { findSuggestions } from "../utils/string-utils.ts";

/**
 * Error class for CSV reading operations
 *
 * This error represents expected failures when reading CSV files, such as:
 * - File not found (user-provided path is invalid)
 * - Field not found (user typo in config)
 * - Row out of bounds (data changed since validation)
 */
const CsvReadErrorBase = Data.TaggedClass("CsvReadError")<{
  readonly message: string;
  readonly csvPath: string;
  readonly fieldName?: string;
  readonly rowNumber?: number;
  readonly availableFields?: readonly string[];
  readonly suggestions?: readonly string[];
}>;

export class CsvReadError extends CsvReadErrorBase {}

/**
 * Get column names from a CSV file
 *
 * This accesses a user-provided file path, so it can fail if the file doesn't exist
 */
function getTableColumns(
  connection: typeof DuckDB.prototype,
  csvPath: string,
): Effect.Effect<readonly string[], CsvReadError> {
  return Effect.gen(function* (_) {
    const query = `
      SELECT column_name
      FROM (DESCRIBE SELECT * FROM read_csv_auto('${csvPath}', all_varchar=true))
    `;

    // File access - user-provided path may be invalid
    const result = yield* _(
      Effect.tryPromise({
        try: () => connection.runAndReadAll(query),
        catch: (error) =>
          new CsvReadError({
            message: `Failed to read CSV file: ${error}`,
            csvPath,
          }),
      }),
    );

    const rows = result.getRowObjects();
    return rows.map((row) => String(row.column_name));
  });
}

/**
 * Validate that a field exists in the CSV schema
 *
 * Returns helpful error with suggestions if field not found
 */
function validateFieldExists(
  connection: typeof DuckDB.prototype,
  csvPath: string,
  fieldName: string,
): Effect.Effect<void, CsvReadError> {
  return Effect.gen(function* (_) {
    const columns = yield* _(getTableColumns(connection, csvPath));

    if (!columns.includes(fieldName)) {
      // Find close matches using fuzzy matching
      const suggestions = findSuggestions(fieldName, columns, {
        maxDistance: 2,
        maxSuggestions: 3,
      });

      return yield* _(
        Effect.fail(
          new CsvReadError({
            message: suggestions.length > 0
              ? `Field '${fieldName}' not found in CSV. Did you mean: ${suggestions.join(", ")}?`
              : `Field '${fieldName}' not found in CSV.`,
            csvPath,
            fieldName,
            availableFields: columns,
            suggestions,
          }),
        ),
      );
    }
  });
}

/**
 * Read specific field value from a CSV row
 *
 * Uses DuckDB to efficiently read a single cell from a CSV file.
 * This is fast for occasional lookups but would be slow if called
 * thousands of times.
 */
export function readCsvFieldValue(
  csvPath: string,
  rowNumber: number,
  fieldName: string,
): Effect.Effect<string | null, CsvReadError> {
  return Effect.acquireUseRelease(
    // Acquire: Create temporary DuckDB connection (infrastructure - use orDie)
    Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
    // Use: Perform read operations with the connection
    (connection) =>
      Effect.gen(function* (_) {
        // Validate field exists before building query (expected error if not)
        yield* _(validateFieldExists(connection, csvPath, fieldName));

        // DuckDB row numbers are 0-indexed, but we report 1-indexed
        const duckdbRowNumber = rowNumber - 1;

        // Query specific row and field, reading as VARCHAR to get exact CSV value
        const query = `
          SELECT "${fieldName}"::VARCHAR as value
          FROM read_csv_auto('${csvPath}', all_varchar=true)
          LIMIT 1 OFFSET ${duckdbRowNumber}
        `;

        // Query execution - infrastructure operation
        // File access errors caught here
        const result = yield* _(
          Effect.tryPromise({
            try: () => connection.runAndReadAll(query),
            catch: (error) =>
              new CsvReadError({
                message: `Failed to read CSV file: ${error}`,
                csvPath,
                fieldName,
                rowNumber,
              }),
          }),
        );

        const rows = result.getRowObjects();
        if (rows.length === 0) {
          // Row out of bounds - expected error (data may have changed)
          return yield* _(
            Effect.fail(
              new CsvReadError({
                message: `Row ${rowNumber} not found in CSV (file may have changed)`,
                csvPath,
                fieldName,
                rowNumber,
              }),
            ),
          );
        }

        const value = rows[0].value;
        return value === null || value === undefined ? "" : String(value);
      }),
    // Release: Close connection (ignores any errors during cleanup)
    (connection) => Effect.try(() => connection.closeSync()).pipe(Effect.ignore),
  );
}

/**
 * Read multiple field values from a CSV row
 *
 * More efficient when you need multiple fields from the same row
 */
export function readCsvRow(
  csvPath: string,
  rowNumber: number,
  fieldNames: readonly string[],
): Effect.Effect<Record<string, string | null>, CsvReadError> {
  return Effect.acquireUseRelease(
    // Acquire: Create DuckDB connection (infrastructure - use orDie)
    Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
    // Use: Perform read operations with the connection
    (connection) =>
      Effect.gen(function* (_) {
        // Validate all fields exist before building query
        for (const fieldName of fieldNames) {
          yield* _(validateFieldExists(connection, csvPath, fieldName));
        }

        const duckdbRowNumber = rowNumber - 1;

        // Select all requested fields as VARCHAR
        const fieldSelects = fieldNames
          .map((field) => `"${field}"::VARCHAR as "${field}"`)
          .join(", ");

        const query = `
          SELECT ${fieldSelects}
          FROM read_csv_auto('${csvPath}', all_varchar=true)
          LIMIT 1 OFFSET ${duckdbRowNumber}
        `;

        // Query execution - file access errors caught here
        const result = yield* _(
          Effect.tryPromise({
            try: () => connection.runAndReadAll(query),
            catch: (error) =>
              new CsvReadError({
                message: `Failed to read CSV file: ${error}`,
                csvPath,
                rowNumber,
              }),
          }),
        );

        const rows = result.getRowObjects();
        if (rows.length === 0) {
          // Row out of bounds - expected error
          return yield* _(
            Effect.fail(
              new CsvReadError({
                message: `Row ${rowNumber} not found in CSV (file may have changed)`,
                csvPath,
                rowNumber,
              }),
            ),
          );
        }

        // Convert to Record<string, string | null>
        const row = rows[0];
        const record: Record<string, string | null> = {};

        for (const field of fieldNames) {
          const value = row[field];
          record[field] = value === null || value === undefined ? "" : String(value);
        }

        return record;
      }),
    // Release: Close connection (ignores any errors during cleanup)
    (connection) => Effect.try(() => connection.closeSync()).pipe(Effect.ignore),
  );
}

/**
 * Batch read CSV values for multiple rows
 *
 * More efficient when you have many error rows and need their CSV values.
 * This reads all error rows in a single query.
 */
export function readCsvFieldValuesBatch(
  csvPath: string,
  rowNumbers: readonly number[],
  fieldName: string,
): Effect.Effect<Map<number, string | null>, CsvReadError> {
  if (rowNumbers.length === 0) {
    return Effect.succeed(new Map());
  }

  return Effect.acquireUseRelease(
    // Acquire: Create DuckDB connection (infrastructure - use orDie)
    Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
    // Use: Perform batch read operations with the connection
    (connection) =>
      Effect.gen(function* (_) {
        // Validate field exists before building query
        yield* _(validateFieldExists(connection, csvPath, fieldName));

        // Use a CTE to add row numbers, then filter
        const query = `
          WITH numbered_rows AS (
            SELECT
              (row_number() OVER ()) as row_num,
              "${fieldName}"::VARCHAR as value
            FROM read_csv_auto('${csvPath}', all_varchar=true)
          )
          SELECT row_num, value
          FROM numbered_rows
          WHERE row_num IN (${rowNumbers.join(", ")})
        `;

        // Query execution - file access errors caught here
        const result = yield* _(
          Effect.tryPromise({
            try: () => connection.runAndReadAll(query),
            catch: (error) =>
              new CsvReadError({
                message: `Failed to read CSV file: ${error}`,
                csvPath,
                fieldName,
              }),
          }),
        );

        const rows = result.getRowObjects();
        const valueMap = new Map<number, string | null>();

        for (const row of rows) {
          const rowNum = Number(row.row_num);
          const value = row.value;
          valueMap.set(rowNum, value === null || value === undefined ? "" : String(value));
        }

        return valueMap;
      }),
    // Release: Close connection (ignores any errors during cleanup)
    (connection) => Effect.try(() => connection.closeSync()).pipe(Effect.ignore),
  );
}
