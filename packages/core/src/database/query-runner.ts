/**
 * Query Runner
 *
 * Provides an escape hatch for arbitrary SQL queries that don't fit cleanly
 * into the repository pattern. Use this when you need complex queries that
 * are difficult to abstract into repository methods.
 *
 * @module database/query-runner
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { DbConnection } from "./connection.ts";
import { QueryError } from "./errors.ts";

/**
 * Result row from a query
 */
export type QueryRow = Record<string, unknown>;

/**
 * Query Runner Service
 *
 * Provides raw SQL execution capabilities for complex queries that
 * don't fit the repository pattern. Use sparingly - prefer repository
 * methods for common operations.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const runner = yield* QueryRunner;
 *
 *   // Execute a complex query
 *   const rows = yield* runner.query(`
 *     SELECT t1.id, t2.name
 *     FROM table1 t1
 *     JOIN table2 t2 ON t1.fk = t2.id
 *     WHERE t1.status = 'active'
 *   `);
 *
 *   // Execute a statement without results
 *   yield* runner.execute(`UPDATE table1 SET status = 'processed'`);
 * });
 * ```
 */
export class QueryRunner extends Context.Tag("@dwkt/QueryRunner")<
  QueryRunner,
  {
    /**
     * Execute a SQL query and return results
     *
     * Use for SELECT statements or any query that returns rows.
     *
     * @param sql - SQL query to execute
     * @returns Array of row objects
     */
    readonly query: (sql: string) => Effect.Effect<QueryRow[], QueryError>;

    /**
     * Execute a SQL statement without returning results
     *
     * Use for INSERT, UPDATE, DELETE, or DDL statements.
     *
     * @param sql - SQL statement to execute
     */
    readonly execute: (sql: string) => Effect.Effect<void, QueryError>;

    /**
     * Execute multiple SQL statements in sequence
     *
     * Useful for running multiple related statements that should
     * succeed or fail together (though not transactional).
     *
     * @param statements - Array of SQL statements
     */
    readonly executeMany: (statements: readonly string[]) => Effect.Effect<void, QueryError>;

    /**
     * Get the underlying DuckDB connection
     *
     * Use only when you need direct access to DuckDB-specific features
     * not exposed through the other methods. This is the ultimate escape
     * hatch - use with caution.
     */
    readonly connection: () => DuckDBConnection;
  }
>() {
  /**
   * Live layer implementation
   *
   * Depends on DbConnection service for database access.
   */
  static readonly layer = Layer.effect(
    QueryRunner,
    Effect.gen(function* () {
      const connection = yield* DbConnection;

      const query = Effect.fn("QueryRunner.query")(function* (sql: string) {
        const result = yield* Effect.tryPromise({
          try: () => connection.runAndReadAll(sql),
          catch: (error) =>
            new QueryError({
              sql,
              message: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        });

        return result.getRowObjects() as QueryRow[];
      });

      const execute = Effect.fn("QueryRunner.execute")(function* (sql: string) {
        yield* Effect.tryPromise({
          try: () => connection.run(sql),
          catch: (error) =>
            new QueryError({
              sql,
              message: `Statement failed: ${
                error instanceof Error ? error.message : String(error)
              }`,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        });
      });

      const executeMany = Effect.fn("QueryRunner.executeMany")(
        function* (statements: readonly string[]) {
          for (const sql of statements) {
            yield* execute(sql);
          }
        },
      );

      return QueryRunner.of({
        query,
        execute,
        executeMany,
        connection: () => connection,
      });
    }),
  );

  /**
   * Test layer with in-memory stubs
   *
   * Use this layer in unit tests to avoid real database operations.
   */
  static readonly testLayer = Layer.succeed(QueryRunner, {
    query: () => Effect.succeed([]),
    execute: () => Effect.void,
    executeMany: () => Effect.void,
    connection: () => {
      throw new Error("Test layer does not provide real connection");
    },
  });
}
