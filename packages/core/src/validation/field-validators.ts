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

import type { Constraint, FieldDefinition } from "@dwkt/domain/specs";
import type { FieldViolation, ValidField } from "@dwkt/domain/types";
import {
  enforcementToSeverity,
  FormatViolation,
  LengthViolation,
  PatternViolation,
  RangeViolation,
  RequiredFieldViolation,
  UniquenessViolation,
  VocabularyViolation,
} from "@dwkt/domain/types";

/**
 * Create a ValidField result for a field that passed validation
 */
function validField(fieldName: string, targetName: string): ValidField {
  return { fieldName, targetName, status: "valid" };
}

/**
 * Find range violations for a single range constraint
 *
 * Validates a field against range bounds (min/max values).
 * Violations are returned in the error channel for Effect-based aggregation.
 */
export function findRangeViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { type: "range" },
  specField: FieldDefinition,
  maxViolations = 100,
): Effect.Effect<ValidField, RangeViolation[]> {
  return Effect.gen(function* (_) {
    const { min, max, inclusive = true } = constraint;

    // No range bounds - field is valid
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

    // Field existence verified upstream via information_schema check; query failure is a defect
    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(
        Effect.orDie,
      ),
    );

    const rows = result.getRowObjects();

    // If violations found, fail with array of RangeViolation objects
    if (rows.length > 0) {
      const violations = rows.map((row) =>
        new RangeViolation({
          enforcement: "required",
          severity: enforcementToSeverity("required"),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: String(row.value),
          csvValue: String(row.value),
          errorMessage: constraint.message || `Value out of range`,
          validatorType: constraint.type,
          params: { min: constraint.min, max: constraint.max },
        })
      );
      return yield* _(Effect.fail(violations));
    }

    return validField(fieldName, specField.name);
  });
}

/** Strictness ordering for enforcement levels (higher = stricter). */
const ENFORCEMENT_STRICTNESS: Record<string, number> = {
  required: 2,
  recommended: 1,
  optional: 0,
};

/**
 * Generic helper for the filter-loop-collect pattern shared by constraint validators.
 *
 * Filters constraints by type, runs the provided `findViolations` function for each,
 * and accumulates violations. When `takeStrictest` is true, only the constraint with
 * the strictest enforcement level is validated (used for `required` where multiple
 * constraints may exist after additive merge — prevents config from weakening spec).
 */
function validateConstraintsByType<TType extends Constraint["type"]>(
  constraintType: TType,
  findViolations: (
    connection: DuckDBConnection,
    tableName: string,
    fieldName: string,
    constraint: Extract<Constraint, { type: TType }>,
    specField: FieldDefinition,
    maxViolations: number,
  ) => Effect.Effect<ValidField, FieldViolation[]>,
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
  maxViolations: number,
  options?: { takeStrictest?: boolean },
): Effect.Effect<ValidField, FieldViolation[]> {
  return Effect.gen(function* (_) {
    const filtered = (specField.constraints ?? []).filter(
      (c): c is Extract<Constraint, { type: TType }> => c.type === constraintType,
    );
    if (filtered.length === 0) {
      return validField(fieldName, specField.name);
    }

    let toValidate = filtered;
    if (options?.takeStrictest && filtered.length > 1) {
      // takeStrictest is only used for "required" constraints which have enforcement
      const strictest = filtered.reduce((a, b) => {
        const aEnf = "enforcement" in a ? String(a.enforcement) : "";
        const bEnf = "enforcement" in b ? String(b.enforcement) : "";
        return (ENFORCEMENT_STRICTNESS[aEnf] ?? 0) >= (ENFORCEMENT_STRICTNESS[bEnf] ?? 0) ? a : b;
      });
      toValidate = [strictest];
    }

    const violations: FieldViolation[] = [];
    for (const constraint of toValidate) {
      const result = yield* _(Effect.either(
        findViolations(connection, tableName, fieldName, constraint, specField, maxViolations),
      ));
      if (result._tag === "Left") {
        violations.push(...result.left);
      }
    }

    if (violations.length > 0) {
      return yield* _(Effect.fail(violations));
    }

    return validField(fieldName, specField.name);
  });
}

/**
 * Validate range constraints for a field
 */
