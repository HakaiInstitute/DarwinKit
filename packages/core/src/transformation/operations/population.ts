/**
 * Population operations - Populate schema tables with transformed data
 */

import * as Effect from "effect/Effect";

import { ErrorCode, getValidationProfile } from "@dwkt/domain";
import type { Workspace } from "../../workspace/workspace.ts";
import { TransformationError } from "../errors.ts";

/**
 * Populates the schema tables with data from the source data tables using SQL transformations.
 *
 * @param workspace - The workspace containing configuration and connection
 * @returns An Effect that completes when the tables are populated, or fails with a TransformationError.
 */
export function populateSchemaFromDataTables(
  workspace: Workspace,
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* (_) {
    const config = workspace.getConfig();
    const connection = yield* _(workspace.getConnection());

    // Type guard - ensure config has transform settings
    if (!("transform" in config)) {
      return;
    }

    for (const dataset of config.transform.datasets) {
      if (!dataset.fields) {
        return yield* _(Effect.fail(
          new TransformationError({
            message: `No field definitions found in '${dataset?.name}'`,
            code: ErrorCode.INVALID_CONFIG,
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
            code: ErrorCode.INVALID_CONFIG,
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
        const isSimpleTable = !joinSQL.trim().includes(" ");
        return isSimpleTable ? `${joinSQL} AS ${tableName}` : `(${joinSQL}) AS ${tableName}`;
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
            code: ErrorCode.DATABASE_ERROR,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }));
    }
  });
}
