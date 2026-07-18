/**
 * Table Validator - Pure per-table detection core
 *
 * Runs the constraint-driven detection for a single already-loaded DuckDB table
 * (missing-field detection, per-field constraint validation, dependency rules,
 * foreign-key rules) and returns the raw `FieldViolation`/`SchemaViolation`
 * arrays it finds. It performs no CSV-shape diagnostics, no partitioning, and no
 * status computation — those remain the caller's responsibility.
 *
 * The table named `options.tableName` must expose a `_row_number` column and be
 * all-VARCHAR (so the validators see the original, un-coerced values).
 *
 * @module validation/table-validator
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

import type { WorkspaceValidationError } from "@dwkit/domain/errors";
import type {
  DatasetRuleConfig,
  ResolvedStandard,
  ValidationSettings,
} from "@dwkit/domain/schemas";
import { DependencyRule, obligationForStandard } from "@dwkit/domain/specs";
import type { FieldViolation, SchemaViolation } from "@dwkit/domain/types";
import {
  MissingFieldViolation,
  MissingMappingViolation,
  requirementToSeverity,
  UnknownFieldViolation,
  UnknownProfileViolation,
} from "@dwkit/domain/types";
import { queryRows, sanitizeTableName } from "../loading/sql.ts";
import { validateDependencyRule, validateForeignKeyRule } from "./dataset-rule-validators.ts";
import { validateField, type VocabularyCheck } from "./field-validators.ts";
import type { ResolvedFieldsEntry } from "./field-resolution.ts";
import {
  applyResolvedConstraints,
  deriveRequirementFromConstraints,
  resolveActiveStandard,
} from "./field-resolution.ts";

/** Return the column names of a DuckDB table (via DESCRIBE). */
export function getColumns(
  connection: DuckDBConnection,
  table: string,
): Effect.Effect<string[]> {
  return Effect.gen(function* () {
    const rows = yield* queryRows(connection, `SELECT column_name FROM (DESCRIBE '${table}')`);
    return rows.map((row) => String(row.column_name));
  });
}

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

export interface ValidateTableOptions {
  readonly tableName: string;
  readonly entry: ResolvedFieldsEntry; // .all resolves all spec fields; .resolvedSpec is the profile
  readonly standard: ResolvedStandard;
  readonly datasetName: string;
  readonly settings?: ValidationSettings;
  readonly configRequiredFields?: ReadonlySet<string>; // DwC target names explicitly required by config; empty for transform
  readonly datasetRules?: readonly DatasetRuleConfig[];
  readonly resolvedFieldsMap?: Map<string, ResolvedFieldsEntry>; // for FK parent lookup
  readonly physicalTableFor?: (datasetName: string) => string | undefined; // dataset name -> physical table
}

export interface TableViolations {
  readonly fieldViolations: FieldViolation[];
  readonly schemaViolations: SchemaViolation[];
}

/**
 * Run constraint-driven detection over a single loaded table.
 *
 * Owns, for `options.tableName`:
 * 1. Missing-field detection — required config fields and obligation-derived
 *    requirements that are not present as columns.
 * 2. Per-field constraint validation (range/pattern/format/length/unique,
 *    numeric type validity, controlled-vocabulary).
 * 3. Dependency rules (profile + config).
 * 4. Foreign-key rules (cross-table referential integrity).
 */
export function validateTable(
  connection: DuckDBConnection,
  options: ValidateTableOptions,
): Effect.Effect<TableViolations, WorkspaceValidationError> {
  return Effect.gen(function* () {
    const {
      tableName,
      entry,
      standard,
      datasetName,
      settings: validationSettings,
      datasetRules,
      resolvedFieldsMap,
      physicalTableFor,
    } = options;
    const configRequiredFields = options.configRequiredFields ?? new Set<string>();

    const { standard: activeStandard } = resolveActiveStandard(standard);

    const resolvedSpec = entry.resolvedSpec;
    const schemaColumnsObj = entry.all;
    const schemaTableName = sanitizeTableName(resolvedSpec.name).toLowerCase();

    // Exclude _row_number; it's only used internally.
    const originTableColumns = (yield* getColumns(connection, tableName))
      .filter((col) => col !== "_row_number");

    const validMappings = Object.values(schemaColumnsObj).filter(
      (mapping) => originTableColumns.includes(mapping.originName),
    );

    const fieldViolations: FieldViolation[] = [];
    const schemaViolations: SchemaViolation[] = [];

    // Missing-field detection.
    const mappedSpecFields = new Set(
      validMappings.map((m) => m.targetName),
    );

    for (
      const [fieldName, fieldMapping] of Object.entries(
        schemaColumnsObj,
      )
    ) {
      const isMapped = mappedSpecFields.has(fieldName);
      if (isMapped) continue;

      const isConfigField = configRequiredFields.has(fieldName);

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

    // Field-validation loop.
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
              `No validation profile specified for dataset '${datasetName}'. Please add a 'class' property to the dataset configuration.`,

            profileId: resolvedSpec.name,
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
        fieldViolations.push(...result.failure);
      }
    }

    // Collect dependency rules from both profile and config sources.
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
        if (rule.sourceDataset !== undefined && rule.sourceDataset !== datasetName) continue;
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
          fieldViolations.push(...ruleResult.failure);
        }
      }
    }

    // Foreign key rules (cross-dataset referential integrity).
    const seenFkRules = new Set<string>();
    for (const rule of datasetRules ?? []) {
      if (rule.ruleType !== "foreignKey") continue;
      if (rule.sourceDataset !== datasetName) continue;

      const fkKey = `${rule.sourceField}->${rule.targetDataset}.${rule.targetField}`;
      if (seenFkRules.has(fkKey)) continue;
      seenFkRules.add(fkKey);

      const childColumn = resolveOriginColumn(entry, rule.sourceField);
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
            datasetName,
          }),
        );
        continue;
      }

      const parentEntry = resolvedFieldsMap.get(rule.targetDataset);
      const parentColumn = resolveOriginColumn(parentEntry, rule.targetField);
      const parentTable = physicalTableFor?.(rule.targetDataset);
      // No physical parent table resolvable — nothing to anti-join against.
      if (parentTable === undefined) continue;

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
            datasetName,
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
        fieldViolations.push(...fkResult.failure);
      }
    }

    return { fieldViolations, schemaViolations };
  });
}
