import type { DuckDBConnection } from "@duckdb/node-api";
import type {
  ResolvedSpec,
  TransformField,
  WorkspaceCrossDatasetRule,
  WorkspaceFieldMapping,
} from "@dwkt/domain/schemas";
import type { ResolvedStandard } from "@dwkt/domain/schemas";

import { getResolvedSpec, obligationForStandard } from "@dwkt/domain/specs";
import { WorkspaceImportError } from "@dwkt/domain/errors";
import * as Effect from "effect/Effect";
import { deriveRequirementFromConstraints } from "../validation/field-resolution.ts";
import { findForeignKeyRule, sanitizeTableName } from "./sql.ts";

type DatasetWithClass = {
  readonly name: string;
  readonly class: string;
};

/**
 * Only fields with "required" or "recommended" obligation get ENUM enforcement.
 */
function shouldEnforceVocabulary(
  spec: ResolvedSpec,
  fieldName: string,
  activeStandard: "obis" | "gbif",
): boolean {
  const normalizedField = spec.specFields?.[fieldName];
  if (!normalizedField) return false;
  const result = obligationForStandard(normalizedField, activeStandard);
  return result?.requirement === "required" || result?.requirement === "recommended";
}

function isFieldRequired(
  resolvedFields: Record<string, WorkspaceFieldMapping> | undefined,
  spec: ResolvedSpec,
  fieldName: string,
): boolean {
  if (resolvedFields) {
    const resolved = resolvedFields[fieldName];
    return deriveRequirementFromConstraints(resolved?.constraints) === "required";
  }
  return spec.fieldOverrides?.[fieldName]?.requirement === "required";
}

export function importSchema(
  connection: DuckDBConnection,
  dataset: DatasetWithClass,
  datasets: readonly DatasetWithClass[],
  standard: ResolvedStandard,
  crossDatasetRules?: readonly WorkspaceCrossDatasetRule[],
  resolvedFields?: Record<string, WorkspaceFieldMapping>,
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* (_) {
    // TODO(#108): Should use resolveProfile(standard.variant, dataset.class) to respect
    // standard-specific profiles. Currently only loads the base JSON spec.
    const spec = getResolvedSpec(dataset.class);
    if (!spec) {
      // TODO(#63): Surface as a recoverable schema violation (warning)
      return;
    }
    const tableName = sanitizeTableName(spec.name).toLowerCase();
    const activeStandard: "obis" | "gbif" = standard.variant === "gbif" ? "gbif" : "obis";

    const enumFields = new Set<string>();
    const rawFields = spec.rawFields || {};
    const enums = Object.entries(rawFields).map(
      ([fieldName, field]: [string, TransformField]) => {
        if (field.type === "controlled-vocabulary" && field.values) {
          if (!shouldEnforceVocabulary(spec, fieldName, activeStandard)) {
            return null;
          }
          enumFields.add(fieldName);
          const enumName = `${tableName}_${fieldName.toLowerCase()}_enum`;
          const enumValues = Object.keys(field.values).map((v: string) => `'${v}'`).join(", ");
          return `CREATE TYPE IF NOT EXISTS ${enumName} AS ENUM (${enumValues});`;
        }
        return null;
      },
    );

    const columns = Object.keys(rawFields).map((fieldName) => {
      const field = rawFields[fieldName];
      const fieldType = (field.type?.toUpperCase() || "TEXT")
        .replace("IDENTIFIER", "TEXT")
        .replace(
          "CONTROLLED-VOCABULARY",
          enumFields.has(fieldName) ? `${tableName}_${fieldName.toLowerCase()}_enum` : "TEXT",
        )
        .replace("URI", "TEXT");
      let fieldStr = `"${fieldName}" ${fieldType}`;
      const isUniqueIdentifier = field.unique === "true";

      if (
        fieldName === tableName + "ID" ||
        (fieldName.endsWith("ID") && isUniqueIdentifier)
      ) {
        fieldStr += " PRIMARY KEY";
      } else if (isFieldRequired(resolvedFields, spec, fieldName)) {
        fieldStr += " NOT NULL";
      }
      const fkRule = findForeignKeyRule(dataset.name, fieldName, crossDatasetRules);
      if (fkRule) {
        const targetDataset = datasets.find((ds) => ds.name === fkRule.targetDataset);
        if (targetDataset) {
          const targetProfile = getResolvedSpec(targetDataset.class);
          if (targetProfile) {
            const referencedTable = sanitizeTableName(targetProfile.name).toLowerCase();
            fieldStr += ` REFERENCES ${referencedTable}("${fkRule.targetField}")`;
          }
        }
      }
      return fieldStr;
    });

    columns.push("_row_number INTEGER");

    const enumSql = enums.filter((e) => e !== null).join("\n");
    if (enumSql) {
      yield* _(Effect.tryPromise({
        try: () => connection.run(enumSql),
        catch: (error) =>
          new WorkspaceImportError({
            message: `Failed to create ENUM types for table '${tableName}'`,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }));
    }

    yield* _(Effect.tryPromise({
      try: () => connection.run(`DROP TABLE IF EXISTS ${tableName}`),
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to drop table '${tableName}'`,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    }));

    const tableSql = `CREATE TABLE ${tableName} (${columns.join(", ")})`;
    yield* _(Effect.tryPromise({
      try: () => connection.run(tableSql),
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to create table '${tableName}': ${tableSql}`,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    }));
  });
}
