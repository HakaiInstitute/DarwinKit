/**
 * ConstraintValidator - Cross-dataset validation operations
 *
 * Class-based validator for cross-dataset constraints such as foreign keys
 * and referential integrity rules.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import type { CrossDatasetValidationResult, DatasetConfig, EnforcementLevel } from "@dwkt/domain";
import { CrossDatasetViolation, enforcementToSeverity, resolveDatasetProfile } from "@dwkt/domain";
import * as Effect from "effect/Effect";
import { sanitizeTableName } from "../database/index.ts";

/**
 * ConstraintValidator - Validates cross-dataset constraints
 *
 * Handles validation rules that span multiple datasets:
 * - Foreign key constraints
 * - Referential integrity rules
 *
 * This class operates on multiple tables within a DuckDB connection.
 * The connection is provided by the Workspace.
 */
export class ConstraintValidator {
  /**
   * Create a new ConstraintValidator
   *
   * @param connection - DuckDB connection (provided by Workspace)
   * @param datasets - All datasets in the workspace
   */
  constructor(
    private readonly connection: DuckDBConnection,
    private readonly datasets: readonly DatasetConfig[],
  ) {}

  /**
   * Validate a cross-dataset rule
   *
   * Checks referential integrity between two datasets, ensuring that values
   * in one dataset's field exist in another dataset's field.
   *
   * @param rule - Cross-dataset validation rule
   * @returns Validation result with violations
   */
  validateRule(
    rule: {
      ruleType: string;
      sourceDataset: string;
      sourceField: string;
      targetDataset: string;
      targetField: string;
      enforcement?: string;
      description?: string;
    },
  ): Effect.Effect<CrossDatasetValidationResult, never> {
    return Effect.gen(this, function* (_) {
      // Map string enforcement to EnforcementLevel with cleaner mapping
      const enforcementMap: Record<string, EnforcementLevel> = {
        recommended: "recommended",
        optional: "optional",
      };
      const enforcement: EnforcementLevel = enforcementMap[rule.enforcement || ""] || "required";

      // Get fully-formed violations
      const violations = yield* _(
        this.findViolations({ ...rule, enforcement }),
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

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Find cross-dataset foreign key violations
   *
   * Returns fully-formed CrossDatasetViolation objects with all metadata.
   */
  private findViolations(
    rule: {
      ruleType?: string;
      sourceDataset: string;
      sourceField: string;
      targetDataset: string;
      targetField: string;
      enforcement?: EnforcementLevel;
    },
  ): Effect.Effect<CrossDatasetViolation[], never> {
    return Effect.gen(this, function* (_) {
      // Resolve dataset names to schema table names
      const sourceTable = this.resolveSchemaTableName(rule.sourceDataset);
      const targetTable = this.resolveSchemaTableName(rule.targetDataset);

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
        Effect.tryPromise(() => this.connection.runAndReadAll(violationsQuery)).pipe(Effect.orDie),
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
   * Resolve dataset name to its schema table name
   *
   * Schema tables are named after profiles, not dataset names.
   * For example, dataset "occurrences" with spec "dwc-occurrence" → table "occurrence"
   */
  private resolveSchemaTableName(datasetName: string): string {
    const dataset = this.datasets.find((ds) => ds.name === datasetName);
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
}
