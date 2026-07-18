/**
 * Validation result types for a workspace of multiple datasets.
 *
 * Plain interfaces (not Effect Schemas): these are output-only, constructed
 * internally and never parsed from external input.
 */

import type { FieldViolation, PartitionedViolations } from "./validation-violation.ts";
import type { SchemaViolation } from "./schema-violation.ts";

/**
 * Outcome of validating a dataset or workspace:
 * "pass" (no issues), "warn" (warnings only), or "fail" (errors present).
 */
export type ValidationStatus = "pass" | "warn" | "fail";

export interface DatasetValidationResult {
  readonly datasetName: string;
  readonly class: string;
  readonly filePath: string;
  readonly rowsProcessed: number;
  readonly processingTimeMs: number;
  readonly status: ValidationStatus;

  /** Schema-level violations (structural issues: missing fields, unknown profiles) */
  readonly schemaViolations: PartitionedViolations<SchemaViolation>;

  /** Field-level violations (data issues: range, format, pattern, length, required, uniqueness) */
  readonly fieldViolations: PartitionedViolations<FieldViolation>;
}

export interface WorkspaceValidationResult {
  readonly workspaceId: string;
  readonly configPath: string;
  readonly validatedAt: Date;
  readonly totalProcessingTimeMs: number;
  readonly overallStatus: ValidationStatus;

  readonly datasetResults: ReadonlyArray<DatasetValidationResult>;
  readonly summary: {
    readonly totalDatasets: number;
    readonly datasetsPassedCount: number;
    readonly datasetsWithWarningsCount: number;
    readonly datasetsFailedCount: number;
    readonly totalErrors: number;
    readonly totalWarnings: number;
    readonly totalInfo: number;
    readonly totalRowsProcessed: number;
  };
}
