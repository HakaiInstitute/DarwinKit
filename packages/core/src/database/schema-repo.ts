/**
 * Schema Repository
 *
 * Provides operations for managing database schema elements (tables, enums, constraints).
 * Follows the repository pattern with Effect's service system.
 *
 * @module database/schema-repo
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { DbConnection } from "./connection.ts";
import { SchemaCreationError, TableNotFoundError } from "./errors.ts";
import { escapeString, sanitizeTableName } from "./utils.ts";

/**
 * Column definition for table creation
 */
export interface ColumnDef {
  readonly name: string;
  readonly type: string;
  readonly nullable?: boolean;
  readonly primaryKey?: boolean;
  readonly references?: {
    readonly table: string;
    readonly column: string;
  };
}

/**
 * Table schema information
 */
export interface TableSchema {
  readonly tableName: string;
  readonly columns: readonly ColumnInfo[];
}

/**
 * Column information from schema inspection
 */
export interface ColumnInfo {
  readonly name: string;
  readonly type: string;
  readonly nullable: boolean;
  readonly position: number;
}

/**
 * Schema Repository Service
 *
 * Provides DDL operations for managing database schema.
 * All methods are traced via Effect.fn for debugging and observability.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const repo = yield* SchemaRepo;
 *
 *   // Create an enum type
 *   yield* repo.createEnum("status_enum", ["pending", "active", "completed"]);
 *
 *   // Create a table
 *   yield* repo.createTable("tasks", [
 *     { name: "id", type: "INTEGER", primaryKey: true },
 *     { name: "title", type: "TEXT", nullable: false },
 *     { name: "status", type: "status_enum" },
 *   ]);
 *
 *   // Get schema info
 *   const schema = yield* repo.getTableSchema("tasks");
 *   console.log(schema.columns);
 * });
 * ```
 */
export class SchemaRepo extends Context.Tag("@dwkt/SchemaRepo")<
  SchemaRepo,
  {
    /**
     * Create an ENUM type
     *
     * @param enumName - Name for the enum type
     * @param values - Array of enum values
     */
    readonly createEnum: (
      enumName: string,
      values: readonly string[],
    ) => Effect.Effect<void, SchemaCreationError>;

    /**
     * Create a table with the given columns
     *
     * @param tableName - Name for the table
     * @param columns - Column definitions
     * @param dropIfExists - Drop existing table first (default: true)
     */
    readonly createTable: (
      tableName: string,
      columns: readonly ColumnDef[],
      dropIfExists?: boolean,
    ) => Effect.Effect<void, SchemaCreationError>;

    /**
     * Drop a table if it exists
     *
     * @param tableName - Name of the table to drop
     */
    readonly dropTable: (tableName: string) => Effect.Effect<void>;

    /**
     * Get schema information for a table
     *
     * @param tableName - Name of the table
     * @returns Table schema with column information
     */
    readonly getTableSchema: (
      tableName: string,
    ) => Effect.Effect<TableSchema, TableNotFoundError>;

    /**
     * Check if a table exists
     *
     * @param tableName - Name of the table
     * @returns true if the table exists
     */
    readonly tableExists: (tableName: string) => Effect.Effect<boolean>;
  }
