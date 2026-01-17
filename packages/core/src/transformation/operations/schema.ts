/**
 * Schema operations - Create database tables from schema definitions
 */

import * as Effect from "effect/Effect";

import type { WorkspaceImportError } from "@dwkt/core";
import { importSchemaToWorkspace } from "@dwkt/core";
import type { Workspace } from "../../workspace/workspace.ts";

/**
 * Creates tables based on the schema definitions in the workspace configuration.
 * This includes creating ENUM types for controlled vocabularies and defining table structures.
 *
 * @param workspace - The workspace containing configuration and connection
 * @returns An Effect that completes when all schema tables are created, or fails with a WorkspaceImportError.
 */
export function createTableFromSchema(
  workspace: Workspace,
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    const config = workspace.getConfig();
    const connection = yield* _(workspace.getConnection());

    // Type guard - ensure config has transform settings
    if (!("transform" in config)) {
      return;
    }

    for (const dataset of config.transform.datasets) {
      yield* _(importSchemaToWorkspace(connection, dataset, config.transform.datasets));
    }
  });
}
