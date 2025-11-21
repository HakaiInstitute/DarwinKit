import * as duckdb from '@duckdb/node-api';
import { dirname, resolve, join } from '@std/path';
import * as Effect from 'effect/Effect';
import * as Data from 'effect/Data';

import { WorkspaceConfigService } from '../workspace/workspace-config-service.ts';
import type { WorkspaceConfig } from '@dwkt/domain';
import { ErrorCode, getValidationProfile } from '@dwkt/domain';
import { ConfigError } from '@dwkt/core';
import { json2csv } from 'json-2-csv';

/**
 * Represents an error that occurs during the data transformation process.
 */
export class TransformationError extends Data.TaggedError('TransformationError')<{
  readonly message: string;
  readonly code: ErrorCode;
  readonly cause?: Error;
}> { }

/**
 * Represents an error that occurs during the output process.
 */
export class OutputError extends Data.TaggedError('OutputError')<{
  readonly message: string;
  readonly outputPath: string;
  readonly cause?: Error;
}> { }

/**
 * Creates tables in the DuckDB database from the CSV files specified in the workspace configuration.
 * It also executes any post-import SQL transformations.
 * @param connection - The active DuckDB connection.
 * @param config - The workspace configuration.
 * @param basePath - The base path for resolving relative CSV file paths.
 * @returns An Effect that completes when all tables are created, or fails with a TransformationError.
 */
function createTablesFromCSV(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
  basePath: string,
): Effect.Effect<void, TransformationError> {
  // Using Effect.gen to handle asynchronous operations in a sequential and readable manner.
  return Effect.gen(function* (_) {
    // Check if there are any inputs defined in the configuration. If not, exit the function.
    if (!config.transform?.inputs) {
      return;
    }

    // Build a string of null values from the configuration to be used in the DuckDB query.
    const nullStr = config.transform.nullValues.map((v) => `'${v}'`).join(", ");

    for (const [tableName, csvPath] of Object.entries(config.transform.inputs)) {
      const fullPath = resolve(basePath, csvPath);

      yield* _(Effect.tryPromise({
        try: () =>
          // Create a table from the CSV file, using the specified null values.
          connection.run(`CREATE TABLE IF NOT EXISTS ${tableName} AS SELECT * FROM read_csv_auto('${fullPath}', nullstr=[${nullStr}])`),
        catch: (error) => {
          console.error(error);
          return new TransformationError({
            message: `Failed to create table '${tableName}' from CSV`,
            code: ErrorCode.TRANSFORMATION_ERROR,
            cause: error instanceof Error ? error : new Error(String(error)),
          })
        },
      }));
    }

    // Execute any post-import SQL transformations defined in the configuration.
    for (const transformSQL of config.transform.postImportTransforms || []) {
      yield* _(Effect.tryPromise({
        try: () => connection.run(transformSQL),
        catch: (error) => {
          console.error(error);
          return new TransformationError({
            message: `Failed to execute post-import transform SQL`,
            code: ErrorCode.TRANSFORMATION_ERROR,
            cause: error instanceof Error ? error : new Error(String(error)),
          })
        },
      }));
    }

  });
}

/**
 * Creates tables based on the schema definitions in the workspace configuration.
 * This includes creating ENUM types for controlled vocabularies and defining table structures.
 * @param connection - The active DuckDB connection.
 * @param config - The workspace configuration.
 * @returns An Effect that completes when all schema tables are created, or fails with a TransformationError.
 */
function createTableFromSchema(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* (_) {

    for (const dataset of config.transform.datasets) {
      // Load validation profile if specified
      const transformProfile = getValidationProfile(dataset.profile)
      const tableName = transformProfile.name.toLowerCase();
      // Create ENUM types for controlled vocabularies
      const enums = Object.entries(transformProfile.fields).map(([fieldName, field], i) => {
        if (field.type === "controlled-vocabulary" && field.values) {
          const enumName = `${tableName}_${fieldName}_enum`;
          const enumValues = Object.keys(field.values).map((v: string) => `'${v}'`).join(', ');
          return `CREATE TYPE IF NOT EXISTS ${enumName} AS ENUM (${enumValues});`
        }
        return null;
      })
      const columns = Object.keys(transformProfile.fields).map((fieldName) => {
        const field = transformProfile.fields[fieldName];
        const fieldType = (field.type?.toUpperCase() || 'TEXT')
          .replace('IDENTIFIER', 'TEXT')
          .replace('CONTROLLED-VOCABULARY', `${tableName}_${fieldName}_enum`)
          .replace('URI', 'TEXT');
        let fieldStr = `"${fieldName}" ${fieldType}`;
        if (fieldName == tableName + 'ID') {
          fieldStr += " PRIMARY KEY"
        } else if (field.obis_required === "required") {
          fieldStr += " NOT NULL"
        }
        return fieldStr;
      });

      // Create enums
      connection.run(enums.filter(e => e !== null).join('\n'));
      // Create table
      connection.run(`CREATE TABLE IF NOT EXISTS ${tableName} (${columns.join(', ')})`);
    }
  });
}

/**
 * Populates the schema tables with data from the source data tables using SQL transformations.
 * @param connection - The active DuckDB connection.
 * @param config - The workspace configuration.
 * @returns An Effect that completes when the tables are populated, or fails with a TransformationError.
 */
