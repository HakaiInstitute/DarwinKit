/**
 * Export operations - Export transformed data to CSV and DuckDB files
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import { json2csv } from "json-2-csv";

import type { TransformDatasetConfig } from "@dwkt/domain";
import { ErrorCode, getValidationProfile } from "@dwkt/domain";
import { OutputError } from "../errors.ts";

/**
 * Configuration for CSV export operations
 */
export interface ExportCSVConfig {
  /** Directory where CSV files should be written */
  outputDir: string;
  /** Whether to include timestamp in output filenames (default: true) */
  withTimestamp?: boolean;
  /** Whether to drop columns that contain only NULL values (default: false) */
  dropNullColumns?: boolean;
}

/**
 * Configuration for DuckDB export operations
 */
export interface ExportDBConfig {
  /** Directory where DuckDB file should be written */
  outputDir: string;
  /** Whether to include timestamp in output filename (default: true) */
  withTimestamp?: boolean;
  /** Filename for exported database (without extension, default: "obis") */
  fileName?: string;
}

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
 * yield* exportObisTablesToCSV(connection,
 *   [{ name: "events", profile: "Event", ... }],
 *   { outputDir: "./output", withTimestamp: true, dropNullColumns: false }
 * );
 * ```
 */
export function exportObisTablesToCSV(
  connection: DuckDBConnection,
  datasets: readonly TransformDatasetConfig[],
  config: ExportCSVConfig,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* (_) {
    // If no datasets provided, return early
    if (!datasets || datasets.length === 0) {
      return;
    }

    const withTimestamp = config.withTimestamp ?? true;
    const tables = [
      ...new Set(datasets.map((ds) => ds.profile.toLowerCase())),
    ];
    const outputPath = config.outputDir;
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
            code: ErrorCode.FILE_NOT_FOUND,
            cause: error instanceof Error ? error : new Error(String(error)),
          })
        ),
      ),
    );

    for (const tableName of tables) {
      const selectColumns: string[] = [];
      if (config.dropNullColumns) {
        // Get column names
        const columnNamesResult = yield* _(
          Effect.tryPromise({
            try: () => connection.runAndReadAll(`PRAGMA table_info(${tableName});`),
            catch: (error) =>
              new OutputError({
                message: `Failed to read table schema for ${tableName}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                outputPath,
                code: ErrorCode.DATABASE_ERROR,
                cause: error instanceof Error ? error : new Error(String(error)),
              }),
          }),
        );
        const columnNames = columnNamesResult.getRowObjectsJson().map((row) => row.name);

        for (const columnName of columnNames) {
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
                  code: ErrorCode.DATABASE_ERROR,
                  cause: error instanceof Error ? error : new Error(String(error)),
                }),
            }),
          );
          const notNullCount = Number(nullCountResult.getRowObjectsJson()[0].null_count ?? 0);
          if (notNullCount > 0) {
            selectColumns.push(`"${columnName}"`);
          }
        }
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
              code: ErrorCode.DATABASE_ERROR,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );
      // Generate the filename for the CSV file, including a timestamp if specified
      const filename = withTimestamp ? `${tableName}-${timestamp}.csv` : `${tableName}.csv`;
      const fullPath: string = join(outputPath, filename);

      // Write the data to the CSV file
      yield* _(Effect.tryPromise({
        try: () => Deno.writeTextFile(fullPath, json2csv(result.getRowObjectsJson())),
        catch: (error) =>
          new OutputError({
            message: `Failed to write results file: ${
              error instanceof Error ? error.message : String(error)
            }`,
            outputPath: fullPath,
            code: ErrorCode.DATABASE_ERROR,
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
 * @param config - Export configuration (output directory, timestamp, filename)
 * @returns An Effect that completes when the database is exported, or fails with an OutputError.
 *
 * @example
 * ```typescript
 * const connection = yield* createConnection();
 * yield* exportToPersistentDB(connection,
 *   [{ name: "events", profile: "Event", ... }],
 *   { outputDir: "./output", withTimestamp: true, fileName: "obis" }
 * );
 * ```
 */
export function exportToPersistentDB(
  connection: DuckDBConnection,
  datasets: readonly TransformDatasetConfig[],
  config: ExportDBConfig,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* (_) {
    // If no datasets provided, return early
    if (!datasets || datasets.length === 0) {
      return;
    }

    const withTimestamp = config.withTimestamp ?? true;
    const outputPath = config.outputDir;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dbName = "obis"; // Default database name for the exported file
    const dbFileName = config.fileName || dbName;
    const filename = withTimestamp ? `${dbFileName}-${timestamp}.duckdb` : `${dbFileName}.duckdb`;
    const fullPath = join(outputPath, filename);

    // Create output directory, recursively if necessary
    yield* _(
      Effect.try(() => Deno.mkdirSync(outputPath, { recursive: true })).pipe(
        Effect.mapError((error) =>
          new OutputError({
            message: `Failed to create output directory: ${error}`,
            outputPath,
            code: ErrorCode.FILE_NOT_FOUND,
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
          code: ErrorCode.FILE_NOT_FOUND,
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
            code: ErrorCode.FILE_NOT_FOUND,
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
              code: ErrorCode.FILE_NOT_FOUND,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );
    }
  });
}
