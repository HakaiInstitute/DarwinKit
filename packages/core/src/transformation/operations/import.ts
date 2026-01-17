/**
 * Import operations - CSV import and post-import transformations
 */

import { dirname, resolve } from "@std/path";
import * as Effect from "effect/Effect";

import type { WorkspaceImportError } from "@dwkt/core";
import { ErrorCode } from "@dwkt/domain";
import type { Workspace } from "../../workspace/workspace.ts";
import { TransformationError } from "../errors.ts";

/**
 * Creates tables in the DuckDB database from the CSV files specified in the workspace configuration.
 *
 * @param workspace - The workspace containing configuration and connection
 * @returns An Effect that completes when all tables are created, or fails with a TransformationError.
 */
export function createTablesFromCSV(
  workspace: Workspace,
): Effect.Effect<
  void,
  | TransformationError
  | WorkspaceImportError,
  never
> {
  // Using Effect.gen to handle asynchronous operations in a sequential and readable manner.
  return Effect.gen(function* (_) {
    const config = workspace.getConfig();
    const basePath = dirname(workspace.getConfigPath());

    // Type guard - ensure config has transform settings
    if (!("transform" in config)) {
      return;
    }

    // Check if there are any inputs defined in the configuration. If not, exit the function.
    if (!config.transform.inputs) {
      return;
    }

    for (const [tableName, csvPath] of Object.entries(config.transform.inputs)) {
      if (typeof csvPath !== "string") continue;

      const fullPath = resolve(basePath, csvPath);

      yield* _(workspace.importCsv(fullPath, tableName));
    }
  });
}

/**
 * Executes post-import transformation SQL queries on the workspace.
 *
 * This function runs a series of SQL transformations defined in the workspace configuration
 * after data has been imported. It processes each transformation sequentially and handles
 * any errors that occur during execution.
 *
 * @param workspace - The workspace containing configuration and connection
 * @returns An Effect that completes when all transformations are executed successfully,
 *          or fails with a TransformationError if any transformation fails
 *
 * @remarks
 * - If the config lacks a "transform" property or postImportTransforms array, the effect returns without executing anything
 * - Transformations are executed sequentially in the order they appear in the configuration
 * - Any errors during SQL execution are caught and wrapped in a TransformationError with context
 */
export function runPostImportTransformations(
  workspace: Workspace,
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* (_) {
    const config = workspace.getConfig();
    const connection = yield* _(workspace.getConnection());

    // Type guard - ensure config has transform settings
    if (!("transform" in config)) {
      return;
    }
    if (!config.transform.postImportTransforms) {
      return;
    }
    for (const transformSQL of config.transform.postImportTransforms) {
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