function populateSchemaFromDataTables(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* (_) {
    for (const dataset of config.transform.datasets) {
      const targetColumnNames = Object.keys(dataset.fields).map((fieldName) => `"${fieldName}"`);
      // Create column calculations based on the transformations defined in the dataset fields
      const columnCalculations = Object.entries(dataset.fields).map(([targetField, transformation]) => {
        return `${transformation} AS "${targetField}"`;
      });

      const transformProfile = getValidationProfile(dataset.profile)
      const tableName = transformProfile.name.toLowerCase();
      const tableSources = Object.entries(dataset.source).map(([tableName, joinSQL]) => `(${joinSQL}) AS ${tableName}`).join(', ');

      const insertSQL = `INSERT INTO ${tableName} (${targetColumnNames.join(', ')}) SELECT ${columnCalculations.join(', ')} FROM ${tableSources};`;

      yield* _(Effect.tryPromise({
        try: () => connection.run(insertSQL),
        catch: (error) => {
          console.error(error);
          console.log(insertSQL);
          return new TransformationError({
            message: `Failed to populate table '${tableName}' from dataset '${dataset.name}'`,
            code: ErrorCode.TRANSFORMATION_ERROR,
            cause: error instanceof Error ? error : new Error(String(error)),
          })
        }
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
  config: WorkspaceConfig
): Effect.Effect<void, OutputError> {
  const withTimestamp = config.transform?.outputFilesWithTimestamp ?? true;
  const tables = config.transform?.datasets.map((ds) => ds.profile.toLowerCase()) || [];
  const outputPath = config.transform?.outputDir || './transform_results';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return Effect.gen(function* (_) {
    // Create output directory, recursively if necessary
    yield* _(Effect.tryPromise({
      try: () => Deno.mkdir(outputPath, { recursive: true }),
      catch: (error) => new OutputError({
        message: `Failed to create output directory: ${error instanceof Error ? error.message : String(error)}`,
        outputPath: outputPath,
        cause: error instanceof Error ? error : new Error(String(error)),
      }),
    })
    );

    for (const tableName of tables) {
      // Fetch all data from the current table
      const result = yield* _(Effect.tryPromise(() => connection.runAndReadAll(`SELECT * FROM ${tableName}`)));
      // Generate the filename for the CSV file, including a timestamp if specified
      const filename = withTimestamp ? `${tableName}-${timestamp}.csv` : `${tableName}.csv`;
      const fullPath:string = join(outputPath, filename);

      // Write the data to the CSV file
      yield* _(Effect.tryPromise({
        try: () => Deno.writeTextFile(fullPath, json2csv(result.getRowObjectsJson())),
        catch: (error) => new OutputError({
          message: `Failed to write results file: ${error instanceof Error ? error.message : String(error)}`,
          outputPath: fullPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
      })
      );
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
  config: WorkspaceConfig
): Effect.Effect<void, OutputError> {
  const withTimestamp = config.transform?.outputFilesWithTimestamp ?? true;
  const outputPath = config.transform?.outputDir || './transform_results';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dbName = 'obis'; // Default database name for the exported file
  const filename = withTimestamp ? `${dbName}-${timestamp}.duckdb` : `${dbName}.duckdb`;
  const fullPath = join(outputPath, filename);
  return Effect.gen(function* (_) {

    // Create output directory, recursively if necessary
    yield* _(Effect.tryPromise({
      try: () => Deno.mkdir(outputPath, { recursive: true }),
      catch: (error) => new OutputError({
        message: `Failed to create output directory: ${error}`,
        outputPath,
        cause: error instanceof Error ? error : new Error(String(error)),
      }),
    })
    );

    // Check if DuckDB file already exists
    const fileExists = yield* _(Effect.tryPromise({
      try: () => Deno.stat(fullPath).then(() => true).catch(() => false),
      catch: (error) => new OutputError({
        message: `Failed export DB to ${fullPath}: ${error}`,
        outputPath,
        cause: error instanceof Error ? error : new Error(String(error)),
      }),
    }));

    // If DuckDB file exists, delete it
    if (fileExists) {
      yield* _(Effect.tryPromise({
        try: () => Deno.remove(fullPath),
        catch: (error) => new OutputError({
          message: `Failed to delete existing output file: ${error}`,
          outputPath: fullPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
      })
      );
    }

    // Export the in-memory database to a persistent DuckDB file. This will create the file if it doesn't exist.
    yield* _(
      Effect.tryPromise({
        try: () => connection.run(`ATTACH '${fullPath}'; COPY FROM DATABASE memory TO ${dbName}; DETACH ${dbName};`),
        catch: (error) => new OutputError({
          message: `Failed export DB to ${fullPath}: ${error}`,
          outputPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
      })
    );

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
): Effect.Effect<void, TransformationError | ConfigError> {
  return Effect.acquireUseRelease(
    Effect.tryPromise(() => duckdb.DuckDBConnection.create()),
    (connection) =>
      Effect.gen(function* (_) {
        const { config, configPath: resolvedConfigPath } = yield* _(
          WorkspaceConfigService.discoverAndLoad(configPath),
        );
        const basePath = dirname(resolvedConfigPath);
        
        console.log('Creating tables from CSV files...');
        yield* _(createTablesFromCSV(connection, config, basePath));
        
        console.log('Creating OBIS tables from schema...');
        yield* _(createTableFromSchema(connection, config));
        
        console.log('Populating OBIS tables from data tables...');
        yield* _(populateSchemaFromDataTables(connection, config));
        
        console.log('Exporting OBIS tables to CSV...');       
        yield* _(exportObisTablesToCSV(connection, config));

        console.log('Exporting DuckDB database to persistent file...');
        yield* _(exportToPersistentDB(connection, config));

      }),
    (connection) => Effect.promise(async () => connection.closeSync()),
  );
}
