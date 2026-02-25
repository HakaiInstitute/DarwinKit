/**
 * Workspace-based validation result types
 *
 * These types represent validation results when validating multiple datasets
 * within a workspace using spec-based field mappings.
 *
 * DESIGN DECISION: Kept as pure TypeScript interfaces rather than Effect Schemas because:
 * 1. OUTPUT-ONLY types - Never parsed from external input
 * 2. Internal contracts - These define the internal API contract for validation results
 *    between core and cli packages
 * 3. Constructed internally - Built by the validation system, not from external data
 * 4. Complex nested structures - Creating schemas would add complexity without benefit
 *
 * The types aggregate results from multiple validators and datasets, providing
 * a comprehensive view of validation outcomes partitioned by severity
 * (errors, warnings, info).
 */

import type {
  CrossDatasetViolation,
  FieldViolation,
  PartitionedViolations,
} from "./validation-violation.ts";
import type { SchemaViolation } from "./schema-violation.ts";

export interface DatasetValidationResult {
  readonly datasetName: string;
  readonly class: string;
  readonly filePath: string;
  readonly rowsProcessed: number;
  readonly processingTimeMs: number;
  readonly status: "pass" | "warn" | "fail";

  /** Schema-level violations (structural issues: missing fields, unknown profiles) */
  readonly schemaViolations: PartitionedViolations<SchemaViolation>;

  /** Field-level violations (data issues: range, vocabulary, uniqueness) */
  readonly fieldViolations: PartitionedViolations<FieldViolation>;
}

export interface CrossDatasetValidationResult {
  readonly ruleType: "foreignKey";
  readonly sourceDataset: string;
  readonly sourceField: string;
  readonly targetDataset: string;
  readonly targetField: string;
  readonly violations: ReadonlyArray<CrossDatasetViolation>;
}

export interface WorkspaceValidationResult {
  readonly workspaceId: string;
  readonly configPath: string;
  readonly validatedAt: Date;
  readonly totalProcessingTimeMs: number;
  readonly overallStatus: "pass" | "warn" | "fail";

  readonly datasetResults: ReadonlyArray<DatasetValidationResult>;
  readonly crossDatasetResults: ReadonlyArray<CrossDatasetValidationResult>;
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
