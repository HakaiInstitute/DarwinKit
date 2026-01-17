/**
 * Schema operations - Create database tables from schema definitions
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";

import type { WorkspaceImportError } from "@dwkt/core";
import { importSchemaToWorkspace } from "@dwkt/core";
import type { TransformDatasetConfig } from "@dwkt/domain";

/**
 * Creates tables based on schema definitions.
 *
 * This includes creating ENUM types for controlled vocabularies and defining table structures
 * based on Darwin Core validation profiles.
 *
 * This function takes explicit dependencies rather than a workspace reference,
 * making it easier to test and reuse in different contexts.
 *
 * @param connection - DuckDB connection to use for creating tables
 * @param datasets - Array of dataset configurations with schema information
 * @returns An Effect that completes when all schema tables are created, or fails with a WorkspaceImportError.
 *
 * @example
 * ```typescript
 * const connection = yield* createConnection();
 * yield* createTableFromSchema(connection, [
 *   { name: "events", profile: "Event", source: { events: "raw_events" }, fields: {...} },
 *   { name: "occurrences", profile: "Occurrence", source: { occ: "raw_occ" }, fields: {...} }
 * ]);
 * ```
 */
export function createTableFromSchema(
  connection: DuckDBConnection,
  datasets: readonly TransformDatasetConfig[],
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    for (const dataset of datasets) {
      yield* _(importSchemaToWorkspace(connection, dataset, datasets));
    }
  });
}
