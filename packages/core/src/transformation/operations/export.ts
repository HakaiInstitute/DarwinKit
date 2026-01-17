/**
 * Export operations - Export transformed data to CSV and DuckDB files
 */

import { join } from "@std/path";
import * as Effect from "effect/Effect";
import { json2csv } from "json-2-csv";

import { ErrorCode, getValidationProfile } from "@dwkt/domain";
import type { Workspace } from "../../workspace/workspace.ts";
import { OutputError } from "../errors.ts";

/**
 * Exports the data from OBIS tables to CSV files.
 *
 * @param workspace - The workspace containing configuration and connection
 * @returns An Effect that completes when all tables are exported, or fails with an OutputError.
 */
export function exportObisTablesToCSV(
  workspace: Workspace,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* (_) {
    const config = workspace.getConfig();
    const connection = yield* _(workspace.getConnection());

    // Type guard - ensure config has transform settings
    if (!("transform" in config)) {
      return;
    }

    const withTimestamp = config.transform.output.outputFilesWithTimestamp ?? true;
    const tables = [
      ...new Set(config.transform.datasets.map((ds) => ds.profile.toLowerCase())),
    ];
    const outputPath = config.transform.output.outputDir;
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
      if (config.transform?.output?.dropNullColumns) {
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
 * The output file name can include a timestamp based on the `withTimestamp` flag.
 *
 * @param workspace - The workspace containing configuration and connection
 * @returns An Effect that completes when the database is exported, or fails with an OutputError.
 */
export function exportToPersistentDB(
  workspace: Workspace,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* (_) {
    const config = workspace.getConfig();
    const connection = yield* _(workspace.getConnection());

    // Type guard - ensure config has transform settings
    if (!("transform" in config)) {
      return;
    }

    if (!config.transform.output.exportDB) {
      return;
    }

    const withTimestamp = config.transform.output.outputFilesWithTimestamp ?? true;
    const outputPath = config.transform.output.outputDir;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dbName = "obis"; // Default database name for the exported file
    const dbFileName = config.transform.output.exportDBFileName || dbName;
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
    for (const dataset of config.transform.datasets) {
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
