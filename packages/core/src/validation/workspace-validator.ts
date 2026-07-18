/**
 * Workspace Validator - Config-based multi-dataset validation
 *
 * Validates multiple datasets within a workspace according to their specifications.
 * Uses field mappings to validate CSV columns against spec field definitions.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { resolve } from "@std/path";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

import type { WorkspaceOperationError } from "@dwkit/domain/errors";
import { WorkspaceImportError, WorkspaceValidationError } from "@dwkit/domain/errors";
import type {
  DatasetConfig,
  DatasetRuleConfig,
  ResolvedStandard,
  ValidationSettings,
} from "@dwkit/domain/schemas";
import {
  getPreset,
  getPresetNames,
  getResolvedSpec,
  getSpecNames,
  inferForeignKeyRules,
} from "@dwkit/domain/specs";
import type {
  DatasetValidationResult,
  SchemaViolation,
  WorkspaceValidationResult,
} from "@dwkit/domain/types";
import {
  calculateSummary,
  determineOverallStatus,
  MissingMappingViolation,
  partitionFieldViolations,
  partitionSchemaViolations,
  requirementToSeverity,
  UnmappedColumnViolation,
} from "@dwkit/domain/types";
import { importCsv, importParquet } from "../loading/table-import.ts";
import { queryRows, sanitizeTableName } from "../loading/sql.ts";
import { scopedConnection } from "../loading/connection.ts";
import { Workspace } from "../workspace/workspace.ts";

import type { ResolvedFieldsEntry } from "./field-resolution.ts";
import { resolveFieldsForDatasets } from "./field-resolution.ts";
import { getColumns, validateTable } from "./table-validator.ts";
import { findSuggestedValue } from "./string-matching.ts";

function deduplicateByTypeAndField<T extends { _tag: string; fieldName: string }>(
  arr: readonly T[],
): T[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = `${item._tag}:${item.fieldName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export class WorkspaceValidator {
  validateDatasets(
    datasets: readonly DatasetConfig[],
    settings: ValidationSettings,
    basePath: string,
    standard: ResolvedStandard,
    workspaceId?: string,
    datasetRules?: readonly DatasetRuleConfig[],
    configPath?: string,
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
    return Effect.scoped(
      Effect.gen(function* () {
        const resolvedWorkspaceId = workspaceId ?? `validation-${Date.now()}`;

        // Resolve constraints once. Shared by both schema creation and validation
        const resolvedFieldsMap = resolveFieldsForDatasets(datasets, standard);

        const { connection, rules } = yield* createWorkspaceFromConfig(
          datasets,
          settings,
          basePath,
          resolvedFieldsMap,
          datasetRules,
        );

        return yield* _validateDatasetsCore(
          connection,
          datasets,
          settings,
          basePath,
          standard,
          resolvedWorkspaceId,
          resolvedFieldsMap,
          rules,
          configPath,
        );
      }),
    );
  }

  /**
   * Validate datasets using a provided DuckDB connection (does not own the connection lifecycle).
   */
  validateDatasetsWithConnection(
    connection: DuckDBConnection,
    datasets: readonly DatasetConfig[],
    settings: ValidationSettings,
    basePath: string,
    standard: ResolvedStandard,
    workspaceId?: string,
    datasetRules?: readonly DatasetRuleConfig[],
    configPath?: string,
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
    return Effect.gen(function* () {
      const resolvedWorkspaceId = workspaceId ?? `validation-${Date.now()}`;

      // Resolve constraints once — shared by both schema creation and validation
      const resolvedFieldsMap = resolveFieldsForDatasets(datasets, standard);

      const rules = yield* importDatasets(
        connection,
        datasets,
        settings.nullValues,
        basePath,
        resolvedFieldsMap,
        datasetRules,
      );

      return yield* _validateDatasetsCore(
        connection,
        datasets,
        settings,
        basePath,
        standard,
        resolvedWorkspaceId,
        resolvedFieldsMap,
        rules,
        configPath,
      );
    });
  }

  validateFromConfig(
    configPath?: string,
    options?: {
      failFast?: boolean;
    },
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
    return Effect.scoped(
      Effect.gen(function* () {
        const workspace = yield* Workspace.open(configPath).pipe(
          Effect.mapError((error) =>
            new WorkspaceValidationError({
              message: `Failed to load workspace config: ${error.message}`,
              cause: error instanceof Error ? error : new Error(String(error)),
            })
          ),
        );

        return yield* workspace.validate(options).pipe(
          Effect.mapError((error) =>
            new WorkspaceValidationError({
              message: error.message,
              cause: error instanceof Error ? error : new Error(String(error)),
            })
          ),
        );
      }),
    );
  }
}

