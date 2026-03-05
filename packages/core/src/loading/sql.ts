/**
 * SQL utilities for DuckDB operations
 *
 * @module loading/sql
 */

import type { DatasetRule, ForeignKeyRuleMatch } from "@dwkt/domain/schemas";
import * as Match from "effect/Match";

export function sanitizeTableName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function escapeString(value: string): string {
  return value.replace(/'/g, "''");
}

export function formatNullValues(nullValues: readonly string[]): string {
  return nullValues.map((v) => `'${escapeString(v)}'`).join(", ");
}

export function findForeignKeyRule(
  sourceDataset: string,
  sourceField: string,
  rules?: readonly DatasetRule[],
): ForeignKeyRuleMatch | undefined {
  if (!rules) return undefined;

  const rule = rules.find(
    (r) =>
      r.ruleType === "foreignKey" &&
      r.sourceDataset === sourceDataset &&
      r.sourceField === sourceField,
  );

  if (!rule) return undefined;

  return {
    targetDataset: rule.targetDataset,
    targetField: rule.targetField,
    requirement: rule.requirement ?? "required",
  };
}

export type ParsedErrorType =
  | "primary-key"
  | "not-null"
  | "enum"
  | "foreign-key"
  | "check"
  | "unknown";

export interface ParsedErrorInfo {
  readonly type: ParsedErrorType;
  readonly fieldName?: string;
  readonly value?: string;
  readonly referencedTable?: string;
  readonly referencedField?: string;
  readonly message: string;
}

export function parseDuckDBError(error: Error): ParsedErrorInfo {
  const message = error.message;

  const pkMatch = message.match(
    /Duplicate key "(?:\w+:\s*)?([^"]+)" violates (?:primary key|unique) constraint/,
  );

  if (pkMatch) {
    return {
      type: "primary-key",
      value: pkMatch[1],
      message,
    };
  }

  const notNullMatch = message.match(/NOT NULL constraint failed:\s*(.+)?/i);
  if (notNullMatch) {
    const fieldPart = notNullMatch[1]?.trim();
    const fieldName = fieldPart?.includes(".") ? fieldPart.split(".").pop() : fieldPart;
    return {
      type: "not-null",
      fieldName,
      message,
    };
  }

  const enumMatchWithColumn = message.match(
    /Could not convert string '([^']+)'.+from source column (\w+)/,
  );
  if (enumMatchWithColumn) {
    return {
      type: "enum",
      value: enumMatchWithColumn[1],
      fieldName: enumMatchWithColumn[2],
      message,
    };
  }

  const enumMatchSimple = message.match(
    /Could not convert string '([^']+)' to UINT8/,
  );
  if (enumMatchSimple) {
    return {
      type: "enum",
      value: enumMatchSimple[1],
      message,
    };
  }

  const fkMatch = message.match(/foreign key constraint/i);
  if (fkMatch) {
    const keyMatch = message.match(/key "(\w+):\s*([^"]+)"/);
    const fieldName = keyMatch?.[1];
    const refTableMatch = message.match(
      /does not exist in the referenced table "(\w+)"/i,
    );
    const referencedTable = refTableMatch?.[1];

    return {
      type: "foreign-key",
      fieldName,
      value: keyMatch?.[2],
      referencedTable,
      referencedField: fieldName,
      message,
    };
  }

  const checkMatch = message.match(/CHECK constraint/i);
  if (checkMatch) {
    return {
      type: "check",
      message,
    };
  }

  return {
    type: "unknown",
    message,
  };
}

export interface ConstraintViolationContext {
  readonly type: ParsedErrorType;
  readonly fieldName: string;
  readonly value: string;
  readonly message: string;
  readonly datasetName?: string;
  readonly fkRule?: ForeignKeyRuleMatch;
  readonly referencedTable?: string;
  readonly referencedField?: string;
}

export function formatConstraintViolation(ctx: ConstraintViolationContext): string {
  const dataset = ctx.datasetName ? `'${ctx.datasetName}'` : "dataset";

  return Match.value(ctx.type).pipe(
    Match.when("foreign-key", () => {
      const target = ctx.fkRule
        ? `${ctx.fkRule.targetDataset}.${ctx.fkRule.targetField}`
        : ctx.referencedTable
        ? `${ctx.referencedTable}.${ctx.referencedField ?? ctx.fieldName}`
        : "referenced table";
      return `Foreign key violation in ${dataset}: ${ctx.fieldName} value "${ctx.value}" does not exist in ${target}`;
    }),
    Match.when("primary-key", () => {
      return `Primary key violation in ${dataset}: duplicate value "${ctx.value}"`;
    }),
    Match.when("not-null", () => {
      return `Not-null violation in ${dataset}: ${ctx.fieldName} cannot be null`;
    }),
    Match.when("enum", () => {
      return `Enum violation in ${dataset}: "${ctx.value}" is not a valid value for ${ctx.fieldName}`;
    }),
    Match.when("check", () => `Check constraint violation in ${dataset}`),
    Match.when("unknown", () => `Constraint violation in ${dataset}: ${ctx.message}`),
    Match.exhaustive,
  );
}
