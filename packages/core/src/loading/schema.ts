import type { DuckDBConnection } from "@duckdb/node-api";
import type { ResolvedSpec } from "@dwkit/domain/schemas";
import { WorkspaceImportError } from "@dwkit/domain/errors";
import * as Effect from "effect/Effect";
import { sanitizeTableName } from "./sql.ts";

/**
 * Create an empty all-VARCHAR output table for a transform dataset.
 *
 * Only the mapped fields present in the spec become VARCHAR columns, plus an
 * internal `_row_number`, so the table's shape matches what the transform
 * produces and validateTable treats it like a validation raw table: an unmapped
 * required field is an absent column (a structural MissingFieldViolation) rather
 * than an all-NULL placeholder. No constraints are declared; enforcement is SQL
 * detection over the populated table.
 */
export function createOutputTable(
  connection: DuckDBConnection,
  spec: ResolvedSpec,
  fieldNames: readonly string[],
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* () {
    const tableName = sanitizeTableName(spec.name).toLowerCase();
    const rawFields = spec.rawFields ?? {};

    // Only mapped fields that exist in the spec become columns. A mapped field
    // absent from the spec gets no column, so populate's INSERT fails loudly
    // (an unknown target field is a config error).
    const columns = fieldNames
      .filter((fieldName) => fieldName in rawFields)
      .map((fieldName) => `"${fieldName}" VARCHAR`);
    columns.push("_row_number BIGINT");

    yield* Effect.tryPromise({
      try: () => connection.run(`DROP TABLE IF EXISTS ${tableName}`),
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to drop table '${tableName}'`,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });

    const tableSql = `CREATE TABLE ${tableName} (${columns.join(", ")})`;
    yield* Effect.tryPromise({
      try: () => connection.run(tableSql),
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to create table '${tableName}': ${tableSql}`,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });
  });
}