>() {
  /**
   * Live layer implementation
   *
   * Depends on DbConnection service for database access.
   */
  static readonly layer = Layer.effect(
    SchemaRepo,
    Effect.gen(function* () {
      const connection = yield* DbConnection;

      const createEnum = Effect.fn("SchemaRepo.createEnum")(
        function* (enumName: string, values: readonly string[]) {
          const safeName = sanitizeTableName(enumName);
          const escapedValues = values.map((v) => `'${escapeString(v)}'`).join(", ");
          const sql = `CREATE TYPE IF NOT EXISTS ${safeName} AS ENUM (${escapedValues})`;

          yield* Effect.tryPromise({
            try: () => connection.run(sql),
            catch: (error) =>
              new SchemaCreationError({
                tableName: safeName,
                operation: "createEnum",
                message: `Failed to create enum type '${safeName}'`,
                sql,
                cause: error instanceof Error ? error : new Error(String(error)),
              }),
          });
        },
      );

      const createTable = Effect.fn("SchemaRepo.createTable")(
        function* (
          tableName: string,
          columns: readonly ColumnDef[],
          dropIfExists: boolean = true,
        ) {
          const safeName = sanitizeTableName(tableName);

          // Drop table if requested
          if (dropIfExists) {
            yield* Effect.tryPromise(() => connection.run(`DROP TABLE IF EXISTS "${safeName}"`))
              .pipe(Effect.orDie);
          }

          // Build column definitions
          const columnDefs = columns.map((col) => {
            let def = `"${col.name}" ${col.type}`;
            if (col.primaryKey) {
              def += " PRIMARY KEY";
            } else if (col.nullable === false) {
              def += " NOT NULL";
            }
            if (col.references) {
              def += ` REFERENCES "${col.references.table}"("${col.references.column}")`;
            }
            return def;
          });

          const sql = `CREATE TABLE "${safeName}" (${columnDefs.join(", ")})`;

          yield* Effect.tryPromise({
            try: () => connection.run(sql),
            catch: (error) =>
              new SchemaCreationError({
                tableName: safeName,
                operation: "createTable",
                message: `Failed to create table '${safeName}'`,
                sql,
                cause: error instanceof Error ? error : new Error(String(error)),
              }),
          });
        },
      );

      const dropTable = Effect.fn("SchemaRepo.dropTable")(
        function* (tableName: string) {
          const safeName = sanitizeTableName(tableName);

          yield* Effect.tryPromise(() => connection.run(`DROP TABLE IF EXISTS "${safeName}"`)).pipe(
            Effect.orDie,
          );
        },
      );

      const tableExists = Effect.fn("SchemaRepo.tableExists")(
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

      const getTableSchema = Effect.fn("SchemaRepo.getTableSchema")(
        function* (tableName: string) {
          const safeName = sanitizeTableName(tableName);

          // Check if table exists
          const exists = yield* tableExists(safeName);
          if (!exists) {
            return yield* Effect.fail(
              new TableNotFoundError({
                tableName: safeName,
                message: `Table '${safeName}' does not exist`,
              }),
            );
          }

          // Get column information
          const result = yield* Effect.tryPromise(() =>
            connection.runAndReadAll(`
              SELECT
                column_name,
                data_type,
                is_nullable,
                ordinal_position
              FROM information_schema.columns
              WHERE table_name = '${safeName}'
              ORDER BY ordinal_position
            `)
          ).pipe(Effect.orDie);

          // Parse results using getRowObjects
          const rows = result.getRowObjects();
          const columns: ColumnInfo[] = rows.map((row) => ({
            name: String(row.column_name),
            type: String(row.data_type),
            nullable: String(row.is_nullable).toUpperCase() === "YES",
            position: Number(row.ordinal_position),
          }));

          return {
            tableName: safeName,
            columns,
          };
        },
      );

      return SchemaRepo.of({
        createEnum,
        createTable,
        dropTable,
        getTableSchema,
        tableExists,
      });
    }),
  );

  /**
   * Test layer with in-memory stubs
   *
   * Use this layer in unit tests to avoid real database operations.
   */
  static readonly testLayer = Layer.succeed(SchemaRepo, {
    createEnum: () => Effect.void,
    createTable: () => Effect.void,
    dropTable: () => Effect.void,
    getTableSchema: (tableName) =>
      Effect.succeed({
        tableName,
        columns: [
          { name: "id", type: "INTEGER", nullable: false, position: 1 },
          { name: "name", type: "TEXT", nullable: true, position: 2 },
        ],
      }),
    tableExists: () => Effect.succeed(true),
  });
}
