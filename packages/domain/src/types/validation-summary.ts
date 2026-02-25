import type {
  CrossDatasetValidationResult,
  DatasetValidationResult,
} from "./workspace-validation.ts";

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

  if (crossDatasetResults) {
    for (const result of crossDatasetResults) {
      for (const violation of result.violations) {
        switch (violation.severity) {
          case "error":
            totalErrors++;
            break;
          case "warning":
            totalWarnings++;
            break;
          case "info":
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
