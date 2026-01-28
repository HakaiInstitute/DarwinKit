/**
 * Constraint Validator
 *
 * Cross-dataset validation for foreign key and referential integrity rules.
 * Handles validation of relationships between multiple datasets.
 *
 * @module validation/constraint-validator
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import * as Effect from "effect/Effect";

import type { CrossDatasetValidationResult, DatasetConfig, EnforcementLevel } from "@dwkt/domain";
import { CrossDatasetViolation, enforcementToSeverity } from "@dwkt/domain";

import { resolveSchemaTableName } from "./summary.ts";
import type { WorkspaceValidationError } from "./workspace-validator.ts";

/**
 * Cross-dataset rule configuration
 */
export interface CrossDatasetRule {
  readonly ruleType: string;
  readonly sourceDataset: string;
  readonly sourceField: string;
  readonly targetDataset: string;
  readonly targetField: string;
  readonly enforcement?: string;
  readonly description?: string;
}

/**
 * Find cross-dataset foreign key violations
 *
 * Returns fully-formed CrossDatasetViolation objects with all metadata.
 *
 * @param connection - DuckDB connection
 * @param rule - Cross-dataset rule configuration
 * @param datasets - Array of dataset configurations
 * @returns Array of CrossDatasetViolation objects
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
      Effect.tryPromise(() => connection.runAndReadAll(violationsQuery)).pipe(
        Effect.orDie,
      ),
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
 * Returns cross-dataset violations with enforcement level.
 *
 * @param connection - DuckDB connection
 * @param rule - Cross-dataset rule configuration
 * @param datasets - Array of dataset configurations
 * @returns Cross-dataset validation result
 */
export function validateCrossDatasetRule(
  connection: DuckDBConnection,
  rule: CrossDatasetRule,
  datasets: readonly DatasetConfig[],
): Effect.Effect<CrossDatasetValidationResult, WorkspaceValidationError> {
  return Effect.gen(function* (_) {
    // Map string enforcement to EnforcementLevel
    const enforcement: EnforcementLevel = rule.enforcement === "recommended"
      ? "recommended"
      : rule.enforcement === "optional"
      ? "optional"
      : "required";

    // Get fully-formed CrossDatasetViolation objects
    const violations = yield* _(
      findCrossDatasetViolations(
        connection,
        { ...rule, enforcement },
        datasets,
      ),
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
