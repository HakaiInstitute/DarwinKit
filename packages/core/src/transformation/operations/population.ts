/**
 * Population operations - Populate schema tables with transformed data
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";

import type { TransformDatasetConfig } from "@dwkt/domain";
import { getValidationProfile } from "@dwkt/domain";
import { TransformationError } from "../errors.ts";

/**
 * Populates schema tables with data from source tables using SQL transformations.
 *
 * This function reads the field mappings and source configurations from each dataset,
 * generates INSERT...SELECT statements, and populates the target schema tables.
 *
 * This function takes explicit dependencies rather than a workspace reference,
 * making it easier to test and reuse in different contexts.
 *
 * @param connection - DuckDB connection to use for populating tables
 * @param datasets - Array of dataset configurations with field transformations
 * @returns An Effect that completes when tables are populated, or fails with a TransformationError.
 *
 * @example
 * ```typescript
 * const connection = yield* createConnection();
 * yield* populateSchemaFromDataTables(connection, [
 *   {
 *     name: "events",
 *     profile: "Event",
 *     source: { e: "raw_events" },
 *     fields: {
 *       eventID: "e.event_id",
 *       eventDate: "e.date"
 *     }
 *   }
 * ]);
 * ```
 */
export function populateSchemaFromDataTables(
  connection: DuckDBConnection,
  datasets: readonly TransformDatasetConfig[],
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* (_) {
    for (const dataset of datasets) {
      if (!dataset.fields) {
        return yield* _(Effect.fail(
          new TransformationError({
            message: `No field definitions found in '${dataset?.name}'`,
            cause: new Error("field property missing from dataset definition"),
          }),
        ));
      }

      // Create column calculations based on the transformations defined in the dataset fields
      const columnCalculations = Object.entries(dataset.fields)
        .map(([targetField, transformation]): string => `${transformation} AS "${targetField}"`);

      const transformProfile = getValidationProfile(dataset.profile);
      if (!transformProfile) {
        return yield* _(Effect.fail(
          new TransformationError({
            message:
              `Validation profile '${dataset.profile}' not found for dataset '${dataset.name}'`,
          }),
        ));
      }

      const targetColumnNames = Object.keys(dataset.fields).map((fieldName: string): string =>
        `"${fieldName}"`
      );
      const tableName = transformProfile.name.toLowerCase();
      const tableSources = Object.entries(dataset.source || {}).map(([tableName, joinSQL]) => {
        // Simple table names don't contain spaces, just an identifier
        // Only wrap subqueries in parentheses, not simple table names
        const joinSQLStr = String(joinSQL);
        const isSimpleTable = !joinSQLStr.trim().includes(" ");
        return isSimpleTable ? `${joinSQLStr} AS ${tableName}` : `(${joinSQLStr}) AS ${tableName}`;
      }).join(", ");

      const insertSQL = `INSERT INTO ${tableName} (${targetColumnNames.join(", ")}) SELECT ${
        columnCalculations.join(", ")
      } FROM ${tableSources};`;

      yield* _(Effect.tryPromise({
        try: () => connection.run(insertSQL),
        catch: (error) =>
          new TransformationError({
            message:
              `Failed to populate table '${tableName}' from dataset '${dataset.name}'. SQL: ${insertSQL}`,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }));
    }
  });
}
