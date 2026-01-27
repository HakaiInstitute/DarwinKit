/**
 * Validation Service - Effect-based validation operations
 *
 * This service encapsulates all validation logic for datasets.
 * It operates on in-memory data structures (datasets and settings)
 * without file I/O responsibilities (WorkspaceService handles that).
 *
 * @module validation-service
 */

import { dirname } from "@std/path";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type { DatasetConfig, ValidationSettings, WorkspaceValidationResult } from "@dwkt/domain";
import {
  WorkspaceValidationError as WorkspaceValError,
  WorkspaceValidator,
} from "./workspace-validator.ts";

/**
 * Error classes for validation operations
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

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
 *     workspace.configPath
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
   * Provides a concrete implementation that uses the existing workspace
   * validator logic. This delegates to the WorkspaceValidator class which
   * contains all the validation logic.
   */
  static readonly layer = Layer.succeed(
    ValidationService,
    ValidationService.of({
      validateDatasets: (
        datasets: readonly DatasetConfig[],
        settings: ValidationSettings,
        basePath: string,
      ): Effect.Effect<WorkspaceValidationResult, ValidationError> =>
        Effect.gen(function* (_) {
          // Create temporary config for WorkspaceValidator
          // This is a bridge solution - eventually we'll extract validation logic
          const tempConfigPath = yield* _(
            createTempConfig(datasets, settings, basePath),
          );

          // Use WorkspaceValidator to perform validation
          const validator = new WorkspaceValidator();
          const result = yield* _(
            validator.validateFromConfig(dirname(tempConfigPath)).pipe(
              Effect.mapError((error: WorkspaceValError) =>
                new ValidationError({
                  message: error.message,
                  cause: error.cause,
                })
              ),
              // Clean up temp config file after validation (success or failure)
              Effect.ensuring(
                Effect.tryPromise(() => Deno.remove(tempConfigPath)).pipe(
                  Effect.catchAll(() => Effect.void),
                ),
              ),
            ),
          );

          return result;
        }),
    }),
  );
}

/**
 * Create temporary config file for validation
 *
 * This is a bridge solution while we refactor validation logic.
 * Eventually we'll extract the validation logic from WorkspaceValidator
 * so we don't need temporary files.
 */
function createTempConfig(
  datasets: readonly DatasetConfig[],
  settings: ValidationSettings,
  basePath: string,
): Effect.Effect<string, ValidationError> {
  return Effect.gen(function* (_) {
    // Create temp directory
    const tempDir = yield* _(
      Effect.tryPromise({
        try: () => Deno.makeTempDir({ prefix: "darwinkit-validation-" }),
        catch: (error) =>
          new ValidationError({
            message: "Failed to create temp directory",
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }),
    );

    const configPath = `${tempDir}/darwinkit.json`;

    // Create minimal config structure
    const config = {
      id: "temp-validation-" + Date.now(),
      name: "Temporary Validation Config",
      version: "1.0.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      validation: {
        ...settings,
        datasets: datasets.map((ds) => ({
          ...ds,
          // Resolve paths relative to original base path
          path: `${basePath}/${ds.path}`,
        })),
      },
    };

    // Write config to file
    yield* _(
      Effect.tryPromise({
        try: () => Deno.writeTextFile(configPath, JSON.stringify(config, null, 2)),
        catch: (error) =>
          new ValidationError({
            message: "Failed to write temp config",
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }),
    );

    return configPath;
  });
}