export function validateRangeConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
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
 * Find vocabulary violations for a field against a set of valid values.
 *
 * Validates a field against a controlled vocabulary.
 */
export function findVocabularyViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  values: readonly string[],
  specField: FieldDefinition,
  strictness: "strict" | "recommended" = "recommended",
  caseSensitive = false,
): Effect.Effect<ValidField, VocabularyViolation[]> {
  // strict → ERROR, recommended → WARNING
  const enforcement = strictness === "strict" ? "required" : "recommended";
  const severity = enforcementToSeverity(enforcement);

  return Effect.gen(function* (_) {
    // Get distinct values from the field with ordered row numbers
    const query = `
      SELECT
        "${fieldName}" as value,
        list(_row_number ORDER BY _row_number) as row_numbers
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
      GROUP BY "${fieldName}"
    `;

    // Field existence verified upstream via information_schema check; query failure is a defect
    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(
        Effect.orDie,
      ),
    );

    const rows = result.getRowObjects();

    // For case-insensitive matching, pre-compute lowercase set
    const lowerSet = caseSensitive ? null : new Set(values.map((v) => v.toLowerCase()));

    const violations: VocabularyViolation[] = [];

    for (const row of rows) {
      const value = String(row.value);
      const rawRowNumbers = row.row_numbers;

      let rowNumbers: number[] = [];
      if (Array.isArray(rawRowNumbers)) {
        rowNumbers = rawRowNumbers.map((n) => Number(n));
      } else if (
        rawRowNumbers && typeof rawRowNumbers === "object" &&
        "items" in rawRowNumbers
      ) {
        rowNumbers = (rawRowNumbers as { items: unknown[] }).items.map((n) => Number(n));
      }

      const isValid = caseSensitive ? values.includes(value) : lowerSet!.has(value.toLowerCase());

      if (!isValid) {
        for (const rowNum of rowNumbers) {
          violations.push(
            new VocabularyViolation({
              enforcement,
              severity,
              fieldName,
              targetName: specField.name,
              rowNumber: Number(rowNum),
              value,
              csvValue: value,
              errorMessage: `Invalid vocabulary value: "${value}"`,
              validatorType: "vocabulary",
            }),
          );
        }
      }
    }

    if (violations.length > 0) {
      return yield* _(Effect.fail(violations));
    }

    return validField(fieldName, specField.name);
  });
}

/**
 * Find vocabulary constraint violations for a single vocabulary constraint.
 *
 * Matches the signature expected by validateConstraintsByType.
 */
export function findVocabularyConstraintViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { type: "vocabulary" },
  specField: FieldDefinition,
  _maxViolations = 100,
): Effect.Effect<ValidField, VocabularyViolation[]> {
  const { values, caseSensitive = false, strictness = "recommended" } = constraint;
  return findVocabularyViolations(
    connection,
    tableName,
    fieldName,
    values,
    specField,
    strictness,
    caseSensitive,
  );
}

/**
 * Validate controlled vocabulary for a field.
 *
 * All vocabulary constraints are checked (tightening semantics). If spec
 * defines a vocabulary at "recommended" and config adds one at "required",
 * both are validated — a bad value produces violations at both severity levels.
 *
 * Optional enforcement flows through with info severity (no early skip),
 * matching the behavior of range, format, pattern, and length validators.
 */
export function validateVocabulary(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
  maxViolations = 100,
): Effect.Effect<ValidField, FieldViolation[]> {
  return validateConstraintsByType(
    "vocabulary",
    findVocabularyConstraintViolations,
    connection,
    tableName,
    fieldName,
    specField,
    maxViolations,
  );
}

/**
 * Find uniqueness violations
 *
 * Validates a field for uniqueness constraints.
 * Note: This "explodes" duplicate values into individual violations,
 * so a value duplicated 3 times creates 3 UniquenessViolations.
 */
