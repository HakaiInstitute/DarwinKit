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

import { DependencyRule, obligationForStandard } from "@dwkit/domain/specs";
import { validateDependencyRule, validateForeignKeyRule } from "./dataset-rule-validators.ts";
import { validateField, type VocabularyCheck } from "./field-validators.ts";

import type { ResolvedFieldsEntry } from "./field-resolution.ts";
import {
  applyResolvedConstraints,
  deriveRequirementFromConstraints,
  resolveActiveStandard,
  resolveFieldsForDatasets,
} from "./field-resolution.ts";
import { findSuggestedValue } from "./string-matching.ts";

/**
 * Resolve a Darwin Core target field name to its origin (CSV) column name for a
 * given dataset, using the dataset's resolved field mappings. Falls back to the
 * target name when no mapping is found.
 */
function resolveOriginColumn(
  entry: ResolvedFieldsEntry | undefined,
  dwcField: string,
): string {
  if (!entry) return dwcField;
  return entry.all[dwcField]?.originName ?? dwcField;
}

/** Return the column names of a DuckDB table (via DESCRIBE). */
function getColumns(
  connection: DuckDBConnection,
  table: string,
): Effect.Effect<string[]> {
  return Effect.gen(function* () {
    const rows = yield* queryRows(connection, `SELECT column_name FROM (DESCRIBE '${table}')`);
    return rows.map((row) => String(row.column_name));
  });
}

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
      const datasetResolvedSpec = preResolved?.resolvedSpec;

      const result = yield* validateDataset(
        connection,
        dataset,
        datasetResolvedSpec,
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
  resolvedSpec: ResolvedSpec | undefined,
  standard: ResolvedStandard,
  validationSettings?: ValidationSettings,
  preResolved?: ResolvedFieldsEntry,
  datasetRules?: readonly DatasetRuleConfig[],
  resolvedFieldsMap?: Map<string, ResolvedFieldsEntry>,
): Effect.Effect<DatasetValidationResult, WorkspaceValidationError> {
  return Effect.gen(function* () {
    const startTime = Date.now();
    const { standard: activeStandard } = resolveActiveStandard(standard);
    const tableName = `raw_${sanitizeTableName(dataset.name)}`;

    const countRows = yield* queryRows(connection, `SELECT COUNT(*) as count FROM ${tableName}`);
    // queryRows uses the JSON reader: COUNT(*) (BIGINT) comes back as a string.
    const rowsProcessed = Number(countRows[0].count);

    // Exclude _row_number; it's only used internally
    const originTableColumns = (yield* getColumns(connection, tableName))
      .filter((col) => col !== "_row_number");

    // Use base spec for primary-key and enum-type naming (derived from base specs).
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

      const numericType: "INTEGER" | "DOUBLE" | undefined = rawField?.type === "integer"
        ? "INTEGER"
        : rawField?.type === "decimal"
        ? "DOUBLE"
        : undefined;

      // Numeric (type-validity) violations take their severity from the field's
      // obligation in the active standard — mirroring the vocabulary path — so a
      // bad value in an optional numeric field warns/infos rather than failing.
      const numericSeverity = numericType
        ? requirementToSeverity(
          obligationForStandard(baseField, activeStandard)?.requirement ?? "optional",
        )
        : undefined;

      let vocabulary: VocabularyCheck | undefined;

      if (rawField?.type === "controlled-vocabulary" && rawField.values) {
        const obligation = obligationForStandard(baseField, activeStandard);
        const req = obligation?.requirement;

        if (req === "required" || req === "recommended") {
          vocabulary = {
            allowedValues: Object.keys(rawField.values),
            enumType: `${schemaTableName}_${mapping.targetName.toLowerCase()}_enum`,
            severity: requirementToSeverity(req),
            enableSuggestions: validationSettings?.enableSuggestions ?? true,
          };
        }
      }

      fieldValidationEffects.push(
        validateField(
          connection,
          tableName,
          mapping.originName,
          specField,
          {
            isDbPrimaryKey,
            maxViolations: validationSettings?.maxViolationsPerField,
            numericType,
            numericSeverity,
            vocabulary,
          },
        ),
      );
    }

    for (const fieldValidation of fieldValidationEffects) {
      const result = yield* Effect.result(fieldValidation);
      if (Result.isFailure(result)) {
        allFieldViolations.push(...result.failure);
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

    // Foreign key rules (cross-dataset referential integrity)
    const seenFkRules = new Set<string>();
    for (const rule of datasetRules ?? []) {
      if (rule.ruleType !== "foreignKey") continue;
      if (rule.sourceDataset !== dataset.name) continue;

      const fkKey = `${rule.sourceField}->${rule.targetDataset}.${rule.targetField}`;
      if (seenFkRules.has(fkKey)) continue;
      seenFkRules.add(fkKey);

      const childColumn = resolveOriginColumn(preResolved, rule.sourceField);
      if (!originTableColumns.includes(childColumn)) continue;

      // Guard: the rule's target dataset must exist (have a resolved entry + raw table).
      if (!resolvedFieldsMap?.has(rule.targetDataset)) {
        schemaViolations.push(
          new MissingMappingViolation({
            severity: requirementToSeverity("required"),
            fieldName: rule.sourceField,
            targetName: rule.targetField,
            errorMessage:
              `foreignKey rule references unknown target dataset '${rule.targetDataset}'`,
            datasetName: dataset.name,
          }),
        );
        continue;
      }

      const parentEntry = resolvedFieldsMap.get(rule.targetDataset);
      const parentColumn = resolveOriginColumn(parentEntry, rule.targetField);
      const parentTable = `raw_${sanitizeTableName(rule.targetDataset)}`;

      // Guard: the resolved parent column must exist in the parent's raw table.
      const parentColumns = yield* getColumns(connection, parentTable);
      if (!parentColumns.includes(parentColumn)) {
        schemaViolations.push(
          new MissingMappingViolation({
            severity: requirementToSeverity("required"),
            fieldName: rule.sourceField,
            targetName: rule.targetField,
            errorMessage:
              `foreignKey rule references field '${rule.targetField}' not found in dataset '${rule.targetDataset}'`,
            datasetName: dataset.name,
          }),
        );
        continue;
      }

      const fkResult = yield* Effect.result(
        validateForeignKeyRule(
          connection,
          tableName,
          childColumn,
          parentTable,
          parentColumn,
          {
            requirement: rule.requirement ?? "required",
            sourceField: rule.sourceField,
            referencedTable: rule.targetDataset,
            referencedField: rule.targetField,
          },
          validationSettings?.maxViolationsPerField,
        ),
      );
      if (Result.isFailure(fkResult)) {
        allFieldViolations.push(...fkResult.failure);
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
