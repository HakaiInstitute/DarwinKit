/**
 * Field Validators
 *
 * SQL-based validators for field constraints. Each validator runs queries
 * against the raw table created by `read_csv_auto(..., all_varchar=true)`, so
 * every column is loaded as VARCHAR and validators see the original CSV text.
 *
 * ## Column Type Strategy
 *
 * Because the validation raw table is all-VARCHAR, the string-function
 * validators (TRY_STRPTIME, regexp_matches, TRIM, LENGTH) and the numeric
 * validators (TRY_CAST to DOUBLE/INTEGER) operate on the original, un-coerced
 * values. The `CAST(... AS VARCHAR)` wrappers are kept as defensive no-ops so
 * the validators also behave correctly if handed an auto-typed table (e.g. in
 * unit tests that create typed columns directly).
 *
 * `findTypeViolations` flags values that should be numeric but aren't — a gap
 * only the all-VARCHAR table can expose, since auto-typing would otherwise
 * coerce such values to NULL before any validator saw them.
 *
 * @module validation/field-validators
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Result from "effect/Result";

import type { Constraint, ConstraintFormat, SpecField } from "@dwkit/domain/specs";
import { type RequiredConstraint, strictestRequired } from "@dwkit/domain/specs";
import type { FieldViolation, Severity, ValidField } from "@dwkit/domain/types";
import {
  EnumViolation,
  FormatViolation,
  LengthViolation,
  PatternViolation,
  PrimaryKeyViolation,
  RangeViolation,
  RequiredFieldViolation,
  requirementToSeverity,
  TypeViolation,
  UniquenessViolation,
} from "@dwkit/domain/types";
import { queryRows } from "../loading/sql.ts";
import { findSuggestedValue } from "./string-matching.ts";

function validField(fieldName: string, targetName: string): ValidField {
  return { fieldName, targetName, status: "valid" };
}

export const DEFAULT_MAX_VIOLATIONS = 100;

/**
 * SQL fragment matching values that are NOT valid integers. String/regexp based
 * so it accepts arbitrarily large integers (no INT32/INT64 overflow) and rejects
 * decimals, scientific notation, underscores, and inf/nan — unlike
 * `TRY_CAST AS INTEGER`, which rounds '1.5'→2 and NULLs values above INT32.
 */
function invalidIntegerSql(asText: string): string {
  return `NOT regexp_full_match(TRIM(${asText}), '^-?[0-9]+$')`;
}

/**
 * SQL fragment matching values that are NOT valid finite numbers.
 * `TRY_CAST AS DOUBLE` parses 'inf'/'nan', so guard explicitly with isnan()/isinf().
 */
function invalidDoubleSql(asText: string): string {
  const d = `TRY_CAST(${asText} AS DOUBLE)`;
  return `(${d} IS NULL OR isnan(${d}) OR isinf(${d}))`;
}

/**
 * SQL fragment (boolean) matching a single ISO-8601 date/datetime.
 *
 * A trailing timezone (`Z` or `±HH:MM` / `±HHMM`) is stripped and the date/time
 * separator normalized to `T`, so one compact TRY_STRPTIME set covers Z-,
 * offset-, space- and T-separated forms. TRY_STRPTIME enforces calendar validity
 * (rejects 2024-02-30, leap-year aware) and requires the whole string to match,
 * so partial forms (`%Y`, `%Y-%m`) don't accept longer strings.
 *
 * Not handled here (left to the future ISO-8601 UDF): abbreviated-end intervals
 * (`2007-11-13/15`) and bare-hour offsets (`-06`).
 */
function validIso8601SingleSql(expr: string): string {
  const norm =
    `replace(regexp_replace(TRIM(${expr}), '(Z|[+-][0-9]{2}:?[0-9]{2})$', ''), ' ', 'T')`;
  const formats = [
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M",
    "%Y-%m-%d",
    "%Y-%m",
    "%Y",
  ];
  return `(${formats.map((f) => `TRY_STRPTIME(${norm}, '${f}') IS NOT NULL`).join(" OR ")})`;
}

/**
 * SQL fragment (boolean) matching a valid ISO-8601 single value OR a two-part
 * interval (start/end) whose endpoints are each independently valid, so a
 * calendar-invalid endpoint (`2024-01-15/2024-02-30`) is rejected.
 */
function validIso8601Sql(expr: string): string {
  const interval = `(regexp_full_match(TRIM(${expr}), '[^/]+/[^/]+')` +
    ` AND ${validIso8601SingleSql(`split_part(TRIM(${expr}), '/', 1)`)}` +
    ` AND ${validIso8601SingleSql(`split_part(TRIM(${expr}), '/', 2)`)})`;
  return `(${validIso8601SingleSql(expr)} OR ${interval})`;
}