function _validateDatasetsCore(
  connection: DuckDBConnection,
  datasets: readonly DatasetConfig[],
  settings: ValidationSettings,
  basePath: string,
  standard: ResolvedStandard,
  workspaceId: string,
  resolvedFieldsMap: Map<string, ResolvedFieldsEntry>,
  datasetRules?: readonly DatasetRuleConfig[],
  configPath?: string,
): Effect.Effect<WorkspaceValidationResult, WorkspaceOperationError> {
  return Effect.gen(function* () {
    const startTime = Date.now();
    const datasetResults: DatasetValidationResult[] = [];

    for (const dataset of datasets) {
      const preResolved = resolvedFieldsMap.get(dataset.name);

      const result = yield* validateDataset(
        connection,
        dataset,
        standard,
        settings,
        preResolved,
        datasetRules,
        resolvedFieldsMap,
      );

      datasetResults.push(result);

      // Debug-only: deduplicate and log intermediate results for troubleshooting.
      // Not part of the validation output — kept as a diagnostic aid during development.
      if (settings.debug) {
        const earlyResult = {
          ...result,
          schemaViolations: {
            errors: deduplicateByTypeAndField(result.schemaViolations.errors),
            warnings: deduplicateByTypeAndField(result.schemaViolations.warnings),
            info: deduplicateByTypeAndField(result.schemaViolations.info),
          },
          fieldViolations: {
            errors: deduplicateByTypeAndField(result.fieldViolations.errors),
            warnings: deduplicateByTypeAndField(result.fieldViolations.warnings),
            info: deduplicateByTypeAndField(result.fieldViolations.info),
          },
        };
        console.debug(JSON.stringify(earlyResult, null, 4));
      }

      if (settings.failFast && result.status === "fail") {
        break;
      }
    }

    const summary = calculateSummary(datasetResults);
    const totalProcessingTimeMs = Date.now() - startTime;

    const overallStatus = determineOverallStatus(summary);

    return {
      workspaceId,
      configPath: configPath ?? basePath,
      validatedAt: new Date(),
      totalProcessingTimeMs,
      overallStatus,
      datasetResults,
      summary,
    };
  });
}

/**
 * Import each dataset's CSV into a `raw_<name>` table as all-VARCHAR so validators
 * see the original CSV strings (the validation path builds no typed table), then
 * infer the standard Darwin Core foreign keys and return the full rule set
 * (user-declared + inferred) for the validation phase to enforce.
 */