export function findUniquenessViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
  maxViolations = 100,
): Effect.Effect<ValidField, UniquenessViolation[]> {
  return Effect.gen(function* (_) {
    // Query to find duplicate values with ordered row numbers
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

    // Field existence verified upstream via information_schema check; query failure is a defect
    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(
        Effect.orDie,
      ),
    );

    const rows = result.getRowObjects();
    const violations: UniquenessViolation[] = [];

    // Explode each duplicate value into individual violations (one per row)
    for (const row of rows) {
      const value = String(row.duplicate_value);

      // Handle DuckDB LIST type for affected_rows
      let affectedRows: number[] = [];
      const raw = row.affected_rows;
      if (Array.isArray(raw)) {
        affectedRows = raw.map((n) => Number(n));
      } else if (raw && typeof raw === "object" && "items" in raw) {
        affectedRows = (raw as { items: unknown[] }).items.map((n) => Number(n));
      }

      // Create one violation per affected row — uniqueness is always an error
      for (const rowNum of affectedRows) {
        violations.push(
          new UniquenessViolation({
            enforcement: "required",
            severity: enforcementToSeverity("required"),
            fieldName,
            targetName: specField.name,
            rowNumber: Number(rowNum),
            value,
            csvValue: value,
            errorMessage: `Duplicate value: "${value}"`,
            validatorType: "unique",
          }),
        );
      }
    }

    if (violations.length > 0) {
      return yield* _(Effect.fail(violations));
    }

    return validField(fieldName, specField.name);
  });
}

/**
 * Find uniqueness constraint violations for a single unique constraint.
 *
 * Matches the signature expected by validateConstraintsByType.
 */
function findUniquenessConstraintViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  _constraint: Constraint & { type: "unique" },
  specField: FieldDefinition,
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

/**
 * Validate uniqueness for a field.
 *
 * All unique constraints are checked via validateConstraintsByType,
 * consistent with the tightening semantics used by other constraint types.
 */
export function validateUniqueness(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
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

// =============================================================================
// Format Validators
// =============================================================================

/**
 * SQL condition for each format type.
 * Returns a WHERE clause fragment that matches INVALID values.
 *
 * IMPORTANT: All string operations CAST to VARCHAR first because the raw table
 * uses read_csv_auto() which auto-detects types (DATE, DOUBLE, etc.).
 * Applying TRY_STRPTIME or regexp_matches on non-VARCHAR columns can crash DuckDB.
 */
function formatSqlCondition(fieldName: string, format: string): string | undefined {
  // Use CAST to VARCHAR for all string operations to avoid crashes on auto-typed columns
  const asText = `CAST("${fieldName}" AS VARCHAR)`;
  switch (format) {
    case "iso8601":
      // Accept single dates and date ranges (YYYY-MM-DD/YYYY-MM-DD)
      // TRY_STRPTIME handles single dates; regex handles ranges
      return `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND TRY_STRPTIME(${asText}, '%Y-%m-%d') IS NULL
        AND TRY_STRPTIME(${asText}, '%Y-%m-%dT%H:%M:%S') IS NULL
        AND TRY_STRPTIME(${asText}, '%Y-%m-%dT%H:%M:%SZ') IS NULL
        AND TRY_STRPTIME(${asText}, '%Y-%m') IS NULL
        AND TRY_STRPTIME(${asText}, '%Y') IS NULL
        AND NOT regexp_matches(${asText}, '^\\d{4}-\\d{2}-\\d{2}/\\d{4}-\\d{2}-\\d{2}$')`;
    case "url":
      return `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND NOT regexp_matches(${asText}, '^https?://[^\\s]+$')`;
    case "uuid":
      return `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND NOT regexp_matches(${asText}, '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')`;
    case "decimal-degrees":
      return `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND TRY_CAST(${asText} AS DOUBLE) IS NULL`;
    case "integer":
      return `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND TRY_CAST(${asText} AS INTEGER) IS NULL`;
    case "email":
      return `"${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND NOT regexp_matches(${asText}, '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')`;
    default:
      return undefined;
  }
}

/**
 * Find format violations for a single format constraint
 */
export function findFormatViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { type: "format" },
  specField: FieldDefinition,
  maxViolations = 100,
): Effect.Effect<ValidField, FormatViolation[]> {
  return Effect.gen(function* (_) {
    const condition = formatSqlCondition(fieldName, constraint.format);
    if (!condition) {
      return validField(fieldName, specField.name);
    }

    const query = `
      SELECT _row_number, CAST("${fieldName}" AS VARCHAR) as value
      FROM ${tableName}
      WHERE ${condition}
      LIMIT ${maxViolations}
    `;

    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
    );

    const rows = result.getRowObjects();
    if (rows.length > 0) {
      const violations = rows.map((row) =>
        new FormatViolation({
          enforcement: "required",
          severity: enforcementToSeverity("required"),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: String(row.value),
          csvValue: String(row.value),
          errorMessage: constraint.message ||
            `Value "${String(row.value)}" does not match ${constraint.format} format`,
          validatorType: "format",
          format: constraint.format,
        })
      );
      return yield* _(Effect.fail(violations));
    }

    return validField(fieldName, specField.name);
  });
}

