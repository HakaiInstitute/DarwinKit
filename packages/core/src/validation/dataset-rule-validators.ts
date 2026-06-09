import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";

import type { DependencyRequire, DependencyRule } from "@dwkt/domain/specs";
import {
  DependencyViolation,
  type FieldViolation,
  requirementToSeverity,
} from "@dwkt/domain/types";
import { escapeString, queryRows } from "../loading/sql.ts";

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

function buildWhereClause(rule: DependencyRule): string {
  const conditions: string[] = [];

  // When condition (trigger)
  if (rule.when !== undefined) {
    if (typeof rule.when === "string") {
      conditions.push(isFieldPresent(rule.when));
    } else if ("equals" in rule.when) {
      conditions.push(
        `CAST("${rule.when.field}" AS VARCHAR) = '${escapeString(rule.when.equals)}'`,
      );
    } else if ("in" in rule.when) {
      const values = rule.when.in.map((v) => `'${escapeString(v)}'`).join(", ");
      conditions.push(
        `CAST("${rule.when.field}" AS VARCHAR) IN (${values})`,
      );
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

  return conditions.join(" AND ");
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

export function validateDependencyRule(
  connection: DuckDBConnection,
  tableName: string,
  rule: DependencyRule,
  maxViolations = 100,
): Effect.Effect<void, FieldViolation[]> {
  return Effect.gen(function* () {
    const whereClause = buildWhereClause(rule);
    const query = `
      SELECT _row_number
      FROM ${tableName}
      WHERE ${whereClause}
      ORDER BY _row_number
      LIMIT ${maxViolations}
    `;

    const rows = yield* queryRows(connection, query);
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
