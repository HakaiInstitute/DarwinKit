/**
 * Validation Summary Utilities
 *
 * Utilities for calculating and aggregating validation results.
 */

import type {
  CrossDatasetValidationResult,
  DatasetConfig,
  DatasetValidationResult,
  FieldDefinition,
} from "@dwkt/domain";
import { parseSpecIdentifier, partitionFieldViolations } from "@dwkt/domain";
import { sanitizeTableName } from "../loading/sql.ts";

// Re-export partitionFieldViolations as partitionViolations for backward compatibility
export { partitionFieldViolations as partitionViolations };

/**
 * Resolve dataset name to its schema table name
 *
 * Schema tables are named after profiles, not dataset names.
 * For example, dataset "occurrences" with spec "dwc-occurrence" → table "occurrence"
 *
 * @param datasetName - Name of the dataset
 * @param datasets - Array of dataset configurations
 * @returns The schema table name
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

  // Derive profile name - same logic as in validateDataset
  let profileName = dataset.profile;
  if (!profileName && dataset.spec) {
    const parsed = parseSpecIdentifier(dataset.spec);
    if (parsed) {
      profileName = parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1);
    }
  }

  return profileName
    ? sanitizeTableName(profileName).toLowerCase()
    : sanitizeTableName(dataset.name).toLowerCase();
}

/**
 * Summary statistics for validation results
 */
export interface ValidationSummary {
  readonly totalDatasets: number;
  readonly datasetsPassedCount: number;
  readonly datasetsWithWarningsCount: number;
  readonly datasetsFailedCount: number;
  readonly totalErrors: number;
  readonly totalWarnings: number;
  readonly totalInfo: number;
  readonly totalRowsProcessed: number;
}

/**
 * Calculate summary statistics across all dataset results
 *
 * @param datasetResults - Array of dataset validation results
 * @param crossDatasetResults - Optional array of cross-dataset validation results
 * @returns Summary statistics
 */
export function calculateSummary(
  datasetResults: readonly DatasetValidationResult[],
  crossDatasetResults?: readonly CrossDatasetValidationResult[],
): ValidationSummary {
  let datasetsPassedCount = 0;
  let datasetsWithWarningsCount = 0;
  let datasetsFailedCount = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfo = 0;
  let totalRowsProcessed = 0;

  for (const result of datasetResults) {
    totalRowsProcessed += result.rowsProcessed;

    // Count violations by severity from both schema and field violations
    totalErrors += result.schemaViolations.errors.length + result.fieldViolations.errors.length;
    totalWarnings += result.schemaViolations.warnings.length +
      result.fieldViolations.warnings.length;
    totalInfo += result.schemaViolations.info.length + result.fieldViolations.info.length;

    if (result.status === "pass") {
      datasetsPassedCount++;
    } else if (result.status === "warn") {
      datasetsWithWarningsCount++;
    } else {
      datasetsFailedCount++;
    }
  }

  // Count cross-dataset violations by enforcement level
  if (crossDatasetResults) {
    for (const result of crossDatasetResults) {
      for (const violation of result.violations) {
        switch (violation.enforcement) {
          case "required":
            totalErrors++;
            break;
          case "recommended":
            totalWarnings++;
            break;
          case "optional":
            totalInfo++;
            break;
        }
      }
    }
  }

  return {
    totalDatasets: datasetResults.length,
    datasetsPassedCount,
    datasetsWithWarningsCount,
    datasetsFailedCount,
    totalErrors,
    totalWarnings,
    totalInfo,
    totalRowsProcessed,
  };
}

/**
 * Determine overall validation status from summary
 *
 * @param summary - Validation summary
 * @returns "pass", "warn", or "fail"
 */
export function determineOverallStatus(
  summary: ValidationSummary,
): "pass" | "warn" | "fail" {
  if (summary.datasetsFailedCount > 0 || summary.totalErrors > 0) {
    return "fail";
  }
  if (summary.datasetsWithWarningsCount > 0 || summary.totalWarnings > 0) {
    return "warn";
  }
  return "pass";
}

/**
 * Check if a field definition has a controlled vocabulary configured
 */
export function hasControlledVocabulary(fieldDef: FieldDefinition): boolean {
  return fieldDef.vocabulary !== undefined;
}
