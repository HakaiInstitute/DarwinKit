import type { DuckDBConnection, DuckDBValue } from "@duckdb/node-api";
import * as Effect from "effect/Effect";

import type { DependencyRequire, DependencyRule, RequirementLevel } from "@dwkit/domain/specs";
import {
  DependencyViolation,
  type FieldViolation,
  ForeignKeyViolation,
  requirementToSeverity,
} from "@dwkit/domain/types";
import { queryRows } from "../loading/sql.ts";

function isOneOf(
  r: DependencyRequire,
): r is { readonly oneOf: readonly string[] } {
  return !Array.isArray(r) && "oneOf" in r;
}

function isFieldPresent(field: string): string {
  const asText = `CAST("${field}" AS VARCHAR)`;
  return `("${field}" IS NOT NULL AND TRIM(${asText}) != '')`;
}

function isFieldAbsent(field: string): string {
  const asText = `CAST("${field}" AS VARCHAR)`;
  return `("${field}" IS NULL OR TRIM(${asText}) = '')`;
}

function buildWhereClause(rule: DependencyRule): { clause: string; params: DuckDBValue[] } {
  const conditions: string[] = [];
  const params: DuckDBValue[] = [];

  // When condition (trigger)
  if (rule.when !== undefined) {
    if (typeof rule.when === "string") {
      conditions.push(isFieldPresent(rule.when));
    } else if ("equals" in rule.when) {
      conditions.push(`CAST("${rule.when.field}" AS VARCHAR) = ?`);
      params.push(rule.when.equals);
    } else if ("in" in rule.when) {
      const placeholders = rule.when.in.map(() => "?").join(", ");
      conditions.push(`CAST("${rule.when.field}" AS VARCHAR) IN (${placeholders})`);
      params.push(...rule.when.in);
    }
  }

  // Require condition (what must be present)
  if (isOneOf(rule.require)) {
    // oneOf: ALL of the required fields are missing → violation
    const missingAll = rule.require.oneOf.map(isFieldAbsent);
    conditions.push(missingAll.join(" AND "));
  } else {
    // allOf: ANY of the required fields is missing → violation
    const missingAny = rule.require.map(isFieldAbsent);
    conditions.push(`(${missingAny.join(" OR ")})`);
  }

  return { clause: conditions.join(" AND "), params };
}

function buildDefaultMessage(rule: DependencyRule): string {
  const whenDesc = rule.when === undefined
    ? undefined
    : typeof rule.when === "string"
    ? `when ${rule.when} is present`
    : "equals" in rule.when
    ? `when ${rule.when.field} equals '${rule.when.equals}'`
    : `when ${rule.when.field} is one of [${rule.when.in.join(", ")}]`;

  if (isOneOf(rule.require)) {
    const fields = rule.require.oneOf.join(", ");
    return whenDesc
      ? `At least one of [${fields}] required ${whenDesc}`
      : `At least one of [${fields}] must be present`;
  }

  const fields = rule.require.join(", ");
  return whenDesc ? `[${fields}] required ${whenDesc}` : `Fields [${fields}] are required`;
}

export function validateForeignKeyRule(
  connection: DuckDBConnection,
  childTable: string,
  childColumn: string,
  parentTable: string,
  parentColumn: string,
  options: {
    requirement: RequirementLevel;
    message?: string;
    // Optional display names. When provided, the violation reports logical
    // dataset/field names; otherwise it falls back to the physical SQL names.
    sourceField?: string;
    referencedTable?: string;
    referencedField?: string;
  },
  maxViolations = 100,
): Effect.Effect<void, FieldViolation[]> {
  return Effect.gen(function* () {
    const childText = `CAST(c."${childColumn}" AS VARCHAR)`;
    const parentText = `CAST(p."${parentColumn}" AS VARCHAR)`;
    const query = `
      SELECT c._row_number, ${childText} AS value
      FROM ${childTable} c
      WHERE c."${childColumn}" IS NOT NULL
        AND TRIM(${childText}) != ''
        AND NOT EXISTS (
          SELECT 1 FROM ${parentTable} p
          WHERE ${parentText} = ${childText}
        )
      ORDER BY c._row_number
      LIMIT ${maxViolations}
    `;

    const rows = yield* queryRows(connection, query);
    if (rows.length > 0) {
      const displayTable = options.referencedTable ?? parentTable;
      const displayField = options.referencedField ?? parentColumn;
      const hasRuleContext = options.referencedTable !== undefined &&
        options.referencedField !== undefined;
      const violations: FieldViolation[] = rows.map((row) => {
        const value = String(row.value);
        return new ForeignKeyViolation({
          severity: requirementToSeverity(options.requirement),
          fieldName: childColumn,
          targetName: options.sourceField ?? childColumn,
          rowNumber: Number(row._row_number),
          value,
          referencedTable: displayTable,
          referencedField: displayField,
          errorMessage: options.message ??
            `Foreign key value "${value}" in ${childColumn} does not exist in ${displayTable}.${displayField}`,
          ...(hasRuleContext && {
            params: {
              targetDataset: options.referencedTable,
              targetField: options.referencedField,
            },
          }),
        });
      });
      return yield* Effect.fail(violations);
    }
  });
}

export function validateDependencyRule(
  connection: DuckDBConnection,
  tableName: string,
  rule: DependencyRule,
  maxViolations = 100,
): Effect.Effect<void, FieldViolation[]> {
  return Effect.gen(function* () {
    const { clause, params } = buildWhereClause(rule);
    const query = `
      SELECT _row_number
      FROM ${tableName}
      WHERE ${clause}
      ORDER BY _row_number
      LIMIT ${maxViolations}
    `;

    const rows = yield* queryRows(connection, query, params);
    if (rows.length > 0) {
      const fields = isOneOf(rule.require) ? rule.require.oneOf : rule.require;
      const fieldLabel = Array.from(fields).join(", ");
      const message = rule.message ?? buildDefaultMessage(rule);
      const violations: FieldViolation[] = rows.map((row) =>
        new DependencyViolation({
          severity: requirementToSeverity(rule.level),
          fieldName: fieldLabel,
          targetName: fieldLabel,
          rowNumber: Number(row._row_number),
          value: "",
          errorMessage: message,
        })
      );

      return yield* Effect.fail(violations);
    }
  });
}
