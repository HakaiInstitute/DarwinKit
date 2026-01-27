/**
 * Database Connection Service
 *
 * Provides a shared DuckDB connection as an Effect service.
 * The Workspace owns and provides this connection to all repositories.
 *
 * @module database/connection
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Context from "effect/Context";

/**
 * DbConnection service tag
 *
 * Provides access to the shared DuckDB connection within the workspace.
 * Repositories depend on this service to execute queries.
 *
 * @example
 * ```typescript
 * const myQuery = Effect.gen(function* () {
 *   const connection = yield* DbConnection;
 *   const result = yield* Effect.tryPromise(() =>
 *     connection.runAndReadAll("SELECT * FROM my_table")
 *   );
 *   return result;
 * });
 * ```
 */
export class DbConnection extends Context.Tag("@dwkt/DbConnection")<
  DbConnection,
  DuckDBConnection
>() {}
