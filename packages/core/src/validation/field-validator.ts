/**
 * FieldValidator - Field-level validation operations
 *
 * Class-based field validator that handles individual field validation:
 * - Range constraint validation
 * - Controlled vocabulary validation
 * - Uniqueness validation
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import type { WorkspaceValidationError } from "@dwkt/core";
import type {
  EnforcementLevel,
  FieldDefinition,
  FieldViolation,
  ValidatorConfig,
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
import * as Effect from "effect/Effect";
import { extractRowNumbers } from "../database/index.ts";

/**
 * FieldValidator - Validates individual fields within a dataset
 *
 * Provides methods for validating field-level constraints:
 * - Range constraints (min/max values)
 * - Controlled vocabularies (allowed values)
 * - Uniqueness constraints (duplicate detection)
 *
 * This class operates on a specific table within a DuckDB connection.
 * The connection is provided by the Workspace and passed through the
 * DatasetValidator.
 */
export class FieldValidator {
  /**
   * Create a new FieldValidator
   *
   * @param connection - DuckDB connection (provided by Workspace)
   * @param tableName - Name of the table to validate
   */
  constructor(
    private readonly connection: DuckDBConnection,
    private readonly tableName: string,
  ) {}

  /**
   * Validate range constraints for a field
   *
   * Checks if field values fall within specified min/max ranges.
   * Supports inclusive and exclusive bounds.
   *
   * @param fieldName - Name of the field to validate
   * @param specField - Field definition with validators
   * @returns Array of range violations
   */
  validateRange(
    fieldName: string,
    specField: FieldDefinition,
  ): Effect.Effect<FieldViolation[], WorkspaceValidationError> {
    return Effect.gen(this, function* (_) {
      const violations: FieldViolation[] = [];

      if (!specField.validators || !Array.isArray(specField.validators)) {
        return violations;
      }

      // Get range validators (now always ValidatorConfig[] after normalization)
      const rangeValidators = specField.validators.filter((v: ValidatorConfig) =>
        v.type === "range"
      );

      for (const validator of rangeValidators) {
        // Ensure validator has proper params structure
        const normalizedValidator = this.normalizeRangeValidator(validator);

        const rangeViolations = yield* _(
          this.findRangeViolations(fieldName, normalizedValidator, specField),
        );

        violations.push(...rangeViolations);
      }

      return violations;
    });
  }

