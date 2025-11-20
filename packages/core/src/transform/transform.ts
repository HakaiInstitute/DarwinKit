import * as duckdb from '@duckdb/node-api';
import { dirname, resolve } from '@std/path';
import * as Effect from 'effect/Effect';
import * as Data from 'effect/Data';

import { WorkspaceConfigService } from '../workspace/workspace-config-service.ts';
import type { WorkspaceConfig } from '@dwkt/domain';
import { ErrorCode, getValidationProfile } from '@dwkt/domain';
import {ConfigError} from '@dwkt/core';

/**
 * Represents an error that occurs during the data transformation process.
 */
export class TransformationError extends Data.TaggedError('TransformationError')<{
  readonly message: string;
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
function createTablesFromCSV(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
  basePath: string,
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* (_) {
    if (!config.transform?.inputs) {
      return;
    }

    // Build null values string for DuckDB
    const nullStr = config.validation.nullValues.map((v) => `'${v}'`).join(", ");

    for (const [tableName, csvPath] of Object.entries(config.transform.inputs)) {
      const fullPath = resolve(basePath, csvPath);

      yield* _(Effect.tryPromise({
        try: () =>
          connection.run(
            `CREATE TABLE IF NOT EXISTS ${tableName} AS SELECT * FROM read_csv_auto('${fullPath}', nullstr=[${nullStr}])`,
          ),
        catch: (error) =>{
          console.error(error);
          return new TransformationError({
            message: `Failed to create table '${tableName}' from CSV`,
            code: ErrorCode.TRANSFORMATION_ERROR,
            cause: error instanceof Error ? error : new Error(String(error)),
          })
        },
      }));
    }

    // Execute any post-import SQL transformations
    for (const transformSQL of config.transform.postImportTransforms || []) {
        yield* _(Effect.tryPromise({
            try: () => connection.run(transformSQL),
            catch: (error) =>{
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
        const transformProfile =  getValidationProfile(dataset.profile) 
        const tableName = transformProfile.name.toLowerCase();
        const enums = Object.entries(transformProfile.fields).map(([fieldName, field], i)  => {
            if (field.type === "controlled-vocabulary" && field.values){
                const enumName = `${tableName}_${fieldName}_enum`;
                const enumValues = Object.keys(field.values).map( (v: string) => `'${v}'`).join(', ');
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
            let fieldStr =  `"${fieldName}" ${fieldType}`;
            if (fieldName == tableName + 'ID'){
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

        // Verify the table was created
        const result = yield* _(
        Effect.tryPromise(() => connection.runAndReadAll(`SELECT * FROM ${tableName} LIMIT 1`)),
        );
        console.log(`First row of '${tableName}' table:`);
        console.table(result);

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
        const columnCalculations = Object.entries(dataset.fields).map(([targetField,transformation]) => {
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

        // Verify the table was created
        const result = yield* _(
        Effect.tryPromise(() => connection.runAndReadAll(`SELECT * FROM event limit 5`)),
        );
        console.log(`First row of 'event' table:`);
        console.log(result.getRowObjectsJson());

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
        yield* _(createTablesFromCSV(connection, config, basePath));
        yield* _(createTableFromSchema(connection, config));
        yield* _(populateSchemaFromDataTables(connection, config));
      }),
    (connection) => Effect.promise(async () => connection.closeSync()),
  );
}
