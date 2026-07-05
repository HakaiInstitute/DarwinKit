import type * as duckdb from "@duckdb/node-api";
import { scopedConnection } from "../loading/connection.ts";
import { join, resolve } from "@std/path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import { Workspace } from "../workspace/workspace.ts";
import type { WorkspaceConfig } from "@dwkit/domain/schemas";
import { hasTransformationConfig } from "@dwkit/domain/schemas";
import { getSpecNames, resolveProfile } from "@dwkit/domain/specs";
import { findSuggestedValue } from "../validation/string-matching.ts";
import type { WorkspaceConfigError } from "@dwkit/domain/errors";
import type { WorkspaceImportError } from "@dwkit/domain/errors";
import { importCsv } from "../loading/table-import.ts";
import { importSchema } from "../loading/schema.ts";
import {
  findForeignKeyRule,
  formatConstraintViolation,
  parseDuckDBError,
  queryRows,
} from "../loading/sql.ts";

export class TransformationError extends Data.TaggedError("TransformationError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class OutputError extends Data.TaggedError("OutputError")<{
  readonly message: string;
  readonly outputPath: string;
  readonly cause?: Error;
}> {}

function createTablesFromCSV(
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

      yield* importCsv(connection, tableName, fullPath, config.transform.nullValues);
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

export function populateSchemaFromDataTables(
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
            message: `No field definitions found in '${dataset.name}'`,
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
    const withTimestamp = output.outputFilesWithTimestamp ?? true;
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
      const allColumnNames = (yield* queryRows(
        connection,
        `PRAGMA table_info(${tableName});`,
      )).map((row) => String(row.name));

      let selectColumns: string;

      if (output.dropNullColumns) {
        // One query for all columns: COUNT("col") ignores NULLs, so a count of 0
        // means the column is entirely null and should be dropped.
        const countSelect = allColumnNames
          .map((name) => `COUNT("${name}") AS "${name}"`)
          .join(", ");
        const counts = (yield* queryRows(
          connection,
          `SELECT ${countSelect} FROM ${tableName}`,
        ))[0];
        const keptColumns = allColumnNames.filter((name) => Number(counts[name] ?? 0) > 0);
        selectColumns = keptColumns.map((name) => `"${name}"`).join(", ");
      } else {
        selectColumns = "*";
      }

      const filename = withTimestamp ? `${tableName}-${timestamp}.csv` : `${tableName}.csv`;
      const fullPath: string = join(outputPath, filename);

      // DuckDB writes the CSV directly — no JS-side materialization or stringifier.
      // The output path is bound (handles quotes/special chars), matching the
      // read paths in table-import.ts.
      yield* Effect.tryPromise({
        try: () =>
          connection.run(
            `COPY (SELECT ${selectColumns} FROM ${tableName}) TO ? (FORMAT CSV, HEADER)`,
            [fullPath],
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

    yield* Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* scopedConnection;

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
    );
  });
}
