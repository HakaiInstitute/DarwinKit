/**
 * Import operations - CSV import and post-import transformations
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { resolve } from "@std/path";
import * as Effect from "effect/Effect";

import { importCsv, type WorkspaceImportError } from "@dwkt/core";
import { ErrorCode, type ImportConfig, type TransformSettings } from "@dwkt/domain";
import { TransformationError } from "../errors.ts";

/**
 * Creates tables in the DuckDB database from the CSV files specified.
 *
 * This function takes explicit dependencies rather than a workspace reference,
 * making it easier to test and reuse in different contexts.
 *
 * @param connection - DuckDB connection to use for importing
 * @param inputs - Map of table names to CSV file paths (relative or absolute)
 * @param basePath - Base directory for resolving relative paths
 * @param importConfig - Import configuration (nullValues, dropTable)
 * @returns An Effect that completes when all tables are created, or fails with a TransformationError.
 *
 * @example
 * ```typescript
 * const connection = yield* createConnection();
 * yield* createTablesFromCSV(
 *   connection,
 *   { events: "./events.csv", occurrences: "./occurrences.csv" },
 *   "/data",
 *   config.transform.import
 * );
 * ```
 */
export function createTablesFromCSV(
  connection: DuckDBConnection,
  inputs: TransformSettings["inputs"],
  basePath: string,
  importConfig: ImportConfig,
): Effect.Effect<
  void,
  | TransformationError
  | WorkspaceImportError,
  never
> {
  return Effect.gen(function* () {
    if (!inputs || Object.keys(inputs).length === 0) {
      return;
    }

    for (const [tableName, csvPath] of Object.entries(inputs)) {
      if (typeof csvPath !== "string") continue;

      const fullPath = resolve(basePath, csvPath);

      yield* importCsv(connection, fullPath, tableName, importConfig);
    }
  });
}

/**
 * Executes post-import transformation SQL queries.
 *
 * This function runs a series of SQL transformations after data has been imported.
 * It processes each transformation sequentially and handles any errors that occur.
 *
 * @param connection - DuckDB connection to use for executing SQL
 * @param transformations - Array of SQL statements to execute in order
 * @returns An Effect that completes when all transformations are executed successfully,
 *          or fails with a TransformationError if any transformation fails
 *
 * @example
 * ```typescript
 * const connection = yield* createConnection();
 * yield* runPostImportTransformations(connection, [
 *   "UPDATE events SET country = 'USA' WHERE country_code = 'US'",
 *   "DELETE FROM occurrences WHERE invalid = true"
 * ]);
 * ```
 */
export function runPostImportTransformations(
  connection: DuckDBConnection,
  transformations: readonly string[],
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* (_) {
    if (!transformations || transformations.length === 0) {
      return;
    }

    for (const transformSQL of transformations) {
      yield* _(Effect.tryPromise({
        try: () => connection.run(transformSQL),
        catch: (error) =>
          new TransformationError({
            message: `Failed to execute post-import transform SQL: ${transformSQL}`,
            code: ErrorCode.DATABASE_ERROR,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }));
    }
  });
}