export function findRangeViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { _tag: "range" },
  specField: SpecField,
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
        AND NOT isnan(${asNum})
        AND NOT isinf(${asNum})
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
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
 * Parse the DuckDB `list(...)` column from a GROUP BY query into row numbers.
 * `queryRows` reads via getRowObjectsJson, so a LIST is always a plain JS array.
 */
function parseAffectedRows(raw: unknown): number[] {
  return Array.isArray(raw) ? raw.map((n) => Number(n)) : [];
}

/**
 * "Explodes" duplicate values into individual violations per affected row.
 */
export function findUniquenessViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
      const affectedRows = parseAffectedRows(row.affected_rows);

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
      return yield* Effect.fail(violations.slice(0, maxViolations));
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
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
 * Replaces DDL `PRIMARY KEY`. Reports both null/empty primary keys
 * (`constraintType: "null"`) and duplicate primary keys
 * (`constraintType: "duplicate"`), one violation per affected row.
 */
export function findPrimaryKeyViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  maxViolations = DEFAULT_MAX_VIOLATIONS,
): Effect.Effect<ValidField, PrimaryKeyViolation[]> {
  return Effect.gen(function* () {
    const asText = `CAST("${fieldName}" AS VARCHAR)`;
    const violations: PrimaryKeyViolation[] = [];

    // PRIMARY KEY implies NOT NULL — null/empty keys are violations.
    const nullRows = yield* queryRows(
      connection,
      `
      SELECT _row_number
      FROM ${tableName}
      WHERE "${fieldName}" IS NULL OR TRIM(${asText}) = ''
      ORDER BY _row_number
      LIMIT ${maxViolations}
    `,
    );
    for (const row of nullRows) {
      violations.push(
        new PrimaryKeyViolation({
          severity: requirementToSeverity("required"),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: "",
          constraintType: "null",
          errorMessage: `Primary key "${fieldName}" cannot be null or empty`,
        }),
      );
    }

    // Duplicate keys — one violation per affected row.
    const dupRows = yield* queryRows(
      connection,
      `
      SELECT
        ${asText} AS value,
        COUNT(*) AS occurrence_count,
        list(_row_number ORDER BY _row_number) AS affected_rows
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL AND TRIM(${asText}) != ''
      GROUP BY ${asText}
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, value
      LIMIT ${maxViolations}
    `,
    );
    for (const row of dupRows) {
      const value = String(row.value);
      const duplicateCount = Number(row.occurrence_count);
      for (const rowNum of parseAffectedRows(row.affected_rows)) {
        violations.push(
          new PrimaryKeyViolation({
            severity: requirementToSeverity("required"),
            fieldName,
            targetName: specField.name,
            rowNumber: rowNum,
            value,
            constraintType: "duplicate",
            duplicateCount,
            errorMessage: `Duplicate primary key: "${value}"`,
          }),
        );
      }
    }

    if (violations.length > 0) {
      return yield* Effect.fail(violations.slice(0, maxViolations));
    }
    return validField(fieldName, specField.name);
  });
}

export interface VocabularyCheck {
  readonly allowedValues: readonly string[];
  readonly enumType: string;
  readonly severity: Severity;
  readonly enableSuggestions: boolean;
}

export function findVocabularyViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  check: VocabularyCheck,
  maxViolations = DEFAULT_MAX_VIOLATIONS,
): Effect.Effect<ValidField, EnumViolation[]> {
  return Effect.gen(function* () {
    if (check.allowedValues.length === 0) {
      return validField(fieldName, specField.name);
    }

    const asText = `CAST("${fieldName}" AS VARCHAR)`;
    // Bind allowed values as parameters (DuckDB escapes them) instead of
    // interpolating: one placeholder per value for the NOT IN list.
    const placeholders = check.allowedValues.map(() => "?").join(", ");

    const query = `
      SELECT _row_number, ${asText} AS value
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND ${asText} NOT IN (${placeholders})
      LIMIT ${maxViolations}
    `;

    const rows = yield* queryRows(connection, query, [...check.allowedValues]);
    if (rows.length > 0) {
      const allowed = [...check.allowedValues];
      const violations = rows.map((row) => {
        const value = String(row.value);
        const suggestedValue = check.enableSuggestions
          ? findSuggestedValue(value, allowed)
          : undefined;
        return new EnumViolation({
          severity: check.severity,
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value,
          enumType: check.enumType,
          allowedValues: check.allowedValues,
          suggestedValue,
          errorMessage: suggestedValue
            ? `Invalid value "${value}" (did you mean "${suggestedValue}"?)`
            : `Invalid value "${value}" (must be one of: ${check.allowedValues.join(", ")})`,
        });
      });
      return yield* Effect.fail(violations);
    }

    return validField(fieldName, specField.name);
  });
}