function importDatasets(
  connection: DuckDBConnection,
  datasets: readonly DatasetConfig[],
  nullValues: readonly string[],
  basePath: string,
  resolvedFieldsMap: Map<string, ResolvedFieldsEntry>,
  datasetRules?: readonly DatasetRuleConfig[],
) {
  return Effect.gen(function* () {
    // Import each raw CSV/Parquet table and collect the Darwin Core fields it maps.
    const shapes: { name: string; class: string; columns: string[] }[] = [];
    for (const dataset of datasets) {
      const filePath = resolve(basePath, dataset.path);
      const tableName = `raw_${sanitizeTableName(dataset.name)}`;
      // Parquet is self-typed, so type validity is guaranteed by the format and
      // it loads with native types. CSV loads all-VARCHAR so the validators can
      // check type validity themselves instead of letting read_csv_auto coerce.
      if (filePath.toLowerCase().endsWith(".parquet")) {
        yield* importParquet(connection, tableName, filePath);
      } else {
        yield* importCsv(connection, tableName, filePath, nullValues, { allVarchar: true });
      }

      // FK inference keys on the Darwin Core fields the dataset actually maps
      // (the mapped target names), NOT the raw CSV headers — so a column mapped
      // `event_ref -> eventID` is inferable while an unmapped raw `eventID` is not.
      const entry = resolvedFieldsMap.get(dataset.name);
      const columns = entry ? Object.keys(entry.mapped) : [];
      shapes.push({ name: dataset.name, class: dataset.class, columns });
    }

    // Infer the standard Darwin Core foreign keys; user-declared rules win and
    // resolve ambiguity. An unresolved ambiguity is a user-fixable config error.
    // FK integrity is enforced later by a SQL anti-join over the all-VARCHAR
    // tables (validateForeignKeyRule), so no REFERENCES or table ordering is needed.
    const { rules: inferred, conflicts } = inferForeignKeyRules(
      shapes,
      datasetRules ?? [],
    );
    if (conflicts.length > 0) {
      const c = conflicts[0];
      return yield* Effect.fail(
        new WorkspaceImportError({
          message: `Ambiguous Darwin Core relation: '${c.sourceField}' in dataset ` +
            `'${c.sourceDataset}' could reference ${
              c.candidates.map((n) => `'${n}'`).join(" or ")
            }. Declare an explicit foreignKey rule to disambiguate.`,
        }),
      );
    }

    const allRules: DatasetRuleConfig[] = [
      ...(datasetRules ?? []),
      ...inferred,
    ];
    return allRules;
  });
}

function createWorkspaceFromConfig(
  datasets: readonly DatasetConfig[],
  validationSettings: ValidationSettings,
  basePath: string,
  resolvedFieldsMap: Map<string, ResolvedFieldsEntry>,
  datasetRules?: readonly DatasetRuleConfig[],
): Effect.Effect<
  { connection: DuckDBConnection; rules: readonly DatasetRuleConfig[] },
  WorkspaceOperationError,
  Scope.Scope
> {
  return Effect.gen(function* () {
    // Each workspace gets its own scope-managed in-memory database, preventing
    // test contamination where tables from one run persist into another.
    const connection = yield* scopedConnection;

    const rules = yield* importDatasets(
      connection,
      datasets,
      validationSettings.nullValues,
      basePath,
      resolvedFieldsMap,
      datasetRules,
    );

    return { connection, rules };
  });
}

