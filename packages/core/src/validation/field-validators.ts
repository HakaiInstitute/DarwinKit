/**
 * Validators - Field-level and cross-dataset validation functions
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import type { WorkspaceValidationError } from "@dwkt/core";
import type {
  CrossDatasetValidationResult,
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
import { extractRowNumbers, sanitizeTableName } from "./database/index.ts";

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
 * Find cross-dataset foreign key violations
 *
 * Returns fully-formed CrossDatasetViolation objects with all metadata.
 */
export function findCrossDatasetViolations(
  connection: DuckDBConnection,
  rule: {
    ruleType?: string;
    sourceDataset: string;
    sourceField: string;
    targetDataset: string;
    targetField: string;
    enforcement?: EnforcementLevel;
  },
  datasets: readonly DatasetConfig[],
): Effect.Effect<CrossDatasetViolation[], never> {
  return Effect.gen(function* (_) {
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
    const enforcement = rule.enforcement ?? "required";

    // Return fully-formed CrossDatasetViolation objects
    return rows.map((row) =>
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
  });
}

/**
 * Validate cross-dataset rule
 *
 * Returns cross-dataset violations with enforcement-aware metadata.
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
): Effect.Effect<CrossDatasetValidationResult, WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    // Map string enforcement to EnforcementLevel with cleaner mapping
    const enforcementMap: Record<string, EnforcementLevel> = {
      recommended: "recommended",
      optional: "optional",
    };
    const enforcement: EnforcementLevel = enforcementMap[rule.enforcement || ""] || "required";

    // Get fully-formed violations
    const violations = yield* _(
      findCrossDatasetViolations(connection, { ...rule, enforcement }, datasets),
    );

    return {
      ruleType: rule.ruleType as "foreignKey" | "referentialIntegrity",
      sourceDataset: rule.sourceDataset,
      sourceField: rule.sourceField,
      targetDataset: rule.targetDataset,
      targetField: rule.targetField,
      violations,
    };
  });
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
 * Find range violations for a single validator
 *
 * Returns fully-formed RangeViolation objects with all metadata.
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
      Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
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
 */
export function validateRangeConstraints(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<FieldViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    const violations: FieldViolation[] = [];

    if (!specField.validators || !Array.isArray(specField.validators)) {
      return violations;
    }

    // Get range validators (now always ValidatorConfig[] after normalization)
    const rangeValidators = specField.validators.filter((v: ValidatorConfig) => v.type === "range");

    for (const validator of rangeValidators) {
      // Ensure validator has proper params structure
      const normalizedValidator = normalizeRangeValidator(validator);

      const rangeViolations = yield* _(
        findRangeViolations(connection, tableName, fieldName, normalizedValidator, specField),
      );

      violations.push(...rangeViolations);
    }

    return violations;
  });
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
 * Find vocabulary violations using vocabulary key
 *
 * Returns fully-formed VocabularyViolation objects with all metadata.
 */
export function findVocabularyViolations(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  vocabularyKey: VocabularyKey,
  specField: FieldDefinition,
  enforcement: EnforcementLevel,
  caseSensitive = false,
): Effect.Effect<VocabularyViolation[], never> {
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
 * Validate controlled vocabulary for a field
 *
 * Returns FieldViolation[] with enforcement-aware metadata.
 */
export function validateVocabulary(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<FieldViolation[], never> {
  return Effect.gen(function* (_) {
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
    const standardEnforcement = vocabularyEnforcementToStandard(enforcement);

    // Get fully-formed violations
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
 * Returns fully-formed UniquenessViolation objects with all metadata.
 *
 * Note: This "explodes" duplicate values into individual violations,
 * so a value duplicated 3 times creates 3 UniquenessViolations.
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

    return violations;
  });
}

/**
 * Validate uniqueness for a field
 *
 * Returns FieldViolation[] with enforcement-aware metadata.
 */
export function validateUniqueness(
  connection: DuckDBConnection,
  tableName: string,
  fieldName: string,
  specField: FieldDefinition,
): Effect.Effect<FieldViolation[], WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    // Check if field has explicit uniqueness validator (already normalized)
    const uniqueValidator = specField.validators?.find((v: ValidatorConfig) => v.type === "unique");
    const enforcement = uniqueValidator?.enforcement ?? "required";

    // Get fully-formed violations
    return yield* _(
      findUniquenessViolations(connection, tableName, fieldName, specField, enforcement),
    );
  });
}
