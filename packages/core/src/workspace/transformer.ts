/**
 * Transformer - Workspace-level transformation orchestration
 *
 * Coordinates data transformation operations including:
 * - CSV import
 * - Schema creation
 * - Data population
 * - Export to CSV and DuckDB
 */

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
   * Execute the full transformation pipeline.
   *
   * @param options - Optional configuration for transformation operations
   * @returns An Effect that completes when transformation succeeds or fails with an error
   */
  run(
    options: TransformOptions = {},
  ): Effect.Effect<void, TransformationError | OutputError | WorkspaceImportError, never> {
    const workspace = this.workspace;
    const { skipImport = false, skipPostImport = false, skipExport = false } = options;

    return Effect.gen(function* () {
      // Step 1: Import CSV files
      if (!skipImport) {
        console.log("Creating tables from CSV files...");
        yield* createTablesFromCSV(workspace);
      }

      // Step 2: Run post-import transformations
      if (!skipPostImport) {
        yield* runPostImportTransformations(workspace);
      }

      // Step 3: Create schema tables
      console.log("Creating OBIS tables from schema...");
      yield* createTableFromSchema(workspace);

      // Step 4: Populate schema tables
      console.log("Populating OBIS tables from data tables...");
      yield* populateSchemaFromDataTables(workspace);

      // Step 5: Export results
      if (!skipExport) {
        console.log("Exporting OBIS tables to CSV...");
        yield* exportObisTablesToCSV(workspace);

        console.log("Exporting DuckDB database to persistent file...");
        yield* exportToPersistentDB(workspace);
      }
    });
  }

  /**
   * Import CSV files only (without full transformation).
   *
   * Useful for loading data before running validation or other operations.
   */
  importData(): Effect.Effect<void, TransformationError | WorkspaceImportError, never> {
    const workspace = this.workspace;

    return Effect.gen(function* () {
      console.log("Creating tables from CSV files...");
      yield* createTablesFromCSV(workspace);
      yield* runPostImportTransformations(workspace);
    });
  }

  /**
   * Create schema tables only (without import or population).
   *
   * Useful for verifying schema structure before data import.
   */
  createSchemas(): Effect.Effect<void, WorkspaceImportError, never> {
    const workspace = this.workspace;

    return Effect.gen(function* () {
      console.log("Creating OBIS tables from schema...");
      yield* createTableFromSchema(workspace);
    });
  }

  /**
   * Populate schema tables only (requires data and schemas to exist).
   *
   * Useful for re-running transformations after fixing data issues.
   */
  populateData(): Effect.Effect<void, TransformationError, never> {
    const workspace = this.workspace;

    return Effect.gen(function* () {
      console.log("Populating OBIS tables from data tables...");
      yield* populateSchemaFromDataTables(workspace);
    });
  }

  /**
   * Export results only (requires populated schema tables).
   *
   * Useful for re-exporting after manual data corrections.
   */
  exportResults(): Effect.Effect<void, OutputError, never> {
    const workspace = this.workspace;

    return Effect.gen(function* () {
      console.log("Exporting OBIS tables to CSV...");
      yield* exportObisTablesToCSV(workspace);

      console.log("Exporting DuckDB database to persistent file...");
      yield* exportToPersistentDB(workspace);
    });
  }
}
