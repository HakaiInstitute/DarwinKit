import * as duckdb from "@duckdb/node-api";
import { dirname, join, resolve } from "@std/path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import type {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
  WorkspaceImportError,
} from "@dwkt/core";
import { importCsvToWorkspace, importSchemaToWorkspace } from "@dwkt/core";
import type { WorkspaceConfig } from "@dwkt/domain";
import { ErrorCode, getValidationProfile } from "@dwkt/domain";
import { json2csv } from "json-2-csv";
import { Workspace } from "./workspace.ts";

/**
 * Represents an error that occurs during the data transformation process.
 */
export class TransformationError extends Data.TaggedError("TransformationError")<{
  readonly message: string;
  readonly code: ErrorCode;
  readonly cause?: Error;
}> {}

/**
 * Represents an error that occurs during the output process.
 */
export class OutputError extends Data.TaggedError("OutputError")<{
  readonly message: string;
  readonly outputPath: string;
  readonly code: ErrorCode;
  readonly cause?: Error;
}> {}

/**
 * Creates tables in the DuckDB database from the CSV files specified in the workspace configuration.
 * It also executes any post-import SQL transformations.
 * @param connection - The active DuckDB connection.
 * @param config - The workspace configuration.
 * @param basePath - The base path for resolving relative CSV file paths.
 * @returns An Effect that completes when all tables are created, or fails with a TransformationError.
 */
export function createTablesFromCSV( // Export for testing
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
  basePath: string,
): Effect.Effect<
  void,
  | TransformationError
  | WorkspaceImportError,
  never
> {
  // Using Effect.gen to handle asynchronous operations in a sequential and readable manner.
  return Effect.gen(function* (_) {
    // Type guard - ensure config has transform settings
    if (!("transform" in config)) {
      return;
    }

    // Check if there are any inputs defined in the configuration. If not, exit the function.
    if (!config.transform.inputs) {
      return;
    }

    // Build a string of null values from the configuration to be used in the DuckDB query.
    const nullStr = config.transform.nullValues.map((v: string) => `'${v}'`).join(", ");

    for (const [tableName, csvPath] of Object.entries(config.transform.inputs)) {
      if (typeof csvPath !== "string") continue;

      const fullPath = resolve(basePath, csvPath);

      yield* _(importCsvToWorkspace(connection, tableName, fullPath, nullStr));
    }
  });
}

/**
 * Executes post-import transformation SQL queries on the given DuckDB connection.
 *
 * This function runs a series of SQL transformations defined in the workspace configuration
 * after data has been imported. It processes each transformation sequentially and handles
 * any errors that occur during execution.
 *
 * @param config - The workspace configuration containing transform settings
 * @param connection - The DuckDB connection to execute transformations on
 * @returns An Effect that completes when all transformations are executed successfully,
 *          or fails with a TransformationError if any transformation fails
 *
 * @remarks
 * - If the config lacks a "transform" property or postImportTransforms array, the effect returns without executing anything
 * - Transformations are executed sequentially in the order they appear in the configuration
 * - Any errors during SQL execution are caught and wrapped in a TransformationError with context
 */
function runPostImportTransformations(
  config: WorkspaceConfig,
  connection: duckdb.DuckDBConnection,
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* (_) {
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

/**
 * Creates tables based on the schema definitions in the workspace configuration.
 * This includes creating ENUM types for controlled vocabularies and defining table structures.
 * @param connection - The active DuckDB connection.
 * @param config - The workspace configuration.
 * @returns An Effect that completes when all schema tables are created, or fails with a WorkspaceImportError.
 */
export function createTableFromSchema(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    // Type guard - ensure config has transform settings
    if (!("transform" in config)) {
      return;
    }

    for (const dataset of config.transform.datasets) {
      yield* _(importSchemaToWorkspace(connection, dataset, config.transform.datasets));
    }
  });
}

/**
 * Populates the schema tables with data from the source data tables using SQL transformations.
 * @param connection - The active DuckDB connection.
 * @param config - The workspace configuration.
 * @returns An Effect that completes when the tables are populated, or fails with a TransformationError.
 */
