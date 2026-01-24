/**
 * Export operations - Export transformed data to CSV and DuckDB files
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
// import { json2csv } from "json-2-csv";
import { stringify as stringifyCSV } from "@std/csv";

import type { TransformSettings } from "@dwkt/domain";
import { getValidationProfile } from "@dwkt/domain";
import { OutputError } from "../errors.ts";

/**
 * Exports data from schema tables to CSV files.
 *
 * This function takes explicit dependencies rather than a workspace reference,
 * making it easier to test and reuse in different contexts.
 *
 * @param connection - DuckDB connection to use for querying data
 * @param datasets - Array of dataset configurations (used to determine which tables to export)
 * @param config - Export configuration (output directory, timestamp, null column handling)
 * @returns An Effect that completes when all tables are exported, or fails with an OutputError.
 *
 * @example
 * ```typescript
 * const connection = yield* createConnection();
 * const settings = {
 *   datasets: [{ name: "events", profile: "Event", ... }],
 *   output: { dir: "./output", outputFilesWithTimestamp: true, dropNullColumns: false }
 * };
 * yield* exportObisTablesToCSV(connection, settings);
 * ```
 */
export function exportObisTablesToCSV(
  connection: DuckDBConnection,
  { datasets, output }: TransformSettings,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* (_) {
    // If no datasets provided, return early
    if (!datasets || datasets.length === 0) {
      return;
    }

    const withTimestamp = output.outputFilesWithTimestamp ?? true;
    const tables = [
      ...new Set(datasets.map((ds) => ds.profile.toLowerCase())),
    ];
    const outputPath = output.dir;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    // Create output directory, recursively if necessary
    yield* _(
      Effect.try(() => Deno.mkdirSync(outputPath, { recursive: true })).pipe(
        Effect.mapError((error) =>
          new OutputError({
            message: `Failed to create output directory: ${
              error instanceof Error ? error.message : String(error)
            }`,
            outputPath: outputPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          })
        ),
      ),
    );

    for (const tableName of tables) {
      // Get all column names from table schema
      const columnNamesResult = yield* _(
        Effect.tryPromise({
          try: () => connection.runAndReadAll(`PRAGMA table_info(${tableName});`),
          catch: (error) =>
            new OutputError({
              message: `Failed to read table schema for ${tableName}: ${
                error instanceof Error ? error.message : String(error)
              }`,
              outputPath,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );
      const allColumnNames: string[] = columnNamesResult.getRowObjectsJson().map((row) =>
        String(row.name)
      );

      // Determine which columns to include in export
      let columnsToExport: string[] = allColumnNames;
      const selectColumns: string[] = [];

      if (output.dropNullColumns) {
        // Filter out columns that are entirely NULL
        const nonNullColumns: string[] = [];
        for (const columnName of allColumnNames) {
          // Check if the column is entirely NULL
          const nullCountResult = yield* _(
            Effect.tryPromise({
              try: () =>
                connection.runAndReadAll(
                  `SELECT COUNT(*) AS null_count FROM ${tableName} WHERE "${columnName}" IS NOT NULL;`,
                ),
              catch: (error) =>
                new OutputError({
                  message: `Failed to count non-null values for ${tableName}.${columnName}: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                  outputPath,
                  cause: error instanceof Error ? error : new Error(String(error)),
                }),
            }),
          );
          const notNullCount = Number(nullCountResult.getRowObjectsJson()[0].null_count ?? 0);
          if (notNullCount > 0) {
            nonNullColumns.push(columnName);
            selectColumns.push(`"${columnName}"`);
          }
        }
        columnsToExport = nonNullColumns;
      } else {
        selectColumns.push("*");
      }

      // Fetch all data from the current table
      const result = yield* _(
        Effect.tryPromise({
          try: () =>
            connection.runAndReadAll(`SELECT ${selectColumns.join(",")} FROM ${tableName}`),
          catch: (error) =>
            new OutputError({
              message: `Failed to select data from ${tableName}: ${
                error instanceof Error ? error.message : String(error)
              }`,
              outputPath,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );
      // Generate the filename for the CSV file, including a timestamp if specified
      const filename = withTimestamp ? `${tableName}-${timestamp}.csv` : `${tableName}.csv`;
      const fullPath: string = join(outputPath, filename);

      // Write the data to the CSV file
      yield* _(Effect.tryPromise({
        try: () =>
          Deno.writeTextFile(
            fullPath,
            stringifyCSV(result.getRowObjectsJson(), { columns: columnsToExport }),
          ),
        catch: (error) =>
          new OutputError({
            message: `Failed to write results file: ${
              error instanceof Error ? error.message : String(error)
            }`,
            outputPath: fullPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }));
    }
  });
}

/**
 * Exports the in-memory DuckDB database to a persistent file.
 *
 * This function takes explicit dependencies rather than a workspace reference,
 * making it easier to test and reuse in different contexts.
 *
 * @param connection - DuckDB connection to use for exporting
 * @param datasets - Array of dataset configurations (used to determine which tables to export)
 * @param transformConfig - Export configuration (output directory, timestamp, filename)
 * @returns An Effect that completes when the database is exported, or fails with an OutputError.
 *
 * @example
 * ```typescript
 * const connection = yield* createConnection();
 * const settings = {
 *   datasets: [{ name: "events", profile: "Event", ... }],
 *   output: { dir: "./output", outputFilesWithTimestamp: true, exportDbFileName: "obis" }
 * };
 * yield* exportToPersistentDB(connection, settings);
 * ```
 */
export function exportToPersistentDB(
  connection: DuckDBConnection,
  { datasets, output }: TransformSettings,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* (_) {
    // If no datasets provided, return early
    if (!datasets || datasets.length === 0) {
      return;
    }

    const withTimestamp = output.outputFilesWithTimestamp ?? true;
    const outputPath = output.dir;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dbName = "obis"; // Default database name for the exported file
    const dbFileName = output.exportDbFileName || dbName;
    const filename = withTimestamp ? `${dbFileName}-${timestamp}.duckdb` : `${dbFileName}.duckdb`;
    const fullPath = join(outputPath, filename);

    // Create output directory, recursively if necessary
    yield* _(
      Effect.try(() => Deno.mkdirSync(outputPath, { recursive: true })).pipe(
        Effect.mapError((error) =>
          new OutputError({
            message: `Failed to create output directory: ${error}`,
            outputPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          })
        ),
      ),
    );

    // Check if DuckDB file already exists
    const fileExists = yield* _(Effect.tryPromise({
      try: () => Deno.stat(fullPath).then(() => true).catch(() => false),
      catch: (error) =>
        new OutputError({
          message: `Failed get statistics for DB at ${fullPath}: ${error}`,
          outputPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    }));

    // If DuckDB file exists, delete it
    if (fileExists) {
      yield* _(Effect.tryPromise({
        try: () => Deno.remove(fullPath),
        catch: (error) =>
          new OutputError({
            message: `Failed to delete existing output file: ${error}`,
            outputPath: fullPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }));
    }

    // Export the in-memory database to a persistent DuckDB file. This will create the file if it doesn't exist.
    // We cant use COPY TO DATABASE directly, as it creates constraint violations when tables are copied out of order.
    for (const dataset of datasets) {
      // Load validation profile if specified
      const transformProfile = getValidationProfile(dataset.profile);
      if (!transformProfile) {
        console.warn(`No validation profile found for ${dataset.profile}, skipping table export.`);
        continue;
      }
      const tableName = transformProfile.name.toLowerCase();
      yield* _(
        Effect.tryPromise({
          // try: () => connection.run(`ATTACH '${fullPath}'; COPY FROM DATABASE memory TO ${dbName}; DETACH ${dbName};`),
          try: () =>
            connection.run(`
            ATTACH '${fullPath}' as ${dbName};
            CREATE TABLE IF NOT EXISTS ${dbName}.${tableName} AS FROM memory.${tableName};
            DETACH ${dbName};
          `),
          catch: (error) =>
            new OutputError({
              message: `Failed export DB to ${fullPath}: ${error}`,
              outputPath,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );
    }
  });
}
