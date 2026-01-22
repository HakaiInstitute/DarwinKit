/**
 * Validator - Workspace-level validation orchestration
 *
 * Orchestrates multi-dataset validation for a workspace:
 * - Dataset validation using DatasetValidator
 * - Cross-dataset constraint validation
 * - Result aggregation and caching
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { dirname, resolve } from "@std/path";
import * as Effect from "effect/Effect";

import { WorkspaceValidationError } from "@dwkt/core";
import type {
  ConfigMissingSettingsError,
  ConfigWithValidation,
  DatasetConfig,
  DatasetValidationResult,
  ValidationConfig,
  WorkspaceValidationResult,
} from "@dwkt/domain";
import { ErrorCode, requireValidation, resolveDatasetProfile } from "@dwkt/domain";

import { importSchemaToWorkspace, sanitizeTableName } from "../database/index.ts";
import { ConstraintValidator } from "../validation/constraint-validator.ts";
import { validateDataset } from "../validation/dataset-validator.ts";
import { calculateSummary } from "../validation/utils.ts";
import type { Workspace } from "./workspace.ts";

/**
 * Validator - Orchestrates workspace validation
 *
 * Responsibilities:
 * - Multi-dataset validation coordination
 * - Profile resolution and field mapping validation
 * - Cross-dataset rule validation
 * - Result aggregation and caching
 *
 * The Validator receives a Workspace reference to access:
 * - Configuration (datasets, validation settings)
 * - Database connection (via workspace.getConnection())
 * - File paths for dataset loading
 */
export class Validator {
  /** Cached validation result */
  private validationResult?: WorkspaceValidationResult;

  /**
   * Create a new Validator
   *
   * @param workspace - Workspace instance providing config and connection
   */
  constructor(private readonly workspace: Workspace) {}

  /**
   * Get the validation config from the workspace, failing if not present.
   *
   * Uses the requireValidation helper for type-safe access to validation settings.
   *
   * @returns Effect yielding the validation config or ConfigMissingSettingsError
   */
  private getValidationConfig(): Effect.Effect<ConfigWithValidation, ConfigMissingSettingsError> {
    return requireValidation(this.workspace.getConfig());
  }

  /**
   * Validate all datasets in the workspace
   *
   * This is the main validation entry point that:
   * - Creates a DuckDB workspace
   * - Validates each dataset according to its profile
   * - Validates cross-dataset rules
   * - Returns comprehensive validation results
   *
   * @param options - Optional validation settings
   * @param options.failFast - Stop validation on first critical error
   * @returns Effect containing validation results
   *
   * @example
   * ```typescript
   * const workspace = await Effect.runPromise(Workspace.discover());
   * const result = await Effect.runPromise(workspace.validator.validate());
   *
   * if (result.overallStatus === "pass") {
   *   console.log("All datasets valid!");
   * }
   * ```
   */
  run(
    options?: {
      failFast?: boolean;
    },
  ): Effect.Effect<
    WorkspaceValidationResult,
    WorkspaceValidationError | ConfigMissingSettingsError
  > {
    const workspace = this.workspace;
    const configPath = workspace.getConfigPath();

    return Effect.gen(this, function* (_) {
      const config = yield* _(this.getValidationConfig());
      const startTime = Date.now();

      // Type narrowed to validation config - we can safely access config.validation
      const datasets = config.validation.datasets;

      // Ensure datasets exist
      if (!datasets || datasets.length === 0) {
        return yield* _(
          Effect.fail(
            new WorkspaceValidationError({
              message: `Configuration '${configPath}' does not contain datasets`,
              code: ErrorCode.INVALID_CONFIG,
            }),
          ),
        );
      }

      // Override validation settings with options if provided
      const validationSettings: ValidationConfig = options?.failFast !== undefined
        ? { ...config.validation, failFast: options.failFast }
        : config.validation;

      // Get connection from workspace
      const connection = yield* _(this.workspace.getConnection());

      // Generate workspace ID for this validation run
      const workspaceId = config.id;
      const basePath = dirname(configPath);

      // Load each dataset into DuckDB
      for (const dataset of datasets) {
        const filePath = resolve(basePath, dataset.path);
        // Prepend 'raw_' to table name because dataset.name and spec/profile cannot be the same name otherwise tables conflict
        const tableName = `raw_${sanitizeTableName(dataset.name)}`;

        // Import CSV using workspace method
        yield* _(
          this.workspace.importCsv(
            filePath,
            tableName,
            true,
          ),
        );

        // Import schema for validation
        yield* _(importSchemaToWorkspace(connection, dataset, datasets));
      }

      // Perform validation
      const result = yield* _(
        this.performValidation(
          connection,
          datasets,
          validationSettings,
          workspaceId,
          configPath,
          startTime,
        ),
      );

      // Cache the result for state queries
      this.validationResult = result;

      return result;
    });
  }

  /**
   * Get cached validation result
   *
   * @returns Cached validation result, or undefined if validate() hasn't been called
   */
  getResult(): WorkspaceValidationResult | undefined {
    return this.validationResult;
  }

  /**
   * Check if workspace is valid based on last validation
   *
   * @returns True if last validation passed, false otherwise
   */
  isValid(): boolean {
    return this.validationResult?.overallStatus === "pass";
  }

  // ========================================================================
  // Private Helper Methods
  // ========================================================================

  /**
   * Perform dataset and cross-dataset validation
   */
  private performValidation(
    connection: DuckDBConnection,
    datasets: readonly DatasetConfig[],
    validationSettings: ValidationConfig,
    workspaceId: string,
    configPath: string,
    startTime: number,
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceValidationError> {
    const workspace = this.workspace;

    return Effect.gen(function* (_) {
      // Validate each dataset
      const datasetResults: DatasetValidationResult[] = [];

      for (const dataset of datasets) {
        // Resolve validation profile (explicit profile or derived from spec)
        const datasetProfile = resolveDatasetProfile(dataset);

        const result = yield* _(
          validateDataset(connection, dataset, datasetProfile, validationSettings),
        );

        datasetResults.push(result);

        // Fail-fast if enabled and we have critical errors
        if (validationSettings.failFast && result.status === "fail") {
          break;
        }
      }

      // Validate cross-dataset rules if provided
      const config = workspace.getConfig();
      const crossDatasetResults = [];
      if (
        "crossDatasetRules" in config && config.crossDatasetRules && !validationSettings.failFast
      ) {
        const constraintValidator = new ConstraintValidator(connection, datasets);
        for (const rule of config.crossDatasetRules) {
          const result = yield* _(
            constraintValidator.validateRule(rule),
          );
          crossDatasetResults.push(result);
        }
      }

      // Calculate summary
      const summary = calculateSummary(datasetResults);
      const totalProcessingTimeMs = Date.now() - startTime;

      // Determine overall status based on dataset results
      let overallStatus: "fail" | "warn" | "pass";
      if (summary.datasetsFailedCount > 0) {
        overallStatus = "fail";
      } else if (summary.datasetsWithWarningsCount > 0) {
        overallStatus = "warn";
      } else {
        overallStatus = "pass";
      }

      return {
        workspaceId,
        configPath,
        validatedAt: new Date(),
        totalProcessingTimeMs,
        overallStatus,
        datasetResults,
        crossDatasetResults,
        summary,
      };
    });
  }
}
