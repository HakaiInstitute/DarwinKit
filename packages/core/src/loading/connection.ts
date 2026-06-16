/**
 * Shared DuckDB connection lifecycle.
 *
 * @module loading/connection
 */

import { DuckDBInstance } from "@duckdb/node-api";
import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

/**
 * A scoped in-memory DuckDB connection. Acquires an instance + connection and
 * releases both (`closeSync`) when the enclosing `Scope` closes. Creating an
 * in-memory database is infrastructure, so a failure here is a defect (`orDie`).
 *
 * Wrap usage in `Effect.scoped` to supply the `Scope` and trigger cleanup.
 */
export const scopedConnection: Effect.Effect<DuckDBConnection, never, Scope.Scope> = Effect
  .acquireRelease(
    Effect.gen(function* () {
      const instance = yield* Effect.tryPromise(() => DuckDBInstance.create(":memory:")).pipe(
        Effect.orDie,
      );
      const connection = yield* Effect.tryPromise(() => instance.connect()).pipe(Effect.orDie);
      return { connection, instance };
    }),
    ({ connection, instance }) =>
      Effect.sync(() => {
        try {
          connection.closeSync();
          instance.closeSync();
        } catch {
          // Ignore cleanup errors - resource may already be released
        }
      }),
  ).pipe(Effect.map(({ connection }) => connection));
