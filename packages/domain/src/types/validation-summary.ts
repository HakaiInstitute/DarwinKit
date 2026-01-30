/**
 * Validation Summary Types and Utilities
 *
 * Pure domain types and functions for calculating and aggregating
 * validation results. No infrastructure dependencies.
 */

import type {
  CrossDatasetValidationResult,
  DatasetValidationResult,
} from "./workspace-validation.ts";

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
