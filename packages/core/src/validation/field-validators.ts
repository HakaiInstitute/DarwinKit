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
  ValidationViolation,
  ValidatorConfig,
  VocabularyEnforcement,
  VocabularyKey,
} from "@dwkt/domain";
import {
  enforcementToSeverity,
  getVocabularyValues,
  isValidVocabularyValue,
  RangeViolation,
  UniquenessViolation,
  VocabularyViolation,
} from "@dwkt/domain";

import { WorkspaceValidationError } from "./workspace-validator.ts";

/**
 * Map VocabularyEnforcement to EnforcementLevel
 *
 * Converts vocabulary-specific enforcement to standard enforcement levels:
 * - strict → required (ERROR)
 * - recommended → recommended (WARNING)
 * - loose → optional (no violations generated - any value accepted)
 */
export function vocabularyEnforcementToStandard(
  vocabEnforcement: VocabularyEnforcement,
): EnforcementLevel {
  switch (vocabEnforcement) {
    case "strict":
      return "required";
    case "recommended":
      return "recommended";
    case "loose":
      return "optional";
  }
}

/**
 * Find range violations for a single validator
 *
 * Returns fully-formed RangeViolation objects with all metadata.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param validator - Range validator configuration
 * @param specField - Field definition from spec
 * @returns Array of RangeViolation objects
 */
export function findRangeViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  validator: ValidatorConfig,
  specField: FieldDefinition,
): Effect.Effect<RangeViolation[], never> {
  return Effect.gen(function* (_) {
    const { min, max, inclusive = true } = validator.params || {};

    if (min === undefined && max === undefined) return [];

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

    // Return fully-formed RangeViolation objects
    return rows.map((row) =>
      new RangeViolation({
        enforcement: validator.enforcement,
        severity: enforcementToSeverity(validator.enforcement),
        fieldName,
        targetName: specField.name,
        rowNumber: Number(row._row_number),
        value: String(row.value),
        errorMessage: validator.message || `Value out of range`,
        validatorType: validator.type,
        params: validator.params,
      })
    );
  });
}

/**
 * Validate range constraints for a field
 *
 * Calls findRangeViolations() for each range validator.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param specField - Field definition from spec
 * @returns Array of ValidationViolation objects
 */
export function validateRangeConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<ValidationViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const violations: ValidationViolation[] = [];

    if (!specField.validators || !Array.isArray(specField.validators)) {
      return violations;
    }

    // Get range validators (now always ValidatorConfig[] after normalization)
    const rangeValidators = specField.validators.filter((v) => v.type === "range");

    for (const validator of rangeValidators) {
      // Normalize validator format: JSON schema may have min/max at top level,
      // but ValidatorConfig expects them under params
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

      const rangeViolations = yield* _(
        findRangeViolations(
          connection,
          tableName,
          fieldName,
          normalizedValidator,
          specField,
        ),
      );

      violations.push(...rangeViolations);
    }

    return violations;
  });
}

/**
 * Find vocabulary violations using vocabulary key
 *
 * Returns fully-formed VocabularyViolation objects with all metadata.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param vocabularyKey - Key for the controlled vocabulary
 * @param specField - Field definition from spec
 * @param enforcement - Enforcement level for violations
 * @param caseSensitive - Whether validation is case-sensitive
 * @returns Array of VocabularyViolation objects
 */
export function findVocabularyViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  vocabularyKey: VocabularyKey,
  specField: FieldDefinition,
  enforcement: EnforcementLevel,
  caseSensitive = false,
): Effect.Effect<VocabularyViolation[], WorkspaceValidationError> {
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
              errorMessage: `Invalid vocabulary value: "${value}"`,
              validatorType: "vocabulary",
            }),
          );
        }
      }
    }

    return violations;
  });
}

/**
 * Validate controlled vocabulary for a field
 *
 * Returns ValidationViolation[] for new enforcement-aware infrastructure.
 * Also returns old format for backward compatibility.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param specField - Field definition from spec
 * @returns Object with enriched and legacy violation formats
 */
export function validateVocabulary(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<
  {
    enriched: ValidationViolation[];
    legacy: Array<
      { rowNumber: number; value: string; suggestedValues?: string[] }
    >;
  },
  WorkspaceValidationError
> {
  return Effect.gen(function* (_) {
    // After normalization, vocabulary config is always present if field has controlled vocabulary
    if (!specField.vocabulary) {
      return { enriched: [], legacy: [] };
    }

    const { vocabularyKey, caseSensitive = false, enforcement = "strict" } = specField.vocabulary;

    // Skip validation for loose enforcement - any value is accepted
    if (enforcement === "loose") {
      return { enriched: [], legacy: [] };
    }

    // Map vocabulary enforcement to standard enforcement level
    const standardEnforcement = vocabularyEnforcementToStandard(enforcement);

    // Get fully-formed violations
    const enriched = yield* _(
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

    // Also return legacy format for backward compatibility
    const legacy = enriched.map((v) => ({
      rowNumber: v.rowNumber,
      value: v.value,
      suggestedValues: v.suggestedValues ? [...v.suggestedValues] : undefined,
    }));

    return { enriched, legacy };
  });
}

/**
 * Find uniqueness violations
 *
 * Returns fully-formed UniquenessViolation objects with all metadata.
 *
 * Note: This "explodes" duplicate values into individual violations,
 * so a value duplicated 3 times creates 3 UniquenessViolations.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param specField - Field definition from spec
 * @param enforcement - Enforcement level for violations
 * @returns Array of UniquenessViolation objects
 */
export function findUniquenessViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
  enforcement: EnforcementLevel,
): Effect.Effect<UniquenessViolation[], WorkspaceValidationError> {
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
            errorMessage: `Duplicate value: "${value}"`,
            validatorType: "unique",
          }),
        );
      }
    }

    return violations;
  });
}

/**
 * Validate uniqueness for a field
 *
 * Returns ValidationViolation[] for new enforcement-aware infrastructure.
 * Also returns old format for backward compatibility.
 *
 * @param connection - DuckDB connection
 * @param tableName - Name of the table to query
 * @param fieldName - Name of the field to validate
 * @param specField - Field definition from spec
 * @returns Object with enriched and legacy violation formats
 */
export function validateUniqueness(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<
  {
    enriched: ValidationViolation[];
    legacy: Array<{
      duplicateValue: string;
      occurrenceCount: number;
      affectedRows: number[];
    }>;
  },
  WorkspaceValidationError
> {
  return Effect.gen(function* (_) {
    // Check if field has explicit uniqueness validator (already normalized)
    const uniqueValidator = specField.validators?.find((v) => v.type === "unique");
    const enforcement = uniqueValidator?.enforcement ?? "required";

    // Get fully-formed violations
    const enriched = yield* _(
      findUniquenessViolations(
        connection,
        tableName,
        fieldName,
        specField,
        enforcement,
      ),
    );

    // Group violations by value for legacy format
    const groupedByValue = new Map<string, { count: number; rows: number[] }>();
    for (const v of enriched) {
      const existing = groupedByValue.get(v.value);
      if (existing) {
        existing.count++;
        existing.rows.push(v.rowNumber);
      } else {
        groupedByValue.set(v.value, { count: 1, rows: [v.rowNumber] });
      }
    }

    // Convert to legacy format
    const legacy = Array.from(groupedByValue.entries()).map(([value, data]) => ({
      duplicateValue: value,
      occurrenceCount: data.count,
      affectedRows: data.rows,
    }));

    return { enriched, legacy };
  });
}
