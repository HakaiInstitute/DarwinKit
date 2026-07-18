import type * as duckdb from "@duckdb/node-api";
import { scopedConnection } from "../loading/connection.ts";
import { join, resolve } from "@std/path";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import { Workspace } from "../workspace/workspace.ts";
import type { DatasetRuleConfig, WorkspaceConfig } from "@dwkit/domain/schemas";
import { hasTransformationConfig } from "@dwkit/domain/schemas";
import { getSpecNames, inferForeignKeyRules, resolveProfile } from "@dwkit/domain/specs";
import {
  calculateSummary,
  determineOverallStatus,
  partitionFieldViolations,
  partitionSchemaViolations,
} from "@dwkit/domain/types";
import type { DatasetValidationResult, WorkspaceValidationResult } from "@dwkit/domain/types";
import { findSuggestedValue } from "../validation/string-matching.ts";
import type { WorkspaceConfigError } from "@dwkit/domain/errors";
import type { WorkspaceImportError } from "@dwkit/domain/errors";
import { importCsv } from "../loading/table-import.ts";
import { createOutputTable } from "../loading/schema.ts";
import { queryRows } from "../loading/sql.ts";
import { validateTable } from "../validation/table-validator.ts";
import type { ResolvedFieldsEntry } from "../validation/field-resolution.ts";
import { resolveTransformFields } from "../validation/field-resolution.ts";

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
      yield* createOutputTable(connection, spec, Object.keys(dataset.fields ?? {}));
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
      columnCalculations.push(`row_number() OVER () AS "_row_number"`);

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
      targetColumnNames.push(`"_row_number"`);
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
          return new TransformationError({
            message: `Failed to populate '${dataset.name}': ${err.message}`,
            cause: err,
          });
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
      )).map((row) => String(row.name)).filter((name) => name !== "_row_number");

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
        selectColumns = allColumnNames.map((name) => `"${name}"`).join(", ");
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

    // One attach for the whole export; no per-table constraint ordering to respect.
    yield* Effect.tryPromise({
      try: () => connection.run(`ATTACH '${fullPath}' AS ${dbAttachAlias}`),
      catch: (error) =>
        new OutputError({
          message: `Failed to attach export DB at ${fullPath}: ${error}`,
          outputPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });

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
      const rawFields = transformProfile.rawFields ?? {};

      const cols = (yield* queryRows(connection, `PRAGMA table_info(${tableName});`))
        .map((row) => String(row.name))
        .filter((name) => name !== "_row_number");

      const projection = cols.map((name) => {
        const type = rawFields[name]?.type;
        const duckType = type === "integer" ? "INTEGER" : type === "decimal" ? "DOUBLE" : "TEXT";
        // TRY_CAST (not CAST): export runs only after the validation gate, so any
        // value reaching here is at most a warning/info issue (errors block export).
        // A surviving bad numeric becomes NULL rather than throwing — keeping export
        // consistent with detection-not-enforcement instead of aborting on bad data.
        return `TRY_CAST("${name}" AS ${duckType}) AS "${name}"`;
      }).join(", ");

      yield* Effect.tryPromise({
        try: () =>
          connection.run(
            `CREATE TABLE IF NOT EXISTS ${dbAttachAlias}.${tableName} AS SELECT ${projection} FROM memory.${tableName}`,
          ),
        catch: (error) =>
          new OutputError({
            message: `Failed export table '${tableName}' to ${fullPath}: ${error}`,
            outputPath,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      });
    }

    yield* Effect.tryPromise({
      try: () => connection.run(`DETACH ${dbAttachAlias}`),
      catch: (error) =>
        new OutputError({
          message: `Failed to detach export DB: ${error}`,
          outputPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });
  });
}

/**
 * Validate every populated transform output table using the shared per-table
 * detection core (`validateTable`), then assemble a `WorkspaceValidationResult`.
 *
 * Mirrors the validation path: builds an identity `ResolvedFieldsEntry` per
 * dataset, infers the standard Darwin Core foreign keys (user rules win and
 * resolve ambiguity), and validates each output table against its spec. No CSV
 * is read here — the output tables are already all-VARCHAR with `_row_number`.
 * Data problems become violations in the result; only user-fixable config
 * problems (invalid class, ambiguous relation) fail the effect.
 */
function validateTransformOutputs(
  connection: duckdb.DuckDBConnection,
  config: WorkspaceConfig,
  startTime: number,
): Effect.Effect<WorkspaceValidationResult, TransformationError> {
  return Effect.gen(function* () {
    if (!hasTransformationConfig(config)) {
      // No transform config -> nothing to validate; return an empty pass result.
      const summary = calculateSummary([]);
      return {
        workspaceId: config.id,
        configPath: config.id,
        validatedAt: new Date(),
        totalProcessingTimeMs: Date.now() - startTime,
        overallStatus: determineOverallStatus(summary),
        datasetResults: [],
        summary,
      };
    }

    const standard = config.standard ?? { base: "darwin-core", variant: "obis" };
    const datasets = config.transform.datasets;

    // 1. Identity entries + FK shapes, one per dataset.
    const entries = new Map<string, ResolvedFieldsEntry>();
    const shapes: { name: string; class: string; columns: string[] }[] = [];
    for (const dataset of datasets) {
      const fieldNames = Object.keys(dataset.fields ?? {});
      const entry = resolveTransformFields(dataset.class, fieldNames, standard);
      if (!entry) {
        const suggestion = findSuggestedValue(dataset.class, getSpecNames());
        const suggestionMsg = suggestion ? ` Did you mean '${suggestion}'?` : "";
        return yield* Effect.fail(
          new TransformationError({
            message: `'${dataset.class}' is not a valid class.${suggestionMsg}`,
          }),
        );
      }
      entries.set(dataset.name, entry);
      shapes.push({ name: dataset.name, class: dataset.class, columns: fieldNames });
    }

    // 2. Infer standard Darwin Core foreign keys; user rules win + resolve ambiguity.
    const { rules: inferred, conflicts } = inferForeignKeyRules(shapes, config.datasetRules ?? []);
    if (conflicts.length > 0) {
      const c = conflicts[0];
      return yield* Effect.fail(
        new TransformationError({
          message: `Ambiguous Darwin Core relation: '${c.sourceField}' in dataset ` +
            `'${c.sourceDataset}' could reference ${
              c.candidates.map((n) => `'${n}'`).join(" or ")
            }. Declare an explicit foreignKey rule to disambiguate.`,
        }),
      );
    }
    const allRules: DatasetRuleConfig[] = [...(config.datasetRules ?? []), ...inferred];

    // Map a dataset name to its physical output table (spec name, lowercased) —
    // the same name populateSchemaFromDataTables inserts into.
    const physicalTableFor = (name: string): string | undefined => {
      const ds = datasets.find((d) => d.name === name);
      const p = ds ? resolveProfile(standard.variant, ds.class) : undefined;
      return p ? p.name.toLowerCase() : undefined;
    };

    // 3. Validate each output table.
    const results: DatasetValidationResult[] = [];
    for (const dataset of datasets) {
      const dsStart = Date.now();
      // physicalTableFor is defined for every dataset (its class resolved above).
      const tableName = physicalTableFor(dataset.name)!;

      const countRows = yield* queryRows(
        connection,
        `SELECT COUNT(*) as count FROM ${tableName}`,
      );
      const rowsProcessed = Number(countRows[0].count);

      const core = yield* validateTable(connection, {
        tableName,
        entry: entries.get(dataset.name)!,
        standard,
        datasetName: dataset.name,
        settings: undefined, // validateTable defaults: suggestions on, no max cap
        configRequiredFields: new Set<string>(), // transform has no config fieldMappings
        datasetRules: allRules,
        resolvedFieldsMap: entries,
        physicalTableFor,
      }).pipe(
        Effect.mapError((e) =>
          new TransformationError({
            message: e.message,
            cause: e instanceof Error ? e : undefined,
          })
        ),
      );

      const schema = partitionSchemaViolations(core.schemaViolations);
      const field = partitionFieldViolations(core.fieldViolations);
      const hasErrors = schema.errors.length > 0 || field.errors.length > 0;
      const hasWarnings = schema.warnings.length > 0 || field.warnings.length > 0;
      const status = hasErrors ? "fail" : hasWarnings ? "warn" : "pass";

      results.push({
        datasetName: dataset.name,
        class: dataset.class,
        filePath: "",
        rowsProcessed,
        processingTimeMs: Date.now() - dsStart,
        status,
        schemaViolations: schema,
        fieldViolations: field,
      });
    }

    const summary = calculateSummary(results);
    return {
      workspaceId: config.id,
      configPath: config.id,
      validatedAt: new Date(),
      totalProcessingTimeMs: Date.now() - startTime,
      overallStatus: determineOverallStatus(summary),
      datasetResults: results,
      summary,
    };
  });
}

export function transformFile(
  configPath?: string,
): Effect.Effect<
  WorkspaceValidationResult,
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

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* scopedConnection;
        const startTime = Date.now();

        console.log("Creating tables from CSV files...");
        yield* createTablesFromCSV(connection, config, basePath);
        yield* runPostImportTransformations(config, connection);

        console.log("Creating schema tables...");
        yield* createTableFromSchema(connection, config);

        console.log("Populating schema tables from data tables...");
        yield* populateSchemaFromDataTables(connection, config);

        console.log("Validating transformed output...");
        const validation = yield* validateTransformOutputs(connection, config, startTime);

        if (validation.overallStatus === "fail") {
          // Errors block export; the caller renders the violations.
          return validation;
        }

        console.log("Exporting tables to CSV...");
        yield* exportTablesToCSV(connection, config);

        console.log("Exporting DuckDB database to persistent file...");
        yield* exportToPersistentDB(connection, config);

        return validation;
      }),
    );
  });
}