export function populateSchemaFromDataTables( // Export for testing
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* (_) {
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

/**
 * Exports the data from OBIS tables to CSV files.
 * @param connection - The active DuckDB connection.
 * @param config - The workspace configuration.
 * @returns An Effect that completes when all tables are exported, or fails with an OutputError.
 */
export function exportObisTablesToCSV(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
): Effect.Effect<void, OutputError> {
  // Type guard - ensure config has transform settings
  if (!("transform" in config)) {
    return Effect.succeed(void 0);
  }

  const withTimestamp = config.transform.output.outputFilesWithTimestamp ?? true;
  const tables = [
    ...new Set(config.transform.datasets.map((ds) => ds.profile.toLowerCase())),
  ];
  const outputPath = config.transform.output.outputDir;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return Effect.gen(function* (_) {
    // Create output directory, recursively if necessary
    yield* _(
      Effect.try(() => Deno.mkdirSync(outputPath, { recursive: true })).pipe(
        Effect.mapError((error) =>
          new OutputError({
            message: `Failed to create output directory: ${
              error instanceof Error ? error.message : String(error)
            }`,
            outputPath: outputPath,
            code: ErrorCode.FILE_NOT_FOUND,
            cause: error instanceof Error ? error : new Error(String(error)),
          })
        ),
      ),
    );

    for (const tableName of tables) {
      const selectColumns: string[] = [];
      if (config.transform?.output?.dropNullColumns) {
        // Get column names
        const columnNamesResult = yield* _(
          Effect.tryPromise({
            try: () => connection.runAndReadAll(`PRAGMA table_info(${tableName});`),
            catch: (error) =>
              new OutputError({
                message: `Failed to read table schema for ${tableName}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
                outputPath,
                code: ErrorCode.DATABASE_ERROR,
                cause: error instanceof Error ? error : new Error(String(error)),
              }),
          }),
        );
        const columnNames = columnNamesResult.getRowObjectsJson().map((row) => row.name);

        for (const columnName of columnNames) {
          // Check if the column is entirely NULL
          const nullCountResult = yield* _(
            Effect.tryPromise({
              try: () =>
                connection.runAndReadAll(
                  `SELECT COUNT(*) AS null_count FROM ${tableName} WHERE "${columnName}" IS NOT NULL;`,
                ),
              catch: (error) =>
                new OutputError({
                  message: `Failed to count non-null values for ${tableName}.${columnName}: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                  outputPath,
                  code: ErrorCode.DATABASE_ERROR,
                  cause: error instanceof Error ? error : new Error(String(error)),
                }),
            }),
          );
          const notNullCount = Number(nullCountResult.getRowObjectsJson()[0].null_count ?? 0);
          if (notNullCount > 0) {
            selectColumns.push(`"${columnName}"`);
          }
        }
      } else {
        selectColumns.push("*");
      }

      // Fetch all data from the current table
      const result = yield* _(
        Effect.tryPromise({
          try: () =>
            connection.runAndReadAll(`SELECT ${selectColumns.join(",")} FROM ${tableName}`),
          catch: (error) =>
            new OutputError({
              message: `Failed to select data from ${tableName}: ${
                error instanceof Error ? error.message : String(error)
              }`,
              outputPath,
              code: ErrorCode.DATABASE_ERROR,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );
      // Generate the filename for the CSV file, including a timestamp if specified
      const filename = withTimestamp ? `${tableName}-${timestamp}.csv` : `${tableName}.csv`;
      const fullPath: string = join(outputPath, filename);

      // Write the data to the CSV file
      yield* _(Effect.tryPromise({
        try: () => Deno.writeTextFile(fullPath, json2csv(result.getRowObjectsJson())),
        catch: (error) =>
          new OutputError({
            message: `Failed to write results file: ${
              error instanceof Error ? error.message : String(error)
            }`,
            outputPath: fullPath,
            code: ErrorCode.DATABASE_ERROR,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }));
    }
  });
}

/**
 * Exports the in-memory DuckDB database to a persistent file.
 * The output file name can include a timestamp based on the `withTimestamp` flag.
 *
 * @param connection - The active DuckDB connection.
 * @param config - The workspace configuration.
 * @returns An Effect that completes when the database is exported, or fails with an OutputError.
 */
export function exportToPersistentDB(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
): Effect.Effect<void, OutputError> {
  // Type guard - ensure config has transform settings
  if (!("transform" in config)) {
    return Effect.succeed(void 0);
  }

  const withTimestamp = config.transform.output.outputFilesWithTimestamp ?? true;
  const outputPath = config.transform.output.outputDir;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dbName = "obis"; // Default database name for the exported file
  const dbFileName = config.transform.output.exportDBFileName || dbName;
  const filename = withTimestamp ? `${dbFileName}-${timestamp}.duckdb` : `${dbFileName}.duckdb`;
  const fullPath = join(outputPath, filename);

  return Effect.gen(function* (_) {
    if (!config.transform.output.exportDB) {
      return;
    }

    // Create output directory, recursively if necessary
    yield* _(
      Effect.try(() => Deno.mkdirSync(outputPath, { recursive: true })).pipe(
        Effect.mapError((error) =>
          new OutputError({
            message: `Failed to create output directory: ${error}`,
            outputPath,
            code: ErrorCode.FILE_NOT_FOUND,
            cause: error instanceof Error ? error : new Error(String(error)),
          })
        ),
      ),
    );

    // Check if DuckDB file already exists
    const fileExists = yield* _(Effect.tryPromise({
      try: () => Deno.stat(fullPath).then(() => true).catch(() => false),
      catch: (error) =>
        new OutputError({
          message: `Failed get statistics for DB at ${fullPath}: ${error}`,
          outputPath,
          code: ErrorCode.FILE_NOT_FOUND,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    }));

    // If DuckDB file exists, delete it
    if (fileExists) {
      yield* _(Effect.tryPromise({
        try: () => Deno.remove(fullPath),
        catch: (error) =>
          new OutputError({
            message: `Failed to delete existing output file: ${error}`,
            outputPath: fullPath,
            code: ErrorCode.FILE_NOT_FOUND,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }));
    }

    // Export the in-memory database to a persistent DuckDB file. This will create the file if it doesn't exist.
    // We cant use COPY TO DATABASE directly, as it creates constraint violations when tables are copied out of order.
    for (const dataset of config.transform.datasets) {
      // Load validation profile if specified
      const transformProfile = getValidationProfile(dataset.profile);
      if (!transformProfile) {
        console.warn(`No validation profile found for ${dataset.profile}, skipping table export.`);
        continue;
      }
      const tableName = transformProfile.name.toLowerCase();
      yield* _(
        Effect.tryPromise({
          // try: () => connection.run(`ATTACH '${fullPath}'; COPY FROM DATABASE memory TO ${dbName}; DETACH ${dbName};`),
          try: () =>
            connection.run(`
            ATTACH '${fullPath}' as ${dbName};
            CREATE TABLE IF NOT EXISTS ${dbName}.${tableName} AS FROM memory.${tableName};
            DETACH ${dbName};
          `),
          catch: (error) =>
            new OutputError({
              message: `Failed export DB to ${fullPath}: ${error}`,
              outputPath,
              code: ErrorCode.FILE_NOT_FOUND,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );
    }
  });
}

/**
 * Executes the entire data transformation process for a workspace.
 * This involves connecting to an in-memory DuckDB, creating tables from CSVs,
 * creating schema-defined tables, and populating them with transformed data.
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
  return Effect.acquireUseRelease(
    Effect.tryPromise(() => duckdb.DuckDBConnection.create()).pipe(Effect.orDie),
    (connection) =>
      Effect.gen(function* (_) {
        const workspace = yield* _(Workspace.discover(configPath));
        const config = workspace.getConfig();
        const resolvedConfigPath = workspace.getConfigPath();
        const basePath = dirname(resolvedConfigPath);

        console.log("Creating tables from CSV files...");
        yield* _(createTablesFromCSV(connection, config, basePath));
        // Execute any post-import SQL transformations defined in the configuration.
        yield* _(runPostImportTransformations(config, connection));

        console.log("Creating OBIS tables from schema...");
        yield* _(createTableFromSchema(connection, config));

        console.log("Populating OBIS tables from data tables...");
        yield* _(populateSchemaFromDataTables(connection, config));

        console.log("Exporting OBIS tables to CSV...");
        yield* _(exportObisTablesToCSV(connection, config));

        console.log("Exporting DuckDB database to persistent file...");
        yield* _(exportToPersistentDB(connection, config));
      }),
    // Release: close DuckDB connection (ignore any cleanup errors)
    (connection) => Effect.try(() => connection.closeSync()).pipe(Effect.ignore),
  );
}
