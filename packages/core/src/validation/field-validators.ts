/**
 * Field Validators
 *
 * SQL-based validators for field constraints. Each validator runs queries
 * against the raw table created by `read_csv_auto()`.
 *
 * ## Column Type Strategy
 *
 * DuckDB's `read_csv_auto()` auto-detects column types (DATE, DOUBLE, INTEGER,
 * etc.). Validators that use string functions (TRY_STRPTIME, regexp_matches,
 * TRIM, LENGTH) CAST columns to VARCHAR first to avoid type errors. Numeric
 * validators use TRY_CAST to DOUBLE for the same reason.
 *
 * This means format/pattern validators check DuckDB's string representation
 * of already-typed data, not the original CSV values. A future improvement
 * would use `read_csv_auto(..., all_varchar=true)` for a separate raw-text
 * table so validators see original values, while keeping the auto-typed table
 * for schema inference and range validation.
 *
 * @module validation/field-validators
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Result from "effect/Result";

import type { Constraint, ConstraintFormat, SpecField } from "@dwkit/domain/specs";
import { type RequiredConstraint, strictestRequired } from "@dwkit/domain/specs";
import type { FieldViolation, ValidField } from "@dwkit/domain/types";
import {
  FormatViolation,
  LengthViolation,
  PatternViolation,
  RangeViolation,
  RequiredFieldViolation,
  requirementToSeverity,
  UniquenessViolation,
} from "@dwkit/domain/types";
import { queryRows } from "../loading/sql.ts";

function validField(fieldName: string, targetName: string): ValidField {
  return { fieldName, targetName, status: "valid" };
}

export function findRangeViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { _tag: "range" },
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, RangeViolation[]> {
  return Effect.gen(function* () {
    const { min, max, inclusive = true } = constraint;

    if (min === undefined && max === undefined) {
      return validField(fieldName, specField.name);
    }

    // Build range condition — TRY_CAST to DOUBLE so comparisons work regardless
    // of whether the column was auto-detected as INTEGER, DOUBLE, or VARCHAR.
    const asNum = `TRY_CAST("${fieldName}" AS DOUBLE)`;
    const conditions: string[] = [];
    if (min !== undefined) {
      conditions.push(
        inclusive ? `${asNum} < ${min}` : `${asNum} <= ${min}`,
      );
    }
    if (max !== undefined) {
      conditions.push(
        inclusive ? `${asNum} > ${max}` : `${asNum} >= ${max}`,
      );
    }

    const rangeCondition = conditions.join(" OR ");

    const query = `
      SELECT
        _row_number,
        CAST("${fieldName}" AS VARCHAR) as value
      FROM ${tableName}
      WHERE ${asNum} IS NOT NULL
        AND (${rangeCondition})
      LIMIT ${maxViolations}
    `;

    const rows = yield* queryRows(connection, query);
    if (rows.length > 0) {
      const violations = rows.map((row) =>
        new RangeViolation({
          severity: requirementToSeverity("required"),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: String(row.value),
          errorMessage: constraint.message || `Value out of range`,

          params: { min: constraint.min, max: constraint.max },
        })
      );
      return yield* Effect.fail(violations);
    }

    return validField(fieldName, specField.name);
  });
}

/**
 * Generic helper for the filter-loop-collect pattern shared by constraint validators.
 *
 * Filters constraints by type, runs the provided `findViolations` function for each,
 * and accumulates violations.
 */
function validateConstraintsByType<TType extends Constraint["_tag"]>(
  constraintType: TType,
  findViolations: (
    connection: DuckDBConnection,
    tableName: string,
    fieldName: string,
    constraint: Extract<Constraint, { _tag: TType }>,
    specField: SpecField,
    maxViolations: number,
  ) => Effect.Effect<ValidField, FieldViolation[]>,
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  maxViolations: number,
): Effect.Effect<ValidField, FieldViolation[]> {
  return Effect.gen(function* () {
    const filtered = (specField.constraints ?? []).filter(
      (c): c is Extract<Constraint, { _tag: TType }> => c._tag === constraintType,
    );
    if (filtered.length === 0) {
      return validField(fieldName, specField.name);
    }

    const violations: FieldViolation[] = [];
    for (const constraint of filtered) {
      const result = yield* Effect.result(
        findViolations(connection, tableName, fieldName, constraint, specField, maxViolations),
      );
      if (Result.isFailure(result)) {
        violations.push(...result.failure);
      }
    }

    if (violations.length > 0) {
      return yield* Effect.fail(violations);
    }

    return validField(fieldName, specField.name);
  });
}

function validateRangeConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, FieldViolation[]> {
  return validateConstraintsByType(
    "range",
    findRangeViolations,
    connection,
    tableName,
    fieldName,
    specField,
    maxViolations,
  );
}

/**
 * "Explodes" duplicate values into individual violations per affected row.
 */
export function findUniquenessViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, UniquenessViolation[]> {
  return Effect.gen(function* () {
    const query = `
      SELECT
        "${fieldName}" as duplicate_value,
        COUNT(*) as occurrence_count,
        list(_row_number ORDER BY _row_number) as affected_rows
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
      GROUP BY "${fieldName}"
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT ${maxViolations}
    `;

    const rows = yield* queryRows(connection, query);
    const violations: UniquenessViolation[] = [];

    for (const row of rows) {
      const value = String(row.duplicate_value);

      // queryRows uses the JSON reader, so a DuckDB LIST is always a plain array.
      const raw = row.affected_rows;
      const affectedRows: number[] = Array.isArray(raw) ? raw.map((n) => Number(n)) : [];

      for (const rowNum of affectedRows) {
        violations.push(
          new UniquenessViolation({
            severity: requirementToSeverity("required"),
            fieldName,
            targetName: specField.name,
            rowNumber: Number(rowNum),
            value,
            errorMessage: `Duplicate value: "${value}"`,
          }),
        );
      }
    }

    if (violations.length > 0) {
      return yield* Effect.fail(violations);
    }

    return validField(fieldName, specField.name);
  });
}

function findUniquenessConstraintViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  _constraint: Constraint & { _tag: "unique" },
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, UniquenessViolation[]> {
  return findUniquenessViolations(
    connection,
    tableName,
    fieldName,
    specField,
    maxViolations,
  );
}