/**
 * Validate format constraints for a field
 */
export function validateFormatConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
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

// =============================================================================
// Pattern Validators
// =============================================================================

/**
 * Find pattern violations for a single pattern constraint
 */
export function findPatternViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { type: "pattern" },
  specField: FieldDefinition,
  maxViolations = 100,
): Effect.Effect<ValidField, PatternViolation[]> {
  return Effect.gen(function* (_) {
    // DuckDB regexp_matches uses POSIX regex
    // CAST to VARCHAR because raw table may have auto-detected non-string types
    const asText = `CAST("${fieldName}" AS VARCHAR)`;
    const query = `
      SELECT _row_number, ${asText} as value
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
        AND TRIM(${asText}) != ''
        AND NOT regexp_matches(${asText}, '${constraint.pattern.replace(/'/g, "''")}')
      LIMIT ${maxViolations}
    `;

    // Catch invalid regex patterns and return a user-friendly error instead of crashing
    const queryResult = yield* _(Effect.either(
      Effect.tryPromise(() => connection.runAndReadAll(query)),
    ));

    if (queryResult._tag === "Left") {
      const errorMsg = queryResult.left instanceof Error
        ? queryResult.left.message
        : String(queryResult.left);
      return yield* _(Effect.fail([
        new PatternViolation({
          enforcement: "required",
          severity: enforcementToSeverity("required"),
          fieldName,
          targetName: specField.name,
          rowNumber: 0,
          value: "",
          errorMessage: `Invalid regex pattern "/${constraint.pattern}/": ${errorMsg}`,
          validatorType: "pattern",
          pattern: constraint.pattern,
          flags: constraint.flags,
        }),
      ]));
    }

    const rows = queryResult.right.getRowObjects();
    if (rows.length > 0) {
      const violations = rows.map((row) =>
        new PatternViolation({
          enforcement: "required",
          severity: enforcementToSeverity("required"),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: String(row.value),
          csvValue: String(row.value),
          errorMessage: constraint.message ||
            `Value "${String(row.value)}" does not match pattern /${constraint.pattern}/`,
          validatorType: "pattern",
          pattern: constraint.pattern,
          flags: constraint.flags,
        })
      );
      return yield* _(Effect.fail(violations));
    }

    return validField(fieldName, specField.name);
  });
}

/**
 * Validate pattern constraints for a field
 */
export function validatePatternConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
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

// =============================================================================
// Length Validators
// =============================================================================

/**
 * Find length violations for a single length constraint
 */
export function findLengthViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { type: "length" },
  specField: FieldDefinition,
  maxViolations = 100,
): Effect.Effect<ValidField, LengthViolation[]> {
  return Effect.gen(function* (_) {
    const { minLength, maxLength } = constraint;
    if (minLength === undefined && maxLength === undefined) {
      return validField(fieldName, specField.name);
    }

    // CAST to VARCHAR because raw table may have auto-detected non-string types
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

    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
    );

    const rows = result.getRowObjects();
    if (rows.length > 0) {
      const violations = rows.map((row) =>
        new LengthViolation({
          enforcement: "required",
          severity: enforcementToSeverity("required"),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: String(row.value),
          csvValue: String(row.value),
          errorMessage: constraint.message ||
            `Value length ${row.actual_length} is outside bounds [${minLength ?? ""}..${
              maxLength ?? ""
            }]`,
          validatorType: "length",
          params: {
            minLength,
            maxLength,
            actualLength: Number(row.actual_length),
          },
        })
      );
      return yield* _(Effect.fail(violations));
    }

    return validField(fieldName, specField.name);
  });
}

/**
 * Validate length constraints for a field
 */
export function validateLengthConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
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

// =============================================================================
// Required Validators
// =============================================================================

