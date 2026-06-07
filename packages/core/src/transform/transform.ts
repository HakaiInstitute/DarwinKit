import * as duckdb from "@duckdb/node-api";
import { stringify as stringifyCSV } from "@std/csv";
import { join, resolve } from "@std/path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import { Workspace } from "../workspace/mod.ts";
import type { WorkspaceConfig } from "@dwkt/domain/schemas";
import { hasTransformationConfig } from "@dwkt/domain/schemas";
import { getSpecNames, resolveProfile } from "@dwkt/domain/specs";
import { findSuggestedValue } from "../validation/string-matching.ts";
import type { WorkspaceConfigError } from "@dwkt/domain/errors";
import { WorkspaceImportError } from "@dwkt/domain/errors";
import { importCsv } from "../loading/csv-import.ts";
import { importSchema } from "../loading/schema.ts";
import { findForeignKeyRule, formatConstraintViolation, parseDuckDBError } from "../loading/sql.ts";

export class TransformationError extends Data.TaggedError("TransformationError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class OutputError extends Data.TaggedError("OutputError")<{
  readonly message: string;
  readonly outputPath: string;
  readonly cause?: Error;
}> {}

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
  return Effect.gen(function* () {
    if (!hasTransformationConfig(config)) {
      return;
    }

    if (!config.transform.inputs) {
      return;
    }

    for (const [tableName, csvPath] of Object.entries(config.transform.inputs)) {
      if (typeof csvPath !== "string") continue;

      const fullPath = resolve(basePath, csvPath);

      yield* importCsv(connection, tableName, fullPath, config.transform.nullValues).pipe(
        Effect.mapError((e) => new WorkspaceImportError({ message: e.message, cause: e.cause })),
      );
    }
  });
}

function runPostImportTransformations(
  config: WorkspaceConfig,
  connection: duckdb.DuckDBConnection,
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* () {
    if (!hasTransformationConfig(config)) {
      return;
    }
    if (!config.transform.postImportTransforms) {
      return;
    }
    for (const transformSQL of config.transform.postImportTransforms) {
      yield* Effect.tryPromise({
        try: () => connection.run(transformSQL),
        catch: (error) =>
          new TransformationError({
            message: `Failed to execute post-import transform SQL`,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      });
    }
  });
}

export function createTableFromSchema(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* () {
    if (!hasTransformationConfig(config)) {
      return;
    }

    const standard = config.standard ?? { base: "darwin-core", variant: "obis" };
    for (const dataset of config.transform.datasets) {
      const spec = resolveProfile(standard.variant, dataset.class);
      if (!spec) continue;
      yield* importSchema(
        connection,
        dataset,
        config.transform.datasets,
        standard,
        spec,
        config.datasetRules,
      );
    }
  });
}

export function populateSchemaFromDataTables( // Export for testing
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
): Effect.Effect<void, TransformationError> {
  return Effect.gen(function* () {
    if (!hasTransformationConfig(config)) {
      return;
    }

    for (const dataset of config.transform.datasets) {
      if (!dataset.fields) {
        return yield* Effect.fail(
          new TransformationError({
            message: `No field definitions found in '${dataset?.name}'`,
          }),
        );
      }

      const columnCalculations = Object.entries(dataset.fields)
        .map(([targetField, transformation]): string => `${transformation} AS "${targetField}"`);

      const transformProfile = resolveProfile(config.standard?.variant, dataset.class);
      if (!transformProfile) {
        const suggestion = findSuggestedValue(dataset.class, getSpecNames());
        const suggestionMsg = suggestion ? ` Did you mean '${suggestion}'?` : "";
        return yield* Effect.fail(
          new TransformationError({
            message: `'${dataset.class}' is not a valid class.${suggestionMsg}`,
          }),
        );
      }

      const targetColumnNames = Object.keys(dataset.fields).map((
        fieldName: string,
      ): string => `"${fieldName}"`);
      const tableName = transformProfile.name.toLowerCase();
      const tableSources = Object.entries(dataset.source || {}).map(
        ([tableName, joinSQL]) => {
          const isSimpleTable = !joinSQL.trim().includes(" ");
          return isSimpleTable ? `${joinSQL} AS ${tableName}` : `(${joinSQL}) AS ${tableName}`;
        },
      ).join(", ");

      const insertSQL = `INSERT INTO ${tableName} (${targetColumnNames.join(", ")}) SELECT ${
        columnCalculations.join(", ")
      } FROM ${tableSources};`;

      yield* Effect.tryPromise({
        try: () => connection.run(insertSQL),
        catch: (error) => {
          const err = error instanceof Error ? error : new Error(String(error));
          const parsed = parseDuckDBError(err);
          const fkRule = parsed.fieldName
            ? findForeignKeyRule(dataset.name, parsed.fieldName, config.datasetRules)
            : undefined;
          const message = formatConstraintViolation({
            type: parsed.type,
            fieldName: parsed.fieldName ?? "unknown",
            value: parsed.value ?? "unknown",
            message: parsed.message,
            datasetName: dataset.name,
            fkRule,
            referencedTable: parsed.referencedTable,
            referencedField: parsed.referencedField,
          });
          return new TransformationError({ message, cause: err });
        },
      });
    }
  });
}