  /**
   * Validate controlled vocabulary for a field
   *
   * Checks if field values are present in the controlled vocabulary.
   * Supports case-sensitive and case-insensitive matching.
   *
   * @param fieldName - Name of the field to validate
   * @param specField - Field definition with vocabulary config
   * @returns Array of vocabulary violations
   */
  validateVocabulary(
    fieldName: string,
    specField: FieldDefinition,
  ): Effect.Effect<FieldViolation[], never> {
    return Effect.gen(this, function* (_) {
      // After normalization, vocabulary config is always present if field has controlled vocabulary
      if (!specField.vocabulary) {
        return [];
      }

      const { vocabularyKey, caseSensitive = false, enforcement = "strict" } = specField.vocabulary;

      // Skip validation for loose enforcement - any value is accepted
      if (enforcement === "loose") {
        return [];
      }

      // Map vocabulary enforcement to standard enforcement level
      const standardEnforcement = this.vocabularyEnforcementToStandard(enforcement);

      // Get fully-formed violations
      return yield* _(
        this.findVocabularyViolations(
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
   * Validate uniqueness for a field
   *
   * Detects duplicate values in a field that should be unique.
   *
   * @param fieldName - Name of the field to validate
   * @param specField - Field definition with validators
   * @returns Array of uniqueness violations
   */
  validateUniqueness(
    fieldName: string,
    specField: FieldDefinition,
  ): Effect.Effect<FieldViolation[], WorkspaceValidationError> {
    return Effect.gen(this, function* (_) {
      // Check if field has explicit uniqueness validator (already normalized)
      const uniqueValidator = specField.validators?.find((v: ValidatorConfig) =>
        v.type === "unique"
      );
      const enforcement = uniqueValidator?.enforcement ?? "required";

      // Get fully-formed violations
      return yield* _(
        this.findUniquenessViolations(fieldName, specField, enforcement),
      );
    });
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Normalize range validator to ensure params are properly structured
   *
   * JSON schemas may have min/max at top level, but ValidatorConfig expects them under params.
   */
  private normalizeRangeValidator(validator: ValidatorConfig): ValidatorConfig {
    // If params already exist, return as-is
    if (validator.params) {
      return validator;
    }

    // Check for legacy top-level properties
    const validatorAny = validator as unknown as Record<string, unknown>;
    if (!("min" in validatorAny || "max" in validatorAny || "inclusive" in validatorAny)) {
      return validator;
    }

    // Migrate legacy properties to params
    return {
      type: validator.type,
      enforcement: validator.enforcement || "required",
      message: validator.message,
      params: {
        min: typeof validatorAny.min === "number" ? validatorAny.min : undefined,
        max: typeof validatorAny.max === "number" ? validatorAny.max : undefined,
        inclusive: typeof validatorAny.inclusive === "boolean" ? validatorAny.inclusive : true,
      },
    };
  }

  /**
   * Find range violations for a single validator
   */
  private findRangeViolations(
    fieldName: string,
    validator: ValidatorConfig,
    specField: FieldDefinition,
  ): Effect.Effect<RangeViolation[], never> {
    return Effect.gen(this, function* (_) {
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
        FROM ${this.tableName}
        WHERE "${fieldName}" IS NOT NULL
          AND (${rangeCondition})
        LIMIT 100
      `;

      // SQL query execution should work - query failure is a defect
      const result = yield* _(
        Effect.tryPromise(() => this.connection.runAndReadAll(query)).pipe(Effect.orDie),
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
   * Find vocabulary violations using vocabulary key
   */
  private findVocabularyViolations(
    fieldName: string,
    vocabularyKey: VocabularyKey,
    specField: FieldDefinition,
    enforcement: EnforcementLevel,
    caseSensitive = false,
  ): Effect.Effect<VocabularyViolation[], never> {
    return Effect.gen(this, function* (_) {
      // Get distinct values from the field with ordered row numbers
      const query = `
        SELECT
          "${fieldName}" as value,
          list(_row_number ORDER BY _row_number) as row_numbers
        FROM ${this.tableName}
        WHERE "${fieldName}" IS NOT NULL
        GROUP BY "${fieldName}"
      `;

      // SQL query execution should work - query failure is a defect
      const result = yield* _(
        Effect.tryPromise(() => this.connection.runAndReadAll(query)).pipe(Effect.orDie),
      );

      const rows = result.getRowObjects();
      const violations: VocabularyViolation[] = [];

      for (const row of rows) {
        const value = String(row.value);
        const rowNumbers = extractRowNumbers(row.row_numbers);

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
          isValid = (vocabValues as readonly string[]).some((v: string) =>
            v.toLowerCase() === lowerValue
          );
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
                // TODO: Add fuzzy matching for suggestions
              }),
            );
          }
        }
      }

      return violations;
    });
  }

  /**
   * Find uniqueness violations
   */
  private findUniquenessViolations(
    fieldName: string,
    specField: FieldDefinition,
    enforcement: EnforcementLevel,
  ): Effect.Effect<UniquenessViolation[], WorkspaceValidationError> {
    return Effect.gen(this, function* (_) {
      // Query to find duplicate values with ordered row numbers
      const query = `
        SELECT
          "${fieldName}" as duplicate_value,
          COUNT(*) as occurrence_count,
          list(_row_number ORDER BY _row_number) as affected_rows
        FROM ${this.tableName}
        WHERE "${fieldName}" IS NOT NULL
        GROUP BY "${fieldName}"
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT 100
      `;

      // SQL query execution should work - query failure is a defect
      const result = yield* _(
        Effect.tryPromise(() => this.connection.runAndReadAll(query)).pipe(Effect.orDie),
      );

      const rows = result.getRowObjects();
      const violations: UniquenessViolation[] = [];

      // Explode each duplicate value into individual violations (one per row)
      for (const row of rows) {
        const value = String(row.duplicate_value);
        const affectedRows = extractRowNumbers(row.affected_rows);

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
   * Map VocabularyEnforcement to EnforcementLevel
   */
  private vocabularyEnforcementToStandard(
    vocabEnforcement: "strict" | "recommended" | "loose",
  ): EnforcementLevel {
    const mapping: Record<string, EnforcementLevel> = {
      strict: "required",
      recommended: "recommended",
      loose: "optional", // Not actually used - loose enforcement skips validation
    };
    return mapping[vocabEnforcement];
  }
}