function validateUniqueness(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, FieldViolation[]> {
  return validateConstraintsByType(
    "unique",
    findUniquenessConstraintViolations,
    connection,
    tableName,
    fieldName,
    specField,
    maxViolations,
  );
}

/**
 * SQL condition for each format type.
 * Returns a WHERE clause fragment that matches INVALID values.
 *
 * IMPORTANT: All string operations CAST to VARCHAR first because the raw table
 * uses read_csv_auto() which auto-detects types (DATE, DOUBLE, etc.).
 * Applying TRY_STRPTIME or regexp_matches on non-VARCHAR columns can crash DuckDB.
 */
function formatSqlCondition(fieldName: string, format: ConstraintFormat): string {
  // Use CAST to VARCHAR for all string operations to avoid crashes on auto-typed columns
  const asText = `CAST("${fieldName}" AS VARCHAR)`;
  return Match.value(format).pipe(
    // Accept single dates and date ranges (YYYY-MM-DD/YYYY-MM-DD)
    // TRY_STRPTIME handles single dates; regex handles ranges
    Match.when("iso8601", () =>
      `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND TRY_STRPTIME(${asText}, '%Y-%m-%d') IS NULL
        AND TRY_STRPTIME(${asText}, '%Y-%m-%dT%H:%M:%S') IS NULL
        AND TRY_STRPTIME(${asText}, '%Y-%m-%dT%H:%M:%SZ') IS NULL
        AND TRY_STRPTIME(${asText}, '%Y-%m') IS NULL
        AND TRY_STRPTIME(${asText}, '%Y') IS NULL
        AND NOT regexp_matches(${asText}, '^\\d{4}-\\d{2}-\\d{2}/\\d{4}-\\d{2}-\\d{2}$')`),
    Match.when("url", () =>
      `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND NOT regexp_matches(${asText}, '^https?://[^\\s]+$')`),
    Match.when("uuid", () =>
      `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND NOT regexp_matches(${asText}, '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')`),
    Match.when("decimal-degrees", () =>
      `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND TRY_CAST(${asText} AS DOUBLE) IS NULL`),
    Match.when("integer", () =>
      `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND TRY_CAST(${asText} AS INTEGER) IS NULL`),
    Match.when("email", () =>
      `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND NOT regexp_matches(${asText}, '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')`),
    Match.exhaustive,
  );
}

export function findFormatViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { _tag: "format" },
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, FormatViolation[]> {
  return Effect.gen(function* () {
    const condition = formatSqlCondition(fieldName, constraint.format);
    const query = `
      SELECT _row_number, CAST("${fieldName}" AS VARCHAR) as value
      FROM ${tableName}
      WHERE ${condition}
      LIMIT ${maxViolations}
    `;

    const rows = yield* queryRows(connection, query);
    if (rows.length > 0) {
      const violations = rows.map((row) =>
        new FormatViolation({
          severity: requirementToSeverity("required"),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: String(row.value),
          errorMessage: constraint.message ||
            `Value "${String(row.value)}" does not match ${constraint.format} format`,
          format: constraint.format,
        })
      );
      return yield* Effect.fail(violations);
    }

    return validField(fieldName, specField.name);
  });
}

function validateFormatConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, FieldViolation[]> {
  return validateConstraintsByType(
    "format",
    findFormatViolations,
    connection,
    tableName,
    fieldName,
    specField,
    maxViolations,
  );
}

export function findPatternViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { _tag: "pattern" },
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, PatternViolation[]> {
  return Effect.gen(function* () {
    const asText = `CAST("${fieldName}" AS VARCHAR)`;
    const query = `
      SELECT _row_number, ${asText} as value
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND NOT regexp_matches(${asText}, ?)
      LIMIT ${maxViolations}
    `;

    const queryResult = yield* Effect.result(
      Effect.tryPromise({
        try: () => connection.runAndReadAll(query, [constraint.pattern]),
        // Surface the raw DuckDB error (an Error) rather than the generic
        // UnknownError wrapper, so the regex diagnostic reaches the user.
        catch: (e) => e,
      }),
    );

    if (Result.isFailure(queryResult)) {
      const errorMsg = queryResult.failure instanceof Error
        ? queryResult.failure.message
        : String(queryResult.failure);
      return yield* Effect.fail([
        new PatternViolation({
          severity: requirementToSeverity("required"),
          fieldName,
          targetName: specField.name,
          rowNumber: 0,
          value: "",
          errorMessage: `Invalid regex pattern "/${constraint.pattern}/": ${errorMsg}`,
          pattern: constraint.pattern,
          flags: constraint.flags,
        }),
      ]);
    }

    const rows = queryResult.success.getRowObjectsJson();
    if (rows.length > 0) {
      const violations = rows.map((row) =>
        new PatternViolation({
          severity: requirementToSeverity("required"),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: String(row.value),
          errorMessage: constraint.message ||
            `Value "${String(row.value)}" does not match pattern /${constraint.pattern}/`,
          pattern: constraint.pattern,
          flags: constraint.flags,
        })
      );
      return yield* Effect.fail(violations);
    }

    return validField(fieldName, specField.name);
  });
}

function validatePatternConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, FieldViolation[]> {
  return validateConstraintsByType(
    "pattern",
    findPatternViolations,
    connection,
    tableName,
    fieldName,
    specField,
    maxViolations,
  );
}

export function findLengthViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { _tag: "length" },
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, LengthViolation[]> {
  return Effect.gen(function* () {
    const { minLength, maxLength } = constraint;
    if (minLength === undefined && maxLength === undefined) {
      return validField(fieldName, specField.name);
    }

    const asText = `CAST("${fieldName}" AS VARCHAR)`;
    const conditions: string[] = [];
    if (minLength !== undefined) {
      conditions.push(`LENGTH(${asText}) < ${minLength}`);
    }
    if (maxLength !== undefined) {
      conditions.push(`LENGTH(${asText}) > ${maxLength}`);
    }

    const query = `
      SELECT _row_number, ${asText} as value, LENGTH(${asText}) as actual_length
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
        AND (${conditions.join(" OR ")})
      LIMIT ${maxViolations}
    `;

    const rows = yield* queryRows(connection, query);
    if (rows.length > 0) {
      const violations = rows.map((row) =>
        new LengthViolation({
          severity: requirementToSeverity("required"),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: String(row.value),
          errorMessage: constraint.message ||
            `Value length ${row.actual_length} is outside bounds [${minLength ?? ""}..${
              maxLength ?? ""
            }]`,
          params: {
            minLength,
            maxLength,
            actualLength: Number(row.actual_length),
          },
        })
      );
      return yield* Effect.fail(violations);
    }

    return validField(fieldName, specField.name);
  });
}

function validateLengthConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, FieldViolation[]> {
  return validateConstraintsByType(
    "length",
    findLengthViolations,
    connection,
    tableName,
    fieldName,
    specField,
    maxViolations,
  );
}

export function findRequiredViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { _tag: "required" },
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, RequiredFieldViolation[]> {
  return Effect.gen(function* () {
    const asText = `CAST("${fieldName}" AS VARCHAR)`;
    const conditions: string[] = [`"${fieldName}" IS NULL`];
    if (!constraint.allowEmpty) {
      conditions.push(`TRIM(${asText}) = ''`);
    } else if (!constraint.allowWhitespace) {
      conditions.push(`(TRIM(${asText}) = '' AND LENGTH(${asText}) > 0)`);
    }

    const query = `
      SELECT _row_number, ${asText} as value
      FROM ${tableName}
      WHERE ${conditions.join(" OR ")}
      LIMIT ${maxViolations}
    `;

    const rows = yield* queryRows(connection, query);
    if (rows.length > 0) {
      const violations = rows.map((row) =>
        new RequiredFieldViolation({
          severity: requirementToSeverity(constraint.level),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: row.value == null ? "" : String(row.value),
          errorMessage: constraint.message || `Required field "${fieldName}" is empty or null`,
        })
      );
      return yield* Effect.fail(violations);
    }

    return validField(fieldName, specField.name);
  });
}

/**
 * Validate required constraints for a field.
 * Uses takeStrictest — after additive merge, multiple required constraints may
 * exist (spec + config). We validate the strictest one so config cannot weaken spec.
 */
export function validateRequiredConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  maxViolations = 100,
): Effect.Effect<ValidField, FieldViolation[]> {
  // After additive merge, multiple required constraints may exist (spec + config).
  // Resolve to the strictest one so config cannot weaken spec requirements.
  const requiredConstraints = (specField.constraints ?? []).filter(
    (c): c is RequiredConstraint => c._tag === "required",
  );
  const winner = strictestRequired(requiredConstraints);
  if (!winner) return Effect.succeed(validField(fieldName, specField.name));

  // Build a specField with only the strictest required constraint for validation
  const narrowed: SpecField = {
    ...specField,
    constraints: [winner],
  };
  return validateConstraintsByType(
    "required",
    findRequiredViolations,
    connection,
    tableName,
    fieldName,
    narrowed,
    maxViolations,
  );
}

