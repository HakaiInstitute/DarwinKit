import * as duckdb from "@duckdb/node-api";
import { dirname, join, resolve } from "@std/path";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";

import { WorkspaceConfigService } from "../workspace/workspace-config-service.ts";
import type { WorkspaceConfig } from "@dwkt/domain";
import { getValidationProfile } from "@dwkt/domain";
import { json2csv } from "json-2-csv";
import type {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
} from "@dwkt/core";

/**
 * Represents an error that occurs during the data transformation process.
 */
export class TransformationError extends Data.TaggedError("TransformationError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

/**
 * Represents an error that occurs during the output process.
 */
export class OutputError extends Data.TaggedError("OutputError")<{
  readonly message: string;
  readonly outputPath: string;
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
): Effect.Effect<void, TransformationError> {
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

      yield* _(Effect.tryPromise({
        try: () =>
          // Create a table from the CSV file, using the specified null values.
          connection.run(
            `CREATE TABLE IF NOT EXISTS ${tableName} AS SELECT * FROM read_csv_auto('${fullPath}', nullstr=[${nullStr}])`,
          ),
        catch: (error) => {
          console.error(error);
          return new TransformationError({
            message: `Failed to create table '${tableName}' from CSV`,
            cause: error instanceof Error ? error : new Error(String(error)),
          });
        },
      }));
    }

    // Execute any post-import SQL transformations defined in the configuration.
    for (const transformSQL of config.transform.postImportTransforms) {
      yield* _(Effect.tryPromise({
        try: () => connection.run(transformSQL),
        catch: (error) => {
          console.error(error);
          return new TransformationError({
            message: `Failed to execute post-import transform SQL`,
            cause: error instanceof Error ? error : new Error(String(error)),
          });
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
export function createTableFromSchema(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* (_) {
    // Type guard - ensure config has transform settings
    if (!("transform" in config)) {
      return;
    }

    for (const dataset of config.transform.datasets) {
      // Load validation profile if specified
      const transformProfile = getValidationProfile(dataset.profile);
      if (!transformProfile) {
        console.warn(
          `No validation profile found for ${dataset.profile}, skipping table creation.`,
        );
        continue;
      }
      const tableName = transformProfile.name.toLowerCase();

      // 1. Create ENUM types for controlled vocabularies
      const enums = Object.entries(transformProfile.fields || {}).map(
        ([fieldName, field]) => {
          // Check if this is a controlled vocabulary field
          // Profile fields use `type === "controlled-vocabulary"` and may have `values`
          if (field.type === "controlled-vocabulary" && field.values) {
            const enumName = `${tableName}_${fieldName.toLowerCase()}_enum`;
            const enumValues = Object.keys(field.values).map((v: string) => `'${v}'`).join(", ");
            return `CREATE TYPE IF NOT EXISTS ${enumName} AS ENUM (${enumValues});`;
          }
          return null;
        },
      );

      // 2. Generate Column Definition SQL
      const columns = Object.keys(transformProfile.fields || {}).map((fieldName) => {
        const field = transformProfile.fields![fieldName];
        const fieldType = (field.type?.toUpperCase() || "TEXT")
          .replace("IDENTIFIER", "TEXT")
          .replace("CONTROLLED-VOCABULARY", `${tableName}_${fieldName.toLowerCase()}_enum`)
          .replace("URI", "TEXT");
        let fieldStr = `"${fieldName}" ${fieldType}`;
        // Check if this field is the primary identifier for this table
        // Profile fields use simple name matching (e.g., occurrenceID for Occurrence table)
        // or check if field is marked as unique identifier
        const isUniqueIdentifier = field.unique === "true";

        if (fieldName === tableName + "ID" || (fieldName.endsWith("ID") && isUniqueIdentifier)) {
          fieldStr += " PRIMARY KEY";
        } else if (
          transformProfile.fieldOverrides?.[fieldName]?.requirement === "required"
        ) {
          // Only apply NOT NULL if this specific profile marks the field as required
          fieldStr += " NOT NULL";
        }
        // add foreign key constraints for fields
        // Skip FK for this table's PK, but include it for other ID fields
        const isPrimaryKey = fieldName === tableName + "ID" ||
          (fieldName.endsWith("ID") && isUniqueIdentifier);
        if (fieldName.endsWith("ID") && !isPrimaryKey) {
          const referencedTable = fieldName.slice(0, -2).toLowerCase();
          // check if referenced table exists in config
          if (
            config.transform.datasets.find((ds) =>
              getValidationProfile(ds.profile)?.name.toLowerCase() === referencedTable
            )
          ) {
            fieldStr += ` REFERENCES ${referencedTable}(${fieldName})`;
          }
        }
        return fieldStr;
      });

      // 3. Create ENUM Types
      const enumSql = enums.filter((e) => e !== null).join("\n");
      if (enumSql) {
        yield* _(Effect.tryPromise({
          try: () => connection.run(enumSql),
          catch: (error) =>
            new TransformationError({
              message: `Failed to create ENUM types for table '${tableName}'`,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }));
      }

      // 4. Create Tables
      const tableSql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns.join(", ")})`;
      yield* _(Effect.tryPromise({
        try: () => connection.run(tableSql),
        catch: (error) => {
          console.error(`Failing SQL: ${tableSql}`);
          return new TransformationError({
            message: `Failed to create table '${tableName}'`,
            cause: error instanceof Error ? error : new Error(String(error)),
          });
        },
      }));
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
        console.error(`Error: No field definitions found in ${dataset?.name}`);
        console.debug(`dataset:\n{JSON.stringify(dataset, null, 2)}`);
        return yield* _(Effect.fail(
          new TransformationError({
            message: `No field definitions found in '${dataset?.name}'`,
            cause: new Error(String("field property missing from dataset definition")),
          }),
        ));
      }
      const targetColumnNames = Object.keys(dataset.fields).map((fieldName: string): string =>
        `"${fieldName}"`
      );
      // Create column calculations based on the transformations defined in the dataset fields
      const columnCalculations = Object.entries(dataset.fields)
        .map(([targetField, transformation]): string => `${transformation} AS "${targetField}"`);

      const transformProfile = getValidationProfile(dataset.profile);
      if (!transformProfile) {
        console.warn(`No validation profile found for ${dataset.profile}`);
        return yield* _(Effect.fail(
          new TransformationError({
            message: `Validation profile ${dataset.profile} not found for '${dataset?.name}'`,
            cause: new Error(
              String(`Validation profile ${dataset.profile} not found for '${dataset?.name}'`),
            ),
          }),
        ));
      }
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
        catch: (error) => {
          console.error(error);
          console.log(insertSQL);
          return new TransformationError({
            message: `Failed to populate table '${tableName}' from dataset '${dataset.name}'`,
            cause: error instanceof Error ? error : new Error(String(error)),
          });
        },
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
          message: `Failed export DB to ${fullPath}: ${error}`,
          outputPath,
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
        const { config, configPath: resolvedConfigPath } = yield* _(
          WorkspaceConfigService.discoverAndLoad(configPath),
        );
        const basePath = dirname(resolvedConfigPath);

        console.log("Creating tables from CSV files...");
        yield* _(createTablesFromCSV(connection, config, basePath));

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
