/**
 * Workspace Validator - Config-based multi-dataset validation
 *
 * Validates multiple datasets within a workspace according to their specifications.
 * Uses field mappings to validate CSV columns against spec field definitions.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { resolve } from "@std/path";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type * as Scope from "effect/Scope";

import type { WorkspaceOperationError } from "@dwkit/domain/errors";
import { WorkspaceImportError, WorkspaceValidationError } from "@dwkit/domain/errors";
import type {
  DatasetConfig,
  DatasetRuleConfig,
  ResolvedSpec,
  ResolvedStandard,
  ValidationSettings,
} from "@dwkit/domain/schemas";
import {
  getPreset,
  getPresetNames,
  getResolvedSpec,
  getSpecNames,
  inferForeignKeyRules,
  orderByForeignKeyDependencies,
} from "@dwkit/domain/specs";
import type {
  DatasetValidationResult,
  FieldViolation,
  SchemaViolation,
  WorkspaceValidationResult,
} from "@dwkit/domain/types";
import {
  calculateSummary,
  determineOverallStatus,
  MissingFieldViolation,
  MissingMappingViolation,
  partitionFieldViolations,
  partitionSchemaViolations,
  requirementToSeverity,
  UnknownFieldViolation,
  UnknownProfileViolation,
  UnmappedColumnViolation,
} from "@dwkit/domain/types";
import { importCsv, importParquet } from "../loading/table-import.ts";
import { queryRows, sanitizeTableName } from "../loading/sql.ts";
import { scopedConnection } from "../loading/connection.ts";
import { Workspace } from "../workspace/workspace.ts";

import { DependencyRule } from "@dwkit/domain/specs";
import { importSchema } from "../loading/schema.ts";
import { insertRowByRow } from "./data-loader.ts";
import { validateDependencyRule } from "./dataset-rule-validators.ts";
import { validateField } from "./field-validators.ts";

import { findSuggestedValue } from "./string-matching.ts";
import type { ResolvedFieldsEntry } from "./field-resolution.ts";
import {
  applyResolvedConstraints,
  deriveRequirementFromConstraints,
  resolveActiveStandard,
  resolveFieldsForDatasets,
} from "./field-resolution.ts";

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
          standard,
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
        standard,
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
      const datasetResolvedSpec = preResolved?.resolvedSpec;

      const result = yield* validateDataset(
        connection,
        dataset,
        datasetResolvedSpec,
        standard,
        settings,
        preResolved,
        datasetRules,
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
 * Import each dataset's CSV into a `raw_<name>` table and create its typed
 * schema table. Shared by validateDatasetsWithConnection and
 * createWorkspaceFromConfig (which differ only in where nullValues comes from).
 */
function importDatasets(
  connection: DuckDBConnection,
  datasets: readonly DatasetConfig[],
  nullValues: readonly string[],
  basePath: string,
  standard: ResolvedStandard,
  resolvedFieldsMap: Map<string, ResolvedFieldsEntry>,
  datasetRules?: readonly DatasetRuleConfig[],
) {
  return Effect.gen(function* () {
    // Pass 1: import each raw CSV/Parquet table and collect its actual columns.
    const shapes: { name: string; class: string; columns: string[] }[] = [];
    for (const dataset of datasets) {
      const filePath = resolve(basePath, dataset.path);
      const tableName = `raw_${sanitizeTableName(dataset.name)}`;

      if (filePath.toLowerCase().endsWith(".parquet")) {
        yield* importParquet(connection, tableName, filePath);
      } else {
        yield* importCsv(connection, tableName, filePath, nullValues);
      }

      const colRows = yield* queryRows(
        connection,
        `SELECT column_name FROM (DESCRIBE ${tableName})`,
      );
      const columns = colRows
        .map((r) => String(r.column_name))
        .filter((c) => c !== "_row_number");
      shapes.push({ name: dataset.name, class: dataset.class, columns });
    }

    // Infer the standard Darwin Core foreign keys; user-declared rules win and
    // resolve ambiguity. An unresolved ambiguity is a user-fixable config error.
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

    // Pass 2: create the typed schema tables. FK REFERENCES require the target
    // table to exist first, so create targets before sources.
    const byName = new Map(datasets.map((d) => [d.name, d]));
    const fkEdges = allRules
      .filter((r) => r.ruleType === "foreignKey")
      .map((r) => ({
        sourceDataset: r.sourceDataset,
        targetDataset: r.targetDataset,
      }));
    const order = orderByForeignKeyDependencies(
      datasets.map((d) => d.name),
      fkEdges,
    );

    for (const name of order) {
      const dataset = byName.get(name)!;
      const entry = resolvedFieldsMap.get(dataset.name);
      if (entry) {
        yield* importSchema(
          connection,
          dataset,
          datasets,
          standard,
          entry.resolvedSpec,
          allRules,
          entry.mapped,
        );
      }
    }

    return allRules;
  });
}