export function findTypeViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  duckType: "INTEGER" | "DOUBLE",
  severity: Severity,
  maxViolations = DEFAULT_MAX_VIOLATIONS,
): Effect.Effect<ValidField, TypeViolation[]> {
  return Effect.gen(function* () {
    const asText = `CAST("${fieldName}" AS VARCHAR)`;
    const invalidCondition = duckType === "INTEGER"
      ? invalidIntegerSql(asText)
      : invalidDoubleSql(asText);

    const query = `
      SELECT _row_number, ${asText} AS value
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND ${invalidCondition}
      LIMIT ${maxViolations}
    `;

    const rows = yield* queryRows(connection, query);
    if (rows.length > 0) {
      const label = duckType === "DOUBLE" ? "number" : "integer";
      const violations = rows.map((row) =>
        new TypeViolation({
          severity,
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: String(row.value),
          errorMessage: `Value "${String(row.value)}" is not a valid ${label}`,
          expectedType: duckType,
        })
      );
      return yield* Effect.fail(violations);
    }

    return validField(fieldName, specField.name);
  });
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
    // Accept single ISO-8601 dates/datetimes (with tz) and two-part intervals.
    Match.when("iso8601", () =>
      `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND NOT ${validIso8601Sql(asText)}`),
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
        AND ${invalidDoubleSql(asText)}`),
    Match.when("integer", () =>
      `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND ${invalidIntegerSql(asText)}`),
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
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
  maxViolations = DEFAULT_MAX_VIOLATIONS,
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
  readonly numericType?: "INTEGER" | "DOUBLE";
  readonly numericSeverity?: Severity;
  readonly vocabulary?: VocabularyCheck;
}

export function validateField(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: SpecField,
  context: FieldValidationContext,
): Effect.Effect<ValidField, FieldViolation[]> {
  return Effect.gen(function* () {
    const maxViolations = context.maxViolations ?? DEFAULT_MAX_VIOLATIONS;

    // When this field is validated as a number, findTypeViolations owns numeric
    // validity (with obligation-derived severity), so suppress the equivalent
    // format check to avoid double-reporting one bad value under two tags.
    const coveringFormat: ConstraintFormat | undefined = context.numericType === "INTEGER"
      ? "integer"
      : context.numericType === "DOUBLE"
      ? "decimal-degrees"
      : undefined;
    const formatSpecField: SpecField = coveringFormat
      ? {
        ...specField,
        constraints: (specField.constraints ?? []).filter(
          (c) => !(c._tag === "format" && c.format === coveringFormat),
        ),
      }
      : specField;

    const validators: Effect.Effect<ValidField, FieldViolation[]>[] = [
      validateRangeConstraints(connection, tableName, fieldName, specField, maxViolations),
      validateFormatConstraints(connection, tableName, fieldName, formatSpecField, maxViolations),
      validatePatternConstraints(connection, tableName, fieldName, specField, maxViolations),
      validateLengthConstraints(connection, tableName, fieldName, specField, maxViolations),
    ];

    if (context.isDbPrimaryKey) {
      // Primary key owns presence + uniqueness (null + duplicate) -> PrimaryKeyViolation.
      validators.push(
        findPrimaryKeyViolations(connection, tableName, fieldName, specField, maxViolations),
      );
    } else {
      validators.unshift(
        validateRequiredConstraints(connection, tableName, fieldName, specField, maxViolations),
      );
      const hasUniqueConstraint = specField.constraints?.some((c) => c._tag === "unique") ?? false;
      if (hasUniqueConstraint) {
        validators.push(
          validateUniqueness(connection, tableName, fieldName, specField, maxViolations),
        );
      }
    }

    if (context.vocabulary) {
      validators.push(
        findVocabularyViolations(
          connection,
          tableName,
          fieldName,
          specField,
          context.vocabulary,
          maxViolations,
        ),
      );
    }

    if (context.numericType) {
      validators.push(
        findTypeViolations(
          connection,
          tableName,
          fieldName,
          specField,
          context.numericType,
          context.numericSeverity ?? requirementToSeverity("required"),
          maxViolations,
        ),
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
