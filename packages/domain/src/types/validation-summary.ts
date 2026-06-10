import * as Match from "effect/Match";
import type { DatasetValidationResult, ValidationStatus } from "./workspace-validation.ts";

interface ValidationSummary {
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

    Match.value(result.status).pipe(
      Match.when("pass", () => {
        datasetsPassedCount++;
      }),
      Match.when("warn", () => {
        datasetsPassedCount++;
        datasetsWithWarningsCount++;
      }),
      Match.when("fail", () => {
        datasetsFailedCount++;
      }),
      Match.exhaustive,
    );
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
): ValidationStatus {
  if (summary.datasetsFailedCount > 0 || summary.totalErrors > 0) {
    return "fail";
  }
  if (summary.datasetsWithWarningsCount > 0 || summary.totalWarnings > 0) {
    return "warn";
  }
  return "pass";
}
