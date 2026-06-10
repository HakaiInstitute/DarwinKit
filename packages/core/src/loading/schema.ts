import type { DuckDBConnection } from "@duckdb/node-api";
import type {
  DatasetRuleConfig,
  ResolvedSpec,
  ResolvedStandard,
  TransformField,
  WorkspaceFieldMapping,
} from "@dwkt/domain/schemas";

import { WorkspaceImportError } from "@dwkt/domain/errors";
import { obligationForStandard, resolveProfile } from "@dwkt/domain/specs";
import * as Effect from "effect/Effect";
import { deriveRequirementFromConstraints } from "../validation/field-resolution.ts";
import { findForeignKeyRule, sanitizeTableName } from "./sql.ts";

type DatasetWithClass = {
  readonly name: string;
  readonly class: string;
};

/**
 * Only fields with "required" or "recommended" obligation get ENUM type constraints.
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
  _spec: ResolvedSpec,
  fieldName: string,
): boolean {
  if (resolvedFields) {
    const resolved = resolvedFields[fieldName];
    return deriveRequirementFromConstraints(resolved?.constraints) === "required";
  }
  // Without resolved fields (e.g., transform path), don't enforce NOT NULL.
  // Only the validation path provides resolvedFields with the full constraint pipeline.
  return false;
}

export function importSchema(
  connection: DuckDBConnection,
  dataset: DatasetWithClass,
  datasets: readonly DatasetWithClass[],
  standard: ResolvedStandard,
  spec: ResolvedSpec,
  datasetRules?: readonly DatasetRuleConfig[],
  resolvedFields?: Record<string, WorkspaceFieldMapping>,
): Effect.Effect<void, WorkspaceImportError> {
  return Effect.gen(function* () {
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
      const fkRule = findForeignKeyRule(dataset.name, fieldName, datasetRules);
      if (fkRule) {
        const targetDataset = datasets.find((ds) => ds.name === fkRule.targetDataset);
        if (targetDataset) {
          const targetProfile = resolveProfile(standard.variant, targetDataset.class);
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
      yield* Effect.tryPromise({
        try: () => connection.run(enumSql),
        catch: (error) =>
          new WorkspaceImportError({
            message: `Failed to create ENUM types for table '${tableName}'`,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      });
    }

    yield* Effect.tryPromise({
      try: () => connection.run(`DROP TABLE IF EXISTS ${tableName}`),
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to drop table '${tableName}'`,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });

    const tableSql = `CREATE TABLE ${tableName} (${columns.join(", ")})`;
    yield* Effect.tryPromise({
      try: () => connection.run(tableSql),
      catch: (error) =>
        new WorkspaceImportError({
          message: `Failed to create table '${tableName}': ${tableSql}`,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });
  });
}
