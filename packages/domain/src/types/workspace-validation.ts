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
 * a comprehensive view of validation outcomes partitioned by enforcement level
 * (errors, warnings, info).
 */

import type { TransformationChain } from "./transformation.ts";
import type { CrossDatasetViolation, ValidationViolation } from "./validation-violation.ts";

/**
 * Validation result for a single dataset within a workspace
 */
export interface DatasetValidationResult {
  readonly datasetName: string;
  readonly spec: string;
  readonly filePath: string;
  readonly rowsProcessed: number;
  readonly processingTimeMs: number;
  readonly status: "pass" | "warn" | "fail";

  // Enforcement-aware violations (NEW - partitioned by severity)
  readonly violations: {
    readonly errors: ReadonlyArray<ValidationViolation>; // enforcement: "required"
    readonly warnings: ReadonlyArray<ValidationViolation>; // enforcement: "recommended"
    readonly info: ReadonlyArray<ValidationViolation>; // enforcement: "optional"
  };

  // Type validation errors (from CSV parsing)
  readonly typeErrors: ReadonlyArray<{
    readonly fieldName: string;
    readonly expectedType: string;
    readonly failureCount: number;
    readonly sampleFailures: ReadonlyArray<{
      readonly rowNumber: number;
      readonly originalValue: string; // Deprecated: use csvValue
      readonly csvValue?: string; // Original value in CSV file
      readonly transformedValue?: unknown; // Value after transformations
      readonly transformationChain?: TransformationChain; // Full transformation history
      readonly errorMessage: string;
    }>;
  }>;

  // Required field errors (from spec)
  readonly requiredFieldErrors: ReadonlyArray<{
    readonly fieldName: string;
    readonly targetName: string;
    readonly message: string;
  }>;

  // Field warnings (strongly recommended fields that are missing)
  readonly warnings: ReadonlyArray<{
    readonly fieldName: string;
    readonly targetName: string;
    readonly requirementLevel: string;
    readonly message: string;
  }>;

  // Field recommendations (recommended fields that are missing)
  readonly recommendations: ReadonlyArray<{
    readonly fieldName: string;
    readonly targetName: string;
    readonly requirementLevel: string;
    readonly message: string;
  }>;
}

/**
 * Cross-dataset validation result
 *
 * Uses CrossDatasetViolation[] directly for violations, which includes:
 * - rowNumber, value, errorMessage (from ViolationBase)
 * - params.sourceDataset, params.targetDataset, params.targetField
 * - enforcement and severity for consistent handling with other violations
 */
export interface CrossDatasetValidationResult {
  readonly ruleType: "foreignKey" | "referentialIntegrity";
  readonly sourceDataset: string;
  readonly sourceField: string;
  readonly targetDataset: string;
  readonly targetField: string;
  readonly violations: ReadonlyArray<CrossDatasetViolation>;
}

/**
 * Complete workspace validation result
 */
export interface WorkspaceValidationResult {
  readonly workspaceId: string;
  readonly configPath: string;
  readonly validatedAt: Date;
  readonly totalProcessingTimeMs: number;
  readonly overallStatus: "pass" | "warn" | "fail";

  // Per-dataset results
  readonly datasetResults: ReadonlyArray<DatasetValidationResult>;

  // Cross-dataset results
  readonly crossDatasetResults: ReadonlyArray<CrossDatasetValidationResult>;

  // Summary statistics
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

  // Transformation statistics (optional, populated when transformation tracking is enabled)
  readonly transformationSummary?: {
    readonly totalValues: number;
    readonly transformedValues: number;
    readonly byType: {
      readonly [transformationType: string]: {
        readonly count: number;
        readonly percentage: number;
      };
    };
  };
}