function validateDataset(
  connection: DuckDBConnection,
  dataset: DatasetConfig,
  standard: ResolvedStandard,
  validationSettings?: ValidationSettings,
  preResolved?: ResolvedFieldsEntry,
  datasetRules?: readonly DatasetRuleConfig[],
  resolvedFieldsMap?: Map<string, ResolvedFieldsEntry>,
): Effect.Effect<DatasetValidationResult, WorkspaceValidationError> {
  return Effect.gen(function* () {
    const startTime = Date.now();
    const tableName = `raw_${sanitizeTableName(dataset.name)}`;

    const countRows = yield* queryRows(connection, `SELECT COUNT(*) as count FROM ${tableName}`);
    // queryRows uses the JSON reader: COUNT(*) (BIGINT) comes back as a string.
    const rowsProcessed = Number(countRows[0].count);

    // Exclude _row_number; it's only used internally
    const originTableColumns = (yield* getColumns(connection, tableName))
      .filter((col) => col !== "_row_number");

    // Guard: the dataset's class must resolve to a known base spec.
    const baseProfile = getResolvedSpec(dataset.class);
    if (baseProfile === undefined) {
      const suggestion = findSuggestedValue(dataset.class, getSpecNames());
      const suggestionMsg = suggestion ? ` Did you mean '${suggestion}'?` : "";
      return yield* Effect.fail(
        new WorkspaceValidationError({
          message: `'${dataset.class}' is not a valid class.${suggestionMsg}`,
        }),
      );
    }

    const configFieldMappings = dataset?.fieldMappings || [];
    const schemaColumnsObj = preResolved?.all ?? {};

    const mappedOriginFields = configFieldMappings.map((m) => m.originName);
    const missingSourceFields = mappedOriginFields.filter(
      (f) => !originTableColumns.includes(f),
    ).map((f) => ({
      fieldName: f,
      alternatives: findSuggestedValue(f, originTableColumns) || "",
    }));

    const allFieldMappings = Object.values(schemaColumnsObj).map((m) => m.originName);

    const unmappedSourceColumns = originTableColumns.filter(
      (f) => !allFieldMappings.includes(f),
    ).map((f) => ({
      fieldName: f,
      alternatives: findSuggestedValue(f, mappedOriginFields) || "",
    }));

    const schemaViolations: SchemaViolation[] = [];

    for (const mapping of configFieldMappings) {
      if (
        mapping.preset && getPreset(mapping.preset) === undefined &&
        originTableColumns.includes(mapping.originName)
      ) {
        const suggestion = findSuggestedValue(mapping.preset, getPresetNames());
        const suggestionMsg = suggestion ? ` Did you mean "${suggestion}"?` : "";
        schemaViolations.push(
          new MissingMappingViolation({
            severity: requirementToSeverity("required"),
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            errorMessage:
              `Unknown preset "${mapping.preset}" for field '${mapping.targetName}'.${suggestionMsg}`,

            datasetName: dataset.name,
          }),
        );
      }
    }

    for (const missingSourceField of missingSourceFields) {
      const mapping = (dataset.fieldMappings || []).find((m) =>
        m.originName === missingSourceField.fieldName
      );
      const altMsg = missingSourceField.alternatives
        ? `Possible alternative fields: ${missingSourceField.alternatives}`
        : "";
      schemaViolations.push(
        new MissingMappingViolation({
          severity: requirementToSeverity("required"),
          fieldName: missingSourceField.fieldName,
          targetName: mapping?.targetName ?? missingSourceField.fieldName,
          errorMessage:
            `Field '${missingSourceField.fieldName}' is specified in config but not found in CSV.${
              altMsg ? ` ${altMsg}` : ""
            }`,
          datasetName: dataset.name,
        }),
      );
    }

    for (const unmappedSourceColumn of unmappedSourceColumns) {
      const altMsg = unmappedSourceColumn.alternatives
        ? `Possible alternative columns: ${unmappedSourceColumn.alternatives}`
        : "";
      schemaViolations.push(
        new UnmappedColumnViolation({
          severity: requirementToSeverity("optional"),
          fieldName: unmappedSourceColumn.fieldName,
          targetName: unmappedSourceColumn.fieldName,
          errorMessage:
            `Source column '${unmappedSourceColumn.fieldName}' is not mapped to any Darwin Core field and will be ignored.` +
            (altMsg ? ` ${altMsg}` : ""),
          datasetName: dataset.name,
        }),
      );
    }

    // `preResolved` is guaranteed defined here: a class that resolves to a base
    // spec (the guard above) always has a corresponding resolved-fields entry.
    const core = yield* validateTable(connection, {
      tableName,
      entry: preResolved!,
      standard,
      datasetName: dataset.name,
      settings: validationSettings,
      configRequiredFields: new Set(configFieldMappings.map((m) => m.targetName)),
      datasetRules,
      resolvedFieldsMap,
      physicalTableFor: (name) => `raw_${sanitizeTableName(name)}`,
    });
    const allFieldViolations = core.fieldViolations;
    schemaViolations.push(...core.schemaViolations);

    const processingTimeMs = Date.now() - startTime;

    const partitionedSchemaViolations = partitionSchemaViolations(schemaViolations);
    const partitionedFieldViolations = partitionFieldViolations(allFieldViolations);

    const hasErrors = partitionedSchemaViolations.errors.length > 0 ||
      partitionedFieldViolations.errors.length > 0;

    const hasWarnings = partitionedSchemaViolations.warnings.length > 0 ||
      partitionedFieldViolations.warnings.length > 0;

    let status: "fail" | "warn" | "pass";
    if (hasErrors) {
      status = "fail";
    } else if (hasWarnings) {
      status = "warn";
    } else {
      status = "pass";
    }

    return {
      datasetName: dataset.name,
      class: dataset.class,
      filePath: dataset.path ?? "",
      rowsProcessed,
      processingTimeMs,
      status,

      schemaViolations: partitionedSchemaViolations,
      fieldViolations: partitionedFieldViolations,
    };
  });
}
