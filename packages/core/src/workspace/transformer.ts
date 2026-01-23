/**
 * Transformer - Workspace-level transformation orchestration
 *
 * Coordinates data transformation operations including:
 * - CSV import
 * - Schema creation
 * - Data population
 * - Export to CSV and DuckDB
 */

import type { ConfigMissingSettingsError, ConfigWithTransformation } from "@dwkt/domain";
import { requireTransform } from "@dwkt/domain";
import { dirname } from "@std/path";
import * as Effect from "effect/Effect";

import type { OutputError, TransformationError } from "../transformation/errors.ts";
import {
  createTableFromSchema,
  createTablesFromCSV,
  exportObisTablesToCSV,
  exportToPersistentDB,
  populateSchemaFromDataTables,
  runPostImportTransformations,
} from "../transformation/operations/index.ts";
import type { WorkspaceImportError } from "./errors.ts";
import type { Workspace } from "./workspace.ts";

/**
 * Options for transformation operations
 */
export interface TransformOptions {
  /** Whether to skip CSV import (useful if data already loaded) */
  skipImport?: boolean;
  /** Whether to skip post-import transformations */
  skipPostImport?: boolean;
  /** Whether to skip export operations */
  skipExport?: boolean;
}

/**
 * Transformer orchestrates data transformation operations for a workspace.
 *
 * The Transformer coordinates the full transformation pipeline:
 * 1. Import CSV files into DuckDB
 * 2. Run post-import SQL transformations
 * 3. Create schema tables from validation profiles
 * 4. Populate schema tables with transformed data
 * 5. Export to CSV and persistent DuckDB files
 *
 * Usage:
 * ```typescript
 * const workspace = await Effect.runPromise(Workspace.discover());
 * await Effect.runPromise(workspace.transformer.transform());
 * workspace.close();
 * ```
 */
export class Transformer {
  constructor(private workspace: Workspace) {}

  /**
   * Get the transformation config from the workspace, failing if not present.
   *
   * Uses the requireTransform helper for type-safe access to transform settings.
   *
   * @returns Effect yielding the transform config or ConfigMissingSettingsError
   */
  private getTransformConfig(): Effect.Effect<
    ConfigWithTransformation,
    ConfigMissingSettingsError
  > {
    return requireTransform(this.workspace.getConfig());
  }

  /**
   * Execute the full transformation pipeline.
   *
   * @param options - Optional configuration for transformation operations
   * @returns An Effect that completes when transformation succeeds or fails with an error
   */
  run(
    options: TransformOptions = {},
  ): Effect.Effect<
    void,
    TransformationError | OutputError | WorkspaceImportError | ConfigMissingSettingsError,
    never
  > {
    const workspace = this.workspace;
    const { skipImport = false, skipPostImport = false, skipExport = false } = options;

    return Effect.gen(this, function* () {
      const config = yield* this.getTransformConfig();
      const connection = yield* workspace.getConnection();

      const basePath = dirname(workspace.getConfigPath());

      // Step 1: Import CSV files
      if (!skipImport) {
        yield* createTablesFromCSV(
          connection,
          config.transform.inputs,
          basePath,
          config.transform.import,
        );
      }

      // Step 2: Run post-import transformations
      if (!skipPostImport) {
        yield* runPostImportTransformations(
          connection,
          config.transform.postImportTransforms || [],
        );
      }

      // Step 3: Create schema tables
      yield* createTableFromSchema(connection, config.transform.datasets);

      // Step 4: Populate schema tables
      yield* populateSchemaFromDataTables(connection, config.transform.datasets);

      // Step 5: Export results
      if (!skipExport) {
        yield* exportObisTablesToCSV(
          connection,
          config.transform,
        );

        if (config.transform.output.exportDB) {
          yield* exportToPersistentDB(
            connection,
            config.transform,
          );
        }
      }
    });
  }

  /**
   * Import CSV files only (without full transformation).
   *
   * Useful for loading data before running validation or other operations.
   */
  importData(): Effect.Effect<
    void,
    TransformationError | WorkspaceImportError | ConfigMissingSettingsError,
    never
  > {
    const workspace = this.workspace;

    return Effect.gen(this, function* () {
      const config = yield* this.getTransformConfig();
      const connection = yield* workspace.getConnection();

      const basePath = dirname(workspace.getConfigPath());

      yield* createTablesFromCSV(
        connection,
        config.transform.inputs,
        basePath,
        config.transform.import,
      );
      yield* runPostImportTransformations(connection, config.transform.postImportTransforms || []);
    });
  }

  /**
   * Create schema tables only (without import or population).
   *
   * Useful for verifying schema structure before data import.
   */
  createSchemas(): Effect.Effect<void, WorkspaceImportError | ConfigMissingSettingsError, never> {
    const workspace = this.workspace;

    return Effect.gen(this, function* () {
      const config = yield* this.getTransformConfig();
      const connection = yield* workspace.getConnection();

      yield* createTableFromSchema(connection, config.transform.datasets);
    });
  }

  /**
   * Populate schema tables only (requires data and schemas to exist).
   *
   * Useful for re-running transformations after fixing data issues.
   */
  populateData(): Effect.Effect<void, TransformationError | ConfigMissingSettingsError, never> {
    const workspace = this.workspace;

    return Effect.gen(this, function* () {
      const config = yield* this.getTransformConfig();
      const connection = yield* workspace.getConnection();

      yield* populateSchemaFromDataTables(connection, config.transform.datasets);
    });
  }

  /**
   * Export results only (requires populated schema tables).
   *
   * Useful for re-exporting after manual data corrections.
   */
  exportResults(): Effect.Effect<void, OutputError | ConfigMissingSettingsError, never> {
    const workspace = this.workspace;

    return Effect.gen(this, function* () {
      const config = yield* this.getTransformConfig();
      const connection = yield* workspace.getConnection();

      yield* exportObisTablesToCSV(connection, config.transform);

      if (config.transform.output.exportDB) {
        yield* exportToPersistentDB(connection, config.transform);
      }
    });
  }
}
