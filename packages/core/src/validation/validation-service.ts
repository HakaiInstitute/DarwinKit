/**
 * Validation Service - Effect-based validation operations
 *
 * This service encapsulates all validation logic for datasets.
 * It operates on in-memory data structures (datasets and settings)
 * without file I/O responsibilities (WorkspaceService handles that).
 *
 * @module validation-service
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { DatasetConfig, ValidationSettings, WorkspaceValidationResult } from "@dwkt/domain";
import { ValidationError } from "../errors/index.ts";
import { WorkspaceValidator } from "./workspace-validator.ts";

export { ValidationError } from "../errors/index.ts";

/**
 * Validation Service - Effect service for dataset validation
 *
 * This service provides validation operations for datasets according to
 * their specifications and field mappings. It operates on in-memory data
 * structures and manages its own DuckDB instance for validation queries.
 *
 * The service is designed to be:
 * - Stateless: Each validation creates a new DuckDB instance
 * - Isolated: No shared state between validations
 * - Composable: Can be easily mocked or replaced for testing
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const validationService = yield* ValidationService;
 *
 *   // Validate datasets from workspace config
 *   const result = yield* validationService.validateDatasets(
 *     workspace.config.validation.datasets,
 *     workspace.config.validation,
 *     dirname(workspace.configPath)
 *   );
 *
 *   return result;
 * });
 *
 * // Provide layers at entry point
 * const result = await Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(ValidationService.layer)
 *   )
 * );
 * ```
 */
export class ValidationService extends Context.Tag("@dwkt/ValidationService")<
  ValidationService,
  {
    /**
     * Validate multiple datasets according to their specifications
     *
     * Creates an isolated DuckDB instance, loads all datasets, runs validation
     * on each dataset according to its spec and field mappings, executes
     * cross-dataset rules, and returns comprehensive validation results.
     *
     * @param datasets - Dataset configurations with specs and field mappings
     * @param settings - Validation settings (null values, fail-fast, etc.)
     * @param basePath - Base directory path for resolving dataset file paths
     * @returns Effect that yields validation results or fails with ValidationError
     */
    readonly validateDatasets: (
      datasets: readonly DatasetConfig[],
      settings: ValidationSettings,
      basePath: string,
    ) => Effect.Effect<WorkspaceValidationResult, ValidationError>;
  }
>() {
  /**
   * Default layer implementation for ValidationService
   *
   * Provides a concrete implementation that delegates directly to
   * WorkspaceValidator.validateDatasets()
   */
  static readonly layer = Layer.succeed(
    ValidationService,
    ValidationService.of({
      validateDatasets: (
        datasets: readonly DatasetConfig[],
        settings: ValidationSettings,
        basePath: string,
      ): Effect.Effect<WorkspaceValidationResult, ValidationError> => {
        // Create validator and call directly with in-memory config
        const validator = new WorkspaceValidator();
        return validator.validateDatasets(datasets, settings, basePath).pipe(
          Effect.mapError((error) =>
            new ValidationError({
              message: error.message,
              cause: error.cause,
            })
          ),
        );
      },
    }),
  );
}
