/**
 * Field Validators - Either-based validation with error channel accumulation
 *
 * Uses Effect.Either pattern where violations live in the error channel.
 * Key features:
 * - Returns Effect.Effect<ValidField, FieldViolation[]> instead of Effect.Effect<FieldViolation[], Error>
 * - Uses Effect.fail() to put violations in error channel (semantic correctness)
 * - Uses Effect.all with mode: "either" for automatic accumulation
 * - Supports parallel execution with concurrency: "unbounded"
 * - Eliminates imperative array accumulation
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import type {
  DatasetConfig,
  EnforcementLevel,
  FieldDefinition,
  FieldViolation,
  ValidatorConfig,
  VocabularyEnforcement,
  VocabularyKey,
} from "@dwkt/domain";
import {
  CrossDatasetViolation,
  enforcementToSeverity,
  getVocabularyValues,
  isValidVocabularyValue,
  RangeViolation,
  resolveDatasetProfile,
  UniquenessViolation,
  VocabularyViolation,
} from "@dwkt/domain";
import * as Effect from "effect/Effect";
import { extractRowNumbers, sanitizeTableName } from "../database/index.ts";

/**
 * Represents a successfully validated field
 */
export interface ValidField {
  readonly fieldName: string;
  readonly status: "valid";
}

/**
 * Validation result type - violations in error channel, success in data channel
 */
export type ValidationResult<T = ValidField> = Effect.Effect<T, FieldViolation[]>;

/**
 * Resolve dataset name to its schema table name
 *
 * Schema tables are named after profiles, not dataset names.
 * For example, dataset "occurrences" with spec "dwc-occurrence" → table "occurrence"
 */
export function resolveSchemaTableName(
  datasetName: string,
  datasets: readonly DatasetConfig[],
): string {
  const dataset = datasets.find((ds) => ds.name === datasetName);
  if (!dataset) {
    // Fallback to sanitized dataset name if not found
    return sanitizeTableName(datasetName).toLowerCase();
  }

  // Resolve profile from dataset config
  const profile = resolveDatasetProfile(dataset);
  const profileName = profile?.name;

  return profileName
    ? sanitizeTableName(profileName).toLowerCase()
    : sanitizeTableName(dataset.name).toLowerCase();
}

/**
 * Normalize range validator to ensure params are properly structured
 *
 * JSON schemas may have min/max at top level, but ValidatorConfig expects them under params.
 * This function handles both formats gracefully.
 */