/**
 * Find required field violations
 */
export function findRequiredViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  constraint: Constraint & { type: "required" },
  specField: FieldDefinition,
  maxViolations = 100,
): Effect.Effect<ValidField, RequiredFieldViolation[]> {
  return Effect.gen(function* (_) {
    // CAST to VARCHAR because raw table may have auto-detected non-string types
    const asText = `CAST("${fieldName}" AS VARCHAR)`;
    const conditions: string[] = [`"${fieldName}" IS NULL`];
    if (!constraint.allowEmpty) {
      conditions.push(`TRIM(${asText}) = ''`);
    } else if (!constraint.allowWhitespace) {
      // allowEmpty is true but whitespace-only strings are not allowed
      conditions.push(`(TRIM(${asText}) = '' AND LENGTH(${asText}) > 0)`);
    }

    const query = `
      SELECT _row_number, ${asText} as value
      FROM ${tableName}
      WHERE ${conditions.join(" OR ")}
      LIMIT ${maxViolations}
    `;

    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
    );

    const rows = result.getRowObjects();
    if (rows.length > 0) {
      const violations = rows.map((row) =>
        new RequiredFieldViolation({
          enforcement: constraint.enforcement,
          severity: enforcementToSeverity(constraint.enforcement),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: row.value == null ? "" : String(row.value),
          csvValue: row.value == null ? "" : String(row.value),
          errorMessage: constraint.message || `Required field "${fieldName}" is empty or null`,
          validatorType: "required",
        })
      );
      return yield* _(Effect.fail(violations));
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
  specField: FieldDefinition,
  maxViolations = 100,
): Effect.Effect<ValidField, FieldViolation[]> {
  return validateConstraintsByType(
    "required",
    findRequiredViolations,
    connection,
    tableName,
    fieldName,
    specField,
    maxViolations,
    { takeStrictest: true },
  );
}

/**
 * Context for field validation decisions
 */
export interface FieldValidationContext {
  /** Whether DuckDB enforces uniqueness via PRIMARY KEY (skip software validation) */
  readonly isDbPrimaryKey: boolean;
  /** Maximum violations per field (default: 100) */
  readonly maxViolations?: number;
}

/**
 * Validate all constraints for a single field
 *
 * Builds a list of applicable validators and runs them sequentially,
 * accumulating violations via Effect.either.
 */
export function validateField(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  targetName: string,
  specField: FieldDefinition,
  context: FieldValidationContext,
): Effect.Effect<ValidField, FieldViolation[]> {
  return Effect.gen(function* (_) {
    const maxViolations = context.maxViolations ?? 100;

    // Build list of applicable constraint validators
    const validators: Effect.Effect<ValidField, FieldViolation[]>[] = [
      validateRequiredConstraints(connection, tableName, fieldName, specField, maxViolations),
      validateRangeConstraints(connection, tableName, fieldName, specField, maxViolations),
      validateFormatConstraints(connection, tableName, fieldName, specField, maxViolations),
      validatePatternConstraints(connection, tableName, fieldName, specField, maxViolations),
      validateLengthConstraints(connection, tableName, fieldName, specField, maxViolations),
    ];

    // Vocabulary validation — runs when spec defines a vocabulary for the field
    const hasVocabularyConstraint = specField.constraints?.some((c) => c.type === "vocabulary") ??
      false;
    if (hasVocabularyConstraint) {
      validators.push(
        validateVocabulary(connection, tableName, fieldName, specField, maxViolations),
      );
    }

    // Uniqueness validation — skip when DuckDB enforces via PRIMARY KEY
    const hasUniqueConstraint = specField.constraints?.some((c) => c.type === "unique") ?? false;
    if (hasUniqueConstraint && !context.isDbPrimaryKey) {
      validators.push(
        validateUniqueness(connection, tableName, fieldName, specField, maxViolations),
      );
    }

    // Run validators sequentially, accumulating violations
    const violations: FieldViolation[] = [];
    for (const validator of validators) {
      const result = yield* _(Effect.either(validator));
      if (result._tag === "Left") {
        violations.push(...result.left);
      }
    }

    if (violations.length > 0) {
      return yield* _(Effect.fail(violations));
    }

    return validField(fieldName, targetName);
  });
}
