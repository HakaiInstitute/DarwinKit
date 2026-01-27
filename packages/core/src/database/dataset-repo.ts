/**
 * Dataset Repository
 *
 * Provides operations for importing and managing CSV datasets in DuckDB.
 * Follows the repository pattern with Effect's service system.
 *
 * @module database/dataset-repo
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { DbConnection } from "./connection.ts";
import { DatasetImportError, TableNotFoundError } from "./errors.ts";
import { formatNullValues, sanitizeTableName } from "./utils.ts";

/**
 * Dataset Repository Service
 *
 * Provides CRUD-like operations for datasets (CSV tables) in DuckDB.
 * All methods are traced via Effect.fn for debugging and observability.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const repo = yield* DatasetRepo;
 *
 *   // Import a CSV file
 *   yield* repo.import("events", "./data/events.csv", ["NA", "N/A"]);
 *
 *   // Check row count
 *   const count = yield* repo.rowCount("events");
 *   console.log(`Imported ${count} rows`);
 *
 *   // Cleanup
 *   yield* repo.drop("events");
 * });
 *
 * // Run with live layer
 * Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(DatasetRepo.layer),
 *     Effect.provide(Layer.succeed(DbConnection, myConnection))
 *   )
 * );
 * ```
 */
export class DatasetRepo extends Context.Tag("@dwkt/DatasetRepo")<
  DatasetRepo,
  {
    /**
     * Import a CSV file into a DuckDB table
     *
     * Creates a table from the CSV with an additional `_row_number` column
     * for tracking original row positions. If the table exists, it will be
     * dropped and recreated.
     *
     * @param tableName - Name for the table (will be sanitized)
     * @param csvPath - Path to the CSV file
     * @param nullValues - Strings to treat as NULL values
     */
    readonly import: (
      tableName: string,
      csvPath: string,
      nullValues: readonly string[],
    ) => Effect.Effect<void, DatasetImportError>;

    /**
     * Drop a table if it exists
     *
     * @param tableName - Name of the table to drop
     */
    readonly drop: (tableName: string) => Effect.Effect<void>;

    /**
     * Check if a table exists
     *
     * @param tableName - Name of the table to check
     * @returns true if the table exists, false otherwise
     */
    readonly exists: (tableName: string) => Effect.Effect<boolean>;

    /**
     * Get the row count for a table
     *
     * @param tableName - Name of the table
     * @returns Number of rows in the table
     */
    readonly rowCount: (tableName: string) => Effect.Effect<number, TableNotFoundError>;

    /**
     * Get column names for a table
     *
     * @param tableName - Name of the table
     * @returns Array of column names
     */
    readonly columns: (tableName: string) => Effect.Effect<string[], TableNotFoundError>;
  }
>() {
  /**
   * Live layer implementation
   *
   * Depends on DbConnection service for database access.
   */
  static readonly layer = Layer.effect(
    DatasetRepo,
    Effect.gen(function* () {
      const connection = yield* DbConnection;

      const import_ = Effect.fn("DatasetRepo.import")(
        function* (
          tableName: string,
          csvPath: string,
          nullValues: readonly string[],
        ) {
          const safeName = sanitizeTableName(tableName);
          const sequenceName = `${safeName}_seq`;

          // Build nullstr parameter only if there are null values
          const nullStrParam = nullValues.length > 0
            ? `, nullstr=[${formatNullValues(nullValues)}]`
            : "";

          yield* Effect.tryPromise({
            try: async () => {
              // Drop existing table and sequence for clean import
              await connection.run(`DROP TABLE IF EXISTS "${safeName}"`);
              await connection.run(`DROP SEQUENCE IF EXISTS ${sequenceName}`);

              // Create sequence for deterministic row numbering
              await connection.run(
                `CREATE SEQUENCE ${sequenceName} START 1`,
              );

              // Import CSV with row numbers
              await connection.run(
                `CREATE TABLE "${safeName}" AS
                 SELECT *, nextval('${sequenceName}') as _row_number
                 FROM read_csv_auto('${csvPath}'${nullStrParam})`,
              );
            },
            catch: (error) =>
              new DatasetImportError({
                tableName: safeName,
                csvPath,
                message: `Failed to import CSV into table '${safeName}'`,
                cause: error instanceof Error ? error : new Error(String(error)),
              }),
          });
        },
      );

      const drop = Effect.fn("DatasetRepo.drop")(function* (tableName: string) {
        const safeName = sanitizeTableName(tableName);
        const sequenceName = `${safeName}_seq`;

        yield* Effect.tryPromise(() => connection.run(`DROP TABLE IF EXISTS "${safeName}"`)).pipe(
          Effect.orDie,
        );

        yield* Effect.tryPromise(() => connection.run(`DROP SEQUENCE IF EXISTS ${sequenceName}`))
          .pipe(Effect.orDie);
      });

      const exists = Effect.fn("DatasetRepo.exists")(
        function* (tableName: string) {
          const safeName = sanitizeTableName(tableName);

          const result = yield* Effect.tryPromise(() =>
            connection.runAndReadAll(`
              SELECT COUNT(*) as count
              FROM information_schema.tables
              WHERE table_name = '${safeName}'
            `)
          ).pipe(Effect.orDie);

          const rows = result.getRowObjects();
          const count = rows[0]?.count;
          return Number(count) > 0;
        },
      );

      const rowCount = Effect.fn("DatasetRepo.rowCount")(
        function* (tableName: string) {
          const safeName = sanitizeTableName(tableName);

          // First check if table exists
          const tableExists = yield* exists(safeName);
          if (!tableExists) {
            return yield* Effect.fail(
              new TableNotFoundError({
                tableName: safeName,
                message: `Table '${safeName}' does not exist`,
              }),
            );
          }

          const result = yield* Effect.tryPromise(() =>
            connection.runAndReadAll(`SELECT COUNT(*) as count FROM "${safeName}"`)
          ).pipe(Effect.orDie);

          const rows = result.getRowObjects();
          const rawCount = rows[0]?.count;
          return typeof rawCount === "bigint" ? Number(rawCount) : Number(rawCount ?? 0);
        },
      );

      const columns = Effect.fn("DatasetRepo.columns")(
        function* (tableName: string) {
          const safeName = sanitizeTableName(tableName);

          // First check if table exists
          const tableExists = yield* exists(safeName);
          if (!tableExists) {
            return yield* Effect.fail(
              new TableNotFoundError({
                tableName: safeName,
                message: `Table '${safeName}' does not exist`,
              }),
            );
          }

          const result = yield* Effect.tryPromise(() =>
            connection.runAndReadAll(`
              SELECT column_name
              FROM information_schema.columns
              WHERE table_name = '${safeName}'
              ORDER BY ordinal_position
            `)
          ).pipe(Effect.orDie);

          const rows = result.getRowObjects();
          return rows.map((row) => String(row.column_name));
        },
      );

      return DatasetRepo.of({
        import: import_,
        drop,
        exists,
        rowCount,
        columns,
      });
    }),
  );

  /**
   * Test layer with in-memory stubs
   *
   * Use this layer in unit tests to avoid real database operations.
   * All methods return successful stub values.
   */
  static readonly testLayer = Layer.succeed(DatasetRepo, {
    import: () => Effect.void,
    drop: () => Effect.void,
    exists: () => Effect.succeed(true),
    rowCount: () => Effect.succeed(100),
    columns: () => Effect.succeed(["id", "name", "_row_number"]),
  });
}
