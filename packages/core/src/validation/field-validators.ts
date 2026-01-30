/**
 * Field Validators
 *
 * Validation functions for individual field constraints including
 * range validation, vocabulary validation, and uniqueness validation.
 *
 * @module validation/field-validators
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";

import type {
  EnforcementLevel,
  FieldDefinition,
  FieldViolation,
  ValidatorConfig,
  ValidField,
  VocabularyKey,
} from "@dwkt/domain";
import {
  enforcementToSeverity,
  getVocabularyValues,
  isValidVocabularyValue,
  RangeViolation,
  UniquenessViolation,
  vocabularyEnforcementToStandard,
  VocabularyViolation,
} from "@dwkt/domain";

/**
 * Create a ValidField result for a field that passed validation
 */
function validField(fieldName: string, targetName: string): ValidField {
  return { fieldName, targetName, status: "valid" };
}

/**
 * Find range violations for a single validator
 *
 * Validates a field against range constraints (min/max values).
 * Violations are returned in the error channel for Effect-based aggregation.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param validator - Range validator configuration
 * @param specField - Field definition from spec
 * @returns Effect that succeeds with ValidField or fails with RangeViolation[]
 */
export function findRangeViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  validator: ValidatorConfig,
  specField: FieldDefinition,
): Effect.Effect<ValidField, RangeViolation[]> {
  return Effect.gen(function* (_) {
    const { min, max, inclusive = true } = validator.params || {};

    // No range constraints - field is valid
    if (min === undefined && max === undefined) {
      return validField(fieldName, specField.name);
    }

    // Build range condition
    const conditions: string[] = [];
    if (min !== undefined) {
      conditions.push(
        inclusive ? `"${fieldName}" < ${min}` : `"${fieldName}" <= ${min}`,
      );
    }
    if (max !== undefined) {
      conditions.push(
        inclusive ? `"${fieldName}" > ${max}` : `"${fieldName}" >= ${max}`,
      );
    }

    const rangeCondition = conditions.join(" OR ");

    const query = `
      SELECT
        _row_number,
        "${fieldName}" as value
      FROM ${tableName}
      WHERE "${fieldName}" IS NOT NULL
        AND (${rangeCondition})
      LIMIT 100
    `;

    // SQL query execution should work - query failure is a defect
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
          enforcement: validator.enforcement,
          severity: enforcementToSeverity(validator.enforcement),
          fieldName,
          targetName: specField.name,
          rowNumber: Number(row._row_number),
          value: String(row.value),
          csvValue: String(row.value),
          errorMessage: validator.message || `Value out of range`,
          validatorType: validator.type,
          params: validator.params,
        })
      );
      return yield* _(Effect.fail(violations));
    }

    return validField(fieldName, specField.name);
  });
}

/**
 * Validate range constraints for a field
 *
 * Uses Effect.all with mode: "either" to run all range validators concurrently
 * and collect violations from the error channel.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param specField - Field definition from spec
 * @returns Effect that succeeds with ValidField or fails with FieldViolation[]
 */
