/**
 * Transform - Backward-compatible transformation orchestration
 *
 * This file maintains the public API for transformation operations while
 * delegating to the new transformation module structure.
 */

import * as Effect from "effect/Effect";

import type {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
  WorkspaceImportError,
} from "@dwkt/core";
import { Workspace } from "@dwkt/core";

// Re-export transformation errors and operations for backward compatibility
export { OutputError, TransformationError } from "./transformation/errors.ts";
export {
  createTableFromSchema,
  createTablesFromCSV,
  exportObisTablesToCSV,
  exportToPersistentDB,
  populateSchemaFromDataTables,
  runPostImportTransformations,
} from "./transformation/operations/index.ts";

// Import operations for use in transformFile
import {
  createTableFromSchema,
  createTablesFromCSV,
  exportObisTablesToCSV,
  exportToPersistentDB,
  populateSchemaFromDataTables,
  runPostImportTransformations,
} from "./transformation/operations/index.ts";
import type { OutputError, TransformationError } from "./transformation/errors.ts";

/**
 * Executes the entire data transformation process for a workspace.
 * This involves connecting to an in-memory DuckDB, creating tables from CSVs,
 * creating schema-defined tables, and populating them with transformed data.
 *
 * @param configPath - Optional path to the workspace configuration file. If not provided, it will be discovered.
 * @returns An Effect that completes when the transformation is successful, or fails with a TransformationError or ConfigError.
 */
export function transformFile(
  configPath?: string,
): Effect.Effect<
  void,
  | TransformationError
  | OutputError
  | WorkspaceImportError
  | ConfigNotFoundError
  | ConfigParseError
  | ConfigValidationError
  | DatasetFileNotFoundError,
  never
> {
  return Effect.gen(function* (_) {
    const workspace = yield* _(Workspace.discover(configPath));

    try {
      console.log("Creating tables from CSV files...");
      yield* _(createTablesFromCSV(workspace));

      // Execute any post-import SQL transformations defined in the configuration.
      yield* _(runPostImportTransformations(workspace));

      console.log("Creating OBIS tables from schema...");
      yield* _(createTableFromSchema(workspace));

      console.log("Populating OBIS tables from data tables...");
      yield* _(populateSchemaFromDataTables(workspace));

      console.log("Exporting OBIS tables to CSV...");
      yield* _(exportObisTablesToCSV(workspace));

      console.log("Exporting DuckDB database to persistent file...");
      yield* _(exportToPersistentDB(workspace));
    } finally {
      // Clean up workspace resources
      workspace.close();
    }
  });
}