export function exportTablesToCSV(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
): Effect.Effect<void, OutputError> {
  return Effect.gen(function* () {
    const transformSettings = hasTransformationConfig(config) ? config.transform : null;

    if (!transformSettings) {
      return yield* Effect.fail(
        new OutputError({
          message: "No transformation settings provided",
          outputPath: "",
        }),
      );
    }

    const datasets = transformSettings.datasets;

    if (!datasets || datasets.length === 0) {
      return;
    }

    const output = transformSettings.output;
    const outputFilesWithTimestamp = output.outputFilesWithTimestamp ?? true;

    const withTimestamp = outputFilesWithTimestamp ?? true;
    const tables = [
      ...new Set(datasets.map((ds) => ds.class.toLowerCase())),
    ];
    const outputPath = output.outputDir;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    yield* Effect.try({
      try: () => Deno.mkdirSync(outputPath, { recursive: true }),
      catch: (e) => e,
    }).pipe(
      Effect.mapError((error) =>
        new OutputError({
          message: `Failed to create output directory: ${
            error instanceof Error ? error.message : String(error)
          }`,
          outputPath: outputPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        })
      ),
    );

    for (const tableName of tables) {
      const columnNamesResult = yield* Effect.tryPromise({
        try: () => connection.runAndReadAll(`PRAGMA table_info(${tableName});`),
        catch: (error) =>
          new OutputError({
            message: `Failed to read table schema for ${tableName}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            outputPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      });
      const allColumnNames: string[] = columnNamesResult.getRowObjectsJson().map((row) =>
        String(row.name)
      );

      let columnsToExport: string[] = allColumnNames;
      const selectColumns: string[] = [];

      if (output.dropNullColumns) {
        const nonNullColumns: string[] = [];
        for (const columnName of allColumnNames) {
          const nullCountResult = yield* Effect.tryPromise({
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
          });
          const notNullCount = Number(nullCountResult.getRowObjectsJson()[0].null_count ?? 0);
          if (notNullCount > 0) {
            nonNullColumns.push(columnName);
            selectColumns.push(`"${columnName}"`);
          }
        }
        columnsToExport = nonNullColumns;
      } else {
        selectColumns.push("*");
      }

      const result = yield* Effect.tryPromise({
        try: () => connection.runAndReadAll(`SELECT ${selectColumns.join(",")} FROM ${tableName}`),
        catch: (error) =>
          new OutputError({
            message: `Failed to select data from ${tableName}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            outputPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      });
      const filename = withTimestamp ? `${tableName}-${timestamp}.csv` : `${tableName}.csv`;
      const fullPath: string = join(outputPath, filename);

      yield* Effect.tryPromise({
        try: () =>
          Deno.writeTextFile(
            fullPath,
            stringifyCSV(result.getRowObjectsJson(), { columns: columnsToExport }),
          ),
        catch: (error) =>
          new OutputError({
            message: `Failed to write results file: ${
              error instanceof Error ? error.message : String(error)
            }`,
            outputPath: fullPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      });
    }
  });
}

export function exportToPersistentDB(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
): Effect.Effect<void, OutputError> {
  if (!hasTransformationConfig(config)) {
    return Effect.succeed(void 0);
  }

  const withTimestamp = config.transform.output.outputFilesWithTimestamp ??
    true;
  const outputPath = config.transform.output.outputDir;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dbAttachAlias = "export_db";
  const dbFileName = config.transform.output.exportDBFileName || config.id || "darwinkit";
  const filename = withTimestamp ? `${dbFileName}-${timestamp}.duckdb` : `${dbFileName}.duckdb`;
  const fullPath = join(outputPath, filename);

  return Effect.gen(function* () {
    if (!config.transform.output.exportDB) {
      return;
    }

    yield* Effect.try({
      try: () => Deno.mkdirSync(outputPath, { recursive: true }),
      catch: (e) => e,
    }).pipe(
      Effect.mapError((error) =>
        new OutputError({
          message: `Failed to create output directory: ${error}`,
          outputPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        })
      ),
    );

    const fileExists = yield* Effect.tryPromise({
      try: () => Deno.stat(fullPath).then(() => true).catch(() => false),
      catch: (error) =>
        new OutputError({
          message: `Failed get statistics for DB at ${fullPath}: ${error}`,
          outputPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });

    if (fileExists) {
      yield* Effect.tryPromise({
        try: () => Deno.remove(fullPath),
        catch: (error) =>
          new OutputError({
            message: `Failed to delete existing output file: ${error}`,
            outputPath: fullPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      });
    }

    // Can't use COPY TO DATABASE — it violates constraints when tables are copied out of order
    for (const dataset of config.transform.datasets) {
      const transformProfile = resolveProfile(config.standard?.variant, dataset.class);
      if (!transformProfile) {
        const suggestion = findSuggestedValue(dataset.class, getSpecNames());
        const suggestionMsg = suggestion ? ` Did you mean '${suggestion}'?` : "";
        console.warn(
          `'${dataset.class}' is not a valid class.${suggestionMsg} Skipping table export.`,
        );
        continue;
      }
      const tableName = transformProfile.name.toLowerCase();
      yield* Effect.tryPromise({
        // try: () => connection.run(`ATTACH '${fullPath}'; COPY FROM DATABASE memory TO ${dbName}; DETACH ${dbName};`),
        try: () =>
          connection.run(`
            ATTACH '${fullPath}' as ${dbAttachAlias};
            CREATE TABLE IF NOT EXISTS ${dbAttachAlias}.${tableName} AS FROM memory.${tableName};
            DETACH ${dbAttachAlias};
          `),
        catch: (error) =>
          new OutputError({
            message: `Failed export DB to ${fullPath}: ${error}`,
            outputPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      });
    }
  });
}

export function transformFile(
  configPath?: string,
): Effect.Effect<
  void,
  | TransformationError
  | OutputError
  | WorkspaceImportError
  | WorkspaceConfigError,
  never
> {
  return Effect.gen(function* () {
    const { config, basePath } = yield* Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* Workspace.open(configPath);
        return {
          config: workspace.config,
          basePath: workspace.basePath,
        };
      }),
    );

    yield* Effect.acquireUseRelease(
      Effect.tryPromise(() => duckdb.DuckDBConnection.create()).pipe(
        Effect.orDie,
      ),
      (connection) =>
        Effect.gen(function* () {
          console.log("Creating tables from CSV files...");
          yield* createTablesFromCSV(connection, config, basePath);
          yield* runPostImportTransformations(config, connection);

          console.log("Creating schema tables...");
          yield* createTableFromSchema(connection, config);

          console.log("Populating schema tables from data tables...");
          yield* populateSchemaFromDataTables(connection, config);

          console.log("Exporting tables to CSV...");
          yield* exportTablesToCSV(connection, config);

          console.log("Exporting DuckDB database to persistent file...");
          yield* exportToPersistentDB(connection, config);
        }),
      (connection) =>
        Effect.try({ try: () => connection.closeSync(), catch: (e) => e }).pipe(Effect.ignore),
    );
  });
}