export function validateRangeConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<ValidField, FieldViolation[]> {
  return Effect.gen(function* (_) {
    if (!specField.validators || !Array.isArray(specField.validators)) {
      return validField(fieldName, specField.name);
    }

    // Get range validators (now always ValidatorConfig[] after normalization)
    const rangeValidators = specField.validators.filter((v) => v.type === "range");

    if (rangeValidators.length === 0) {
      return validField(fieldName, specField.name);
    }

    // Build array of validation effects
    const validationEffects = rangeValidators.map((validator) => {
      // Normalize validator format: JSON schema may have min/max at top level,
      // but ValidatorConfig expects them under params
      // TODO: Don't cast here
      const validatorUnknown = validator as unknown as Record<string, unknown>;
      const normalizedValidator = {
        type: validator.type,
        enforcement: validator.enforcement || "required",
        message: validator.message,
        params: validator.params || {
          min: typeof validatorUnknown.min === "number" ? validatorUnknown.min : undefined,
          max: typeof validatorUnknown.max === "number" ? validatorUnknown.max : undefined,
          inclusive: typeof validatorUnknown.inclusive === "boolean"
            ? validatorUnknown.inclusive
            : true,
        },
      };

      return findRangeViolations(
        connection,
        tableName,
        fieldName,
        normalizedValidator,
        specField,
      );
    });

    // Run all validators concurrently, collecting both successes and failures
    const results = yield* _(
      Effect.all(validationEffects, { mode: "either", concurrency: "unbounded" }),
    );

    // Extract violations from Left results (failures)
    const violations: FieldViolation[] = [];
    for (const result of results) {
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
 * Find vocabulary violations using vocabulary key
 *
 * Validates a field against a controlled vocabulary.
 * Violations are returned in the error channel for Effect-based aggregation.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param vocabularyKey - Key for the controlled vocabulary
 * @param specField - Field definition from spec
 * @param enforcement - Enforcement level for violations
 * @param caseSensitive - Whether validation is case-sensitive
 * @returns Effect that succeeds with ValidField or fails with VocabularyViolation[]
 */
export function findVocabularyViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  vocabularyKey: VocabularyKey,
  specField: FieldDefinition,
  enforcement: EnforcementLevel,
  caseSensitive = false,
): Effect.Effect<ValidField, VocabularyViolation[]> {
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

    // SQL query execution should work - query failure is a defect
    const result = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(
        Effect.orDie,
      ),
    );

    const rows = result.getRowObjects();
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

      // Check if value is valid in vocabulary
      let isValid = false;
      if (caseSensitive) {
        isValid = isValidVocabularyValue(vocabularyKey, value);
      } else {
        const vocabValues = yield* _(
          getVocabularyValues(vocabularyKey).pipe(
            Effect.catchAll(() => Effect.succeed([] as readonly string[])),
          ),
        );
        const lowerValue = value.toLowerCase();
        isValid = (vocabValues as readonly string[]).some((v) => v.toLowerCase() === lowerValue);
      }

      if (!isValid) {
        // Add violation for each row with this invalid value
        for (const rowNum of rowNumbers) {
          violations.push(
            new VocabularyViolation({
              enforcement,
              severity: enforcementToSeverity(enforcement),
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
 * Validate controlled vocabulary for a field
 *
 * Validates a field against its controlled vocabulary configuration.
 * Violations are returned in the error channel for Effect-based aggregation.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param specField - Field definition from spec
 * @returns Effect that succeeds with ValidField or fails with FieldViolation[]
 */
export function validateVocabulary(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<ValidField, FieldViolation[]> {
  return Effect.gen(function* (_) {
    // After normalization, vocabulary config is always present if field has controlled vocabulary
    if (!specField.vocabulary) {
      return validField(fieldName, specField.name);
    }

    const { vocabularyKey, caseSensitive = false, enforcement = "strict" } = specField.vocabulary;

    // Skip validation for loose enforcement - any value is accepted
    if (enforcement === "loose") {
      return validField(fieldName, specField.name);
    }

    // Map vocabulary enforcement to standard enforcement level
    const standardEnforcement = vocabularyEnforcementToStandard(enforcement);

    // findVocabularyViolations fails with violations or succeeds with ValidField
    return yield* _(
      findVocabularyViolations(
        connection,
        tableName,
        fieldName,
        vocabularyKey as VocabularyKey,
        specField,
        standardEnforcement,
        caseSensitive,
      ),
    );
  });
}

/**
 * Find uniqueness violations
 *
 * Validates a field for uniqueness constraints.
 * Violations are returned in the error channel for Effect-based aggregation.
 *
 * Note: This "explodes" duplicate values into individual violations,
 * so a value duplicated 3 times creates 3 UniquenessViolations.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param specField - Field definition from spec
 * @param enforcement - Enforcement level for violations
 * @returns Effect that succeeds with ValidField or fails with UniquenessViolation[]
 */
export function findUniquenessViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
  enforcement: EnforcementLevel,
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
      LIMIT 100
    `;

    // SQL query execution should work - query failure is a defect
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

      // Create one violation per affected row
      for (const rowNum of affectedRows) {
        violations.push(
          new UniquenessViolation({
            enforcement,
            severity: enforcementToSeverity(enforcement),
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
 * Validate uniqueness for a field
 *
 * Validates a field for uniqueness constraints.
 * Violations are returned in the error channel for Effect-based aggregation.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param specField - Field definition from spec
 * @returns Effect that succeeds with ValidField or fails with FieldViolation[]
 */
export function validateUniqueness(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<ValidField, FieldViolation[]> {
  return Effect.gen(function* (_) {
    // Check if field has explicit uniqueness validator (already normalized)
    const uniqueValidator = specField.validators?.find((v) => v.type === "unique");
    const enforcement = uniqueValidator?.enforcement ?? "required";

    // findUniquenessViolations fails with violations or succeeds with ValidField
    return yield* _(
      findUniquenessViolations(
        connection,
        tableName,
        fieldName,
        specField,
        enforcement,
      ),
    );
  });
}

/**
 * Context for field validation decisions
 *
 * Provides information needed to determine which validators to run for a field.
 */
export interface FieldValidationContext {
  /** Raw field definition from profile (for hasEnumConstraint check) */
  readonly rawField?: {
    readonly type?: string;
    readonly values?: unknown;
    readonly unique?: string;
  };
  /** Schema table name (for isPrimaryKeyField check) */
  readonly schemaTableName: string;
  /** Whether the field has a controlled vocabulary */
  readonly hasControlledVocabulary: boolean;
}

/**
 * Validate all constraints for a single field
 *
 * Composes range, vocabulary, and uniqueness validators for a field,
 * running them sequentially and collecting any violations.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the source data table
 * @param fieldName - Name of the field in the source table (originName)
 * @param targetName - Name of the target Darwin Core field
 * @param specField - Merged field definition with validators
 * @param context - Additional context for validation decisions
 * @returns Effect that succeeds with ValidField or fails with FieldViolation[]
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
    const violations: FieldViolation[] = [];
    const result = validField(fieldName, targetName);

    // Helper to run a validator and collect any violations
    const collectViolations = <E extends FieldViolation[]>(
      effect: Effect.Effect<ValidField, E>,
    ): Effect.Effect<ValidField, never> =>
      effect.pipe(
        Effect.catchAll((v) => {
          violations.push(...v);
          return Effect.succeed(result);
        }),
      );

    // Range/constraint validation - always run
    yield* _(collectViolations(
      validateRangeConstraints(connection, tableName, fieldName, specField),
    ));

    // Vocabulary validation
    // Skip if this field was already validated as an ENUM constraint (has inline values)
    const hasEnumConstraint = context.rawField?.type === "controlled-vocabulary" &&
      context.rawField?.values;

    if (context.hasControlledVocabulary && !hasEnumConstraint) {
      yield* _(collectViolations(
        validateVocabulary(connection, tableName, fieldName, specField),
      ));
    }

    // Uniqueness validation for fields with explicit unique validators
    // Skip PKs because row-by-row INSERT queries for ALL duplicate rows
    const isPrimaryKeyField = targetName === context.schemaTableName + "ID" ||
      (targetName.endsWith("ID") && context.rawField?.unique === "true");

    const hasUniqueValidator = specField.validators
      ? specField.validators.some((v) =>
        typeof v === "string" ? v === "uniqueIdentifier" : v.type === "unique"
      )
      : false;

    if (hasUniqueValidator && !isPrimaryKeyField) {
      yield* _(collectViolations(
        validateUniqueness(connection, tableName, fieldName, specField),
      ));
    }

    if (violations.length > 0) {
      return yield* _(Effect.fail(violations));
    }

    return result;
  });
}