function normalizeRangeValidator(validator: ValidatorConfig): ValidatorConfig {
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
 * Map VocabularyEnforcement to EnforcementLevel
 *
 * Converts vocabulary-specific enforcement to standard enforcement levels:
 * - strict → required (ERROR)
 * - recommended → recommended (WARNING)
 * - loose → optional (not used - loose enforcement skips validation)
 */
export function vocabularyEnforcementToStandard(
  vocabEnforcement: VocabularyEnforcement,
): EnforcementLevel {
  const mapping: Record<VocabularyEnforcement, EnforcementLevel> = {
    strict: "required",
    recommended: "recommended",
    loose: "optional", // Not actually used - loose enforcement skips validation
  };
  return mapping[vocabEnforcement];
}

/**
 * Validate range constraint for a single validator
 *
 * Returns ValidField on success, fails with RangeViolation[] on constraint violations.
 */
export function validateRangeConstraint(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  validator: ValidatorConfig,
  specField: FieldDefinition,
): ValidationResult {
  return Effect.gen(function* (_) {
    const { min, max, inclusive = true } = validator.params || {};

    if (min === undefined && max === undefined) {
      return { fieldName, status: "valid" as const };
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
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
    );

    const rows = result.getRowObjects();

    // If violations found, fail with violations in error channel
    if (rows.length > 0) {
      const violations = rows.map((row) =>
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

      return yield* _(Effect.fail(violations));
    }

    // No violations - succeed
    return { fieldName, status: "valid" as const };
  });
}

/**
 * Validate all range constraints for a field
 *
 * Uses Effect.all with mode: "either" to accumulate violations automatically.
 * Returns ValidField on success, fails with accumulated FieldViolation[] on errors.
 */
export function validateRangeConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): ValidationResult {
  return Effect.gen(function* (_) {
    if (!specField.validators || !Array.isArray(specField.validators)) {
      return { fieldName, status: "valid" as const };
    }

    // Get range validators
    const rangeValidators = specField.validators.filter((v: ValidatorConfig) => v.type === "range");

    if (rangeValidators.length === 0) {
      return { fieldName, status: "valid" as const };
    }

    // Create validation for each range validator
    const validations = rangeValidators.map((validator) => {
      const normalizedValidator = normalizeRangeValidator(validator);
      return validateRangeConstraint(
        connection,
        tableName,
        fieldName,
        normalizedValidator,
        specField,
      );
    });

    // Use Effect.all with mode: "either" to collect results without short-circuiting
    // This returns an array of Either values - one for each validation
    const results = yield* _(
      Effect.all(validations, { mode: "either", concurrency: "unbounded" }),
    );

    // Partition results into successes and failures
    const violations: FieldViolation[] = [];
    for (const result of results) {
      if (result._tag === "Left") {
        violations.push(...result.left);
      }
    }

    // If any violations found, fail with accumulated violations
    if (violations.length > 0) {
      return yield* _(Effect.fail(violations));
    }

    // All validations passed
    return { fieldName, status: "valid" as const };
  });
}

/**
 * Validate controlled vocabulary for a field
 *
 * Returns ValidField on success, fails with VocabularyViolation[] on invalid values.
 */
export function validateVocabulary(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): ValidationResult {
  return Effect.gen(function* (_) {
    // After normalization, vocabulary config is always present if field has controlled vocabulary
    if (!specField.vocabulary) {
      return { fieldName, status: "valid" as const };
    }

    const { vocabularyKey, caseSensitive = false, enforcement = "strict" } = specField.vocabulary;

    // Skip validation for loose enforcement - any value is accepted
    if (enforcement === "loose") {
      return { fieldName, status: "valid" as const };
    }

    // Map vocabulary enforcement to standard enforcement level
    const standardEnforcement = vocabularyEnforcementToStandard(enforcement);

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
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
    );

    const rows = result.getRowObjects();
    const violations: VocabularyViolation[] = [];

    for (const row of rows) {
      const value = String(row.value);
      const rowNumbers = extractRowNumbers(row.row_numbers);

      // Check if value is valid in vocabulary
      let isValid = false;
      if (caseSensitive) {
        isValid = isValidVocabularyValue(vocabularyKey as VocabularyKey, value);
      } else {
        const vocabValues = yield* _(
          getVocabularyValues(vocabularyKey as VocabularyKey).pipe(
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
              enforcement: standardEnforcement,
              severity: enforcementToSeverity(standardEnforcement),
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

    // If violations found, fail with violations in error channel
    if (violations.length > 0) {
      return yield* _(Effect.fail(violations));
    }

    // No violations - succeed
    return { fieldName, status: "valid" as const };
  });
}

/**
 * Validate uniqueness for a field
 *
 * Returns ValidField on success, fails with UniquenessViolation[] on duplicates.
 */
export function validateUniqueness(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): ValidationResult {
  return Effect.gen(function* (_) {
    // Check if field has explicit uniqueness validator
    const uniqueValidator = specField.validators?.find((v: ValidatorConfig) => v.type === "unique");
    const enforcement = uniqueValidator?.enforcement ?? "required";

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
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
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

    // If violations found, fail with violations in error channel
    if (violations.length > 0) {
      return yield* _(Effect.fail(violations));
    }

    // No violations - succeed
    return { fieldName, status: "valid" as const };
  });
}

/**
 * Validate all constraints for a single field
 *
 * Composes range, vocabulary, and uniqueness validations using Effect.all with mode: "either".
 * Executes validations in parallel with concurrency: "unbounded".
 *
 * Returns ValidField on success, fails with accumulated FieldViolation[] on errors.
 */
export function validateField(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): ValidationResult {
  return Effect.gen(function* (_) {
    const validations: ValidationResult[] = [];

    // Add applicable validations
    if (specField.validators?.some((v: ValidatorConfig) => v.type === "range")) {
      validations.push(validateRangeConstraints(connection, tableName, fieldName, specField));
    }

    if (specField.vocabulary) {
      validations.push(validateVocabulary(connection, tableName, fieldName, specField));
    }

    if (specField.validators?.some((v: ValidatorConfig) => v.type === "unique")) {
      validations.push(validateUniqueness(connection, tableName, fieldName, specField));
    }

    // If no validations, field is valid
    if (validations.length === 0) {
      return { fieldName, status: "valid" as const };
    }

    // Run all validations in parallel, accumulate violations automatically
    // Effect.all with mode: "either" returns an array of Either values
    const results = yield* _(
      Effect.all(validations, {
        mode: "either",
        concurrency: "unbounded", // Parallel execution
      }),
    );

    // Partition results into successes and failures
    const violations: FieldViolation[] = [];
    for (const result of results) {
      if (result._tag === "Left") {
        violations.push(...result.left);
      }
    }

    // If any violations found, fail with accumulated violations
    if (violations.length > 0) {
      return yield* _(Effect.fail(violations));
    }

    // All validations passed
    return { fieldName, status: "valid" as const };
  });
}

/**
 * Validate cross-dataset foreign key constraint
 *
 * Returns valid marker on success, fails with CrossDatasetViolation[] on referential integrity errors.
 */
export function validateCrossDatasetRule(
  connection: DuckDBConnection,
  rule: {
    ruleType: string;
    sourceDataset: string;
    sourceField: string;
    targetDataset: string;
    targetField: string;
    enforcement?: string;
    description?: string;
  },
  datasets: readonly DatasetConfig[],
): Effect.Effect<{ ruleType: string; status: "valid" }, CrossDatasetViolation[]> {
  return Effect.gen(function* (_) {
    // Map string enforcement to EnforcementLevel
    const enforcementMap: Record<string, EnforcementLevel> = {
      recommended: "recommended",
      optional: "optional",
    };
    const enforcement: EnforcementLevel = enforcementMap[rule.enforcement || ""] || "required";

    // Resolve dataset names to schema table names
    const sourceTable = resolveSchemaTableName(rule.sourceDataset, datasets);
    const targetTable = resolveSchemaTableName(rule.targetDataset, datasets);

    // Find values in source that don't exist in target
    const violationsQuery = `
      SELECT
        s._row_number,
        s."${rule.sourceField}" as source_value
      FROM ${sourceTable} s
      LEFT JOIN ${targetTable} t ON s."${rule.sourceField}" = t."${rule.targetField}"
      WHERE s."${rule.sourceField}" IS NOT NULL
        AND t."${rule.targetField}" IS NULL
    `;

    // SQL query execution should work - query failure is a defect
    const violationsResult = yield* _(
      Effect.tryPromise(() => connection.runAndReadAll(violationsQuery)).pipe(Effect.orDie),
    );

    const rows = violationsResult.getRowObjects();

    // If violations found, fail with violations in error channel
    if (rows.length > 0) {
      const violations = rows.map((row) =>
        new CrossDatasetViolation({
          enforcement,
          severity: enforcementToSeverity(enforcement),
          fieldName: rule.sourceField,
          targetName: rule.targetField,
          rowNumber: Number(row._row_number),
          value: String(row.source_value),
          errorMessage:
            `Value '${row.source_value}' in ${rule.sourceDataset}.${rule.sourceField} does not exist in ${rule.targetDataset}.${rule.targetField}`,
          validatorType: rule.ruleType || "foreignKey",
          params: {
            sourceDataset: rule.sourceDataset,
            targetDataset: rule.targetDataset,
            targetField: rule.targetField,
          },
        })
      );

      return yield* _(Effect.fail(violations));
    }

    // No violations - succeed
    return { ruleType: rule.ruleType, status: "valid" as const };
  });
}