function createWorkspaceFromConfig(
  datasets: readonly DatasetConfig[],
  validationSettings: ValidationSettings,
  basePath: string,
  standard: ResolvedStandard,
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
      standard,
      resolvedFieldsMap,
      datasetRules,
    );

    return { connection, rules };
  });
}

function validateDataset(
  connection: DuckDBConnection,
  dataset: DatasetConfig,
  resolvedSpec: ResolvedSpec | undefined,
  standard: ResolvedStandard,
  validationSettings?: ValidationSettings,
  preResolved?: ResolvedFieldsEntry,
  datasetRules?: readonly DatasetRuleConfig[],
): Effect.Effect<DatasetValidationResult, WorkspaceValidationError> {
  return Effect.gen(function* () {
    const startTime = Date.now();
    const tableName = `raw_${sanitizeTableName(dataset.name)}`;

    const countRows = yield* queryRows(connection, `SELECT COUNT(*) as count FROM ${tableName}`);
    // queryRows uses the JSON reader: COUNT(*) (BIGINT) comes back as a string.
    const rowsProcessed = Number(countRows[0].count);

    const originTableColumnsRows = yield* queryRows(
      connection,
      `SELECT column_name FROM (DESCRIBE '${tableName}')`,
    );

    // Exclude _row_number; it's only used internally
    const originTableColumns = originTableColumnsRows
      .map((row) => String(row.column_name))
      .filter((col) => col !== "_row_number");

    // Use base spec for DuckDB table naming (matches importSchema which uses base specs)
    const baseProfile = getResolvedSpec(dataset.class);

    const schemaTableName = baseProfile
      ? sanitizeTableName(baseProfile.name).toLowerCase()
      : dataset.name.toLowerCase();
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

    const allFieldViolations: FieldViolation[] = [];
    const schemaViolations: SchemaViolation[] = [];

    const validMappings = Object.values(schemaColumnsObj).filter(
      (mapping) => originTableColumns.includes(mapping.originName),
    );

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

    const targetColumnNames = validMappings.map((field) => `"${field.targetName}"`);
    const originColumnNames = validMappings.map((field) => `"${field.originName}"`);
    const columnMappings = validMappings.map((m) => ({
      origin: m.originName,
      target: m.targetName,
    }));

    const insertSQL = `INSERT INTO ${schemaTableName} (${targetColumnNames.join(", ")}) SELECT ${
      originColumnNames.join(", ")
    } FROM ${tableName};`;

    // Try bulk INSERT first; fall back to row-by-row on constraint failures
    const bulkInsertResult = yield* Effect.tryPromise({
      try: () => connection.run(insertSQL),
      catch: (error) => error,
    }).pipe(Effect.result);

    if (Result.isFailure(bulkInsertResult)) {
      if (resolvedSpec) {
        const { standard: activeStandard } = resolveActiveStandard(standard);
        yield* insertRowByRow(
          connection,
          tableName,
          schemaTableName,
          columnMappings,
          resolvedSpec,
          activeStandard,
          dataset.name,
          datasetRules ?? [],
          validationSettings,
        ).pipe(
          Effect.catch((violations) => {
            allFieldViolations.push(...violations);
            return Effect.succeed(undefined);
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

    if (resolvedSpec && schemaColumnsObj && validMappings) {
      const mappedSpecFields = new Set(
        validMappings.map((m) => m.targetName),
      );
      const configSpecifiedFields = new Set(
        configFieldMappings.map((m) => m.targetName),
      );

      for (
        const [fieldName, fieldMapping] of Object.entries(
          schemaColumnsObj,
        )
      ) {
        const isMapped = mappedSpecFields.has(fieldName);
        if (isMapped) continue;

        const isConfigField = configSpecifiedFields.has(fieldName);

        if (isConfigField) {
          schemaViolations.push(
            new MissingFieldViolation({
              severity: requirementToSeverity("required"),
              fieldName,
              targetName: fieldName,
              errorMessage:
                `Field '${fieldName}' is specified in config fieldMappings but not found in the dataset`,

              reason: "not_mapped",
            }),
          );
          continue;
        }

        const requirement = deriveRequirementFromConstraints(fieldMapping.constraints);
        if (!requirement) {
          continue;
        }

        const messageVerb = requirement === "required"
          ? "requires"
          : requirement === "recommended"
          ? "strongly recommends"
          : "recommends";

        schemaViolations.push(
          new MissingFieldViolation({
            severity: requirementToSeverity(requirement),
            fieldName,
            targetName: fieldName,
            errorMessage:
              `Profile '${resolvedSpec.name}' ${messageVerb} field '${fieldName}' but it is not mapped in the dataset`,

            reason: "not_mapped",
          }),
        );
      }
    }

    const fieldValidationEffects: Effect.Effect<
      { fieldName: string; status: "valid" },
      FieldViolation[]
    >[] = [];

    for (const mapping of validMappings) {
      if (!resolvedSpec?.specFields) {
        schemaViolations.push(
          new UnknownProfileViolation({
            severity: requirementToSeverity("required"),
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            errorMessage:
              `No validation profile specified for dataset '${dataset.name}'. Please add a 'class' property to the dataset configuration.`,

            profileId: dataset.class ?? "unknown",
            reason: "not_found",
          }),
        );
        continue;
      }

      const baseField = resolvedSpec.specFields?.[mapping.targetName];

      if (!baseField) {
        schemaViolations.push(
          new UnknownFieldViolation({
            severity: requirementToSeverity("required"),
            fieldName: mapping.originName,
            targetName: mapping.targetName,
            errorMessage:
              `Unknown field '${mapping.targetName}' in profile '${resolvedSpec.name}'. Please confirm the schema definition is up to date and that the fieldMappings in config file are correct.`,

            profileId: resolvedSpec.id,
          }),
        );
        continue;
      }

      const specField = applyResolvedConstraints(baseField, mapping);
      const rawField = resolvedSpec.rawFields?.[mapping.targetName];
      const isDbPrimaryKey = mapping.targetName === schemaTableName + "ID" ||
        (mapping.targetName.endsWith("ID") && String(rawField?.unique) === "true");

      fieldValidationEffects.push(
        validateField(
          connection,
          tableName,
          mapping.originName,
          specField,
          {
            isDbPrimaryKey,
            maxViolations: validationSettings?.maxViolationsPerField,
          },
        ),
      );
    }

    if (fieldValidationEffects.length > 0) {
      const results = yield* Effect.all(fieldValidationEffects, {
        mode: "result",
        concurrency: "unbounded",
      });

      for (const result of results) {
        if (Result.isFailure(result)) {
          allFieldViolations.push(...result.failure);
        }
      }
    }

    // Collect dependency rules from both profile and config sources
    const dependencyRules: DependencyRule[] = [];

    if (resolvedSpec?.datasetRules) {
      for (const rule of resolvedSpec.datasetRules) {
        if (rule._tag === "dependency") {
          dependencyRules.push(rule as DependencyRule);
        }
      }
    }

    if (datasetRules) {
      for (const rule of datasetRules) {
        if (rule.ruleType !== "dependency") continue;
        if (rule.sourceDataset !== undefined && rule.sourceDataset !== dataset.name) continue;
        dependencyRules.push(
          new DependencyRule({
            sourceDataset: rule.sourceDataset,
            when: rule.when,
            require: rule.require,
            level: rule.level ?? "required",
            message: rule.message,
          }),
        );
      }
    }

    for (const depRule of dependencyRules) {
      const ruleFields = "oneOf" in depRule.require
        ? [...depRule.require.oneOf]
        : [...depRule.require];
      if (depRule.when !== undefined) {
        const whenField = typeof depRule.when === "string" ? depRule.when : depRule.when.field;
        ruleFields.push(whenField);
      }

      const allFieldsPresent = ruleFields.every((f) => originTableColumns.includes(f));
      if (allFieldsPresent) {
        const ruleResult = yield* Effect.result(
          validateDependencyRule(
            connection,
            tableName,
            depRule,
            validationSettings?.maxViolationsPerField,
          ),
        );
        if (Result.isFailure(ruleResult)) {
          allFieldViolations.push(...ruleResult.failure);
        }
      }
    }

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