interface FieldValidationContext {
  readonly isDbPrimaryKey: boolean;
  readonly maxViolations?: number;
}

export function validateField(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  context: FieldValidationContext,
): Effect.Effect<ValidField, FieldViolation[]> {
  return Effect.gen(function* () {
    const maxViolations = context.maxViolations ?? 100;

    const validators: Effect.Effect<ValidField, FieldViolation[]>[] = [
      validateRequiredConstraints(connection, tableName, fieldName, specField, maxViolations),
      validateRangeConstraints(connection, tableName, fieldName, specField, maxViolations),
      validateFormatConstraints(connection, tableName, fieldName, specField, maxViolations),
      validatePatternConstraints(connection, tableName, fieldName, specField, maxViolations),
      validateLengthConstraints(connection, tableName, fieldName, specField, maxViolations),
    ];

    const hasUniqueConstraint = specField.constraints?.some((c) => c._tag === "unique") ?? false;
    if (hasUniqueConstraint && !context.isDbPrimaryKey) {
      validators.push(
        validateUniqueness(connection, tableName, fieldName, specField, maxViolations),
      );
    }

    const violations: FieldViolation[] = [];
    for (const validator of validators) {
      const result = yield* Effect.result(validator);
      if (Result.isFailure(result)) {
        violations.push(...result.failure);
      }
    }

    if (violations.length > 0) {
      return yield* Effect.fail(violations);
    }

    return validField(fieldName, specField.name);
  });
}
