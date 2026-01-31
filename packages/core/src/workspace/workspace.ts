/**
 * Workspace
 *
 * Provides a stateful Workspace that owns a DuckDB connection via Effect's
 * `acquireRelease` and `Scope`. This enables automatic resource cleanup
 * while supporting connection reuse across multiple operations.
 *
 * @module workspace/workspace
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";
import { dirname, join, resolve } from "@std/path";
import { parse as parseYAML } from "@std/yaml";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

import type { WorkspaceConfigError } from "@dwkt/domain/errors";
import {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
  NoDatasetsDefinedError,
  TransformInputNotFoundError,
  ValidationConfigMissingError,
} from "@dwkt/domain/errors";
import type {
  ConfigWithValidation,
  DatasetConfig,
  ValidationSettings,
  WorkspaceConfig,
} from "@dwkt/domain/schemas";
import { decodeWorkspaceConfig, hasValidationConfig } from "@dwkt/domain/schemas";
import type { WorkspaceValidationResult } from "@dwkt/domain/types";

import { ValidationError } from "../errors/mod.ts";
import { WorkspaceValidator } from "../validation/workspace-validator.ts";

// Configuration file constants
const DEFAULT_CONFIG_FILENAME = "darwinkit.yaml";
const MAX_SEARCH_DEPTH = 10;

/**
 * Validation options for workspace validation
 */
export interface ValidationOptions {
  readonly failFast?: boolean;
}

/**
 * Workspace
 *
 * A workspace that owns its DuckDB connection and provides it to all operations.
 * Resources are automatically cleaned up via Effect's Scope when the workspace
 * is released.
 *
 * @example
 * ```typescript
 * const program = Effect.scoped(
 *   Effect.gen(function* () {
 *     const workspace = yield* Workspace.open("./darwinkit.yaml");
 *     return yield* workspace.validate();
 *   })
 * );
 * ```
 */
export class Workspace {
  private constructor(
    /**
     * The workspace configuration
     */
    readonly config: WorkspaceConfig,
    /**
     * Absolute path to the configuration file
     */
    readonly configPath: string,
    /**
     * Base directory path for resolving relative paths in config
     */
    readonly basePath: string,
    /**
     * The DuckDB connection (owned by this workspace)
     */
    private readonly connection: DuckDBConnection,
    /**
     * The DuckDB instance (owned by this workspace)
     */
    private readonly instance: DuckDBInstance,
  ) {}

  /**
   * Workspace name from configuration
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * Workspace description from configuration
   */
  get description(): string | undefined {
    return this.config.description;
  }

  /**
   * Whether this workspace has validation configuration
   */
  get hasValidation(): boolean {
    return hasValidationConfig(this.config);
  }

  /**
   * Validate datasets according to configuration
   *
   * Runs validation on all datasets defined in the workspace configuration,
   * including field-level validation and cross-dataset constraint checking.
   *
   * @param options - Validation options
   * @returns Effect that yields validation results or fails with ValidationError
   *
   * @example
   * ```typescript
   * const workspace = yield* Workspace.open("./darwinkit.yaml");
   * const results = yield* workspace.validate({ failFast: false });
   *
   * if (results.status === "error") {
   *   console.error(`Found ${results.summary.errorCount} errors`);
   * }
   * ```
   */
  validate(
    options?: ValidationOptions,
  ): Effect.Effect<
    WorkspaceValidationResult,
    ValidationError | ValidationConfigMissingError | NoDatasetsDefinedError
  > {
    return Effect.gen(this, function* () {
      if (!this.hasValidation) {
        return yield* Effect.fail(
          new ValidationConfigMissingError({
            message: `Workspace '${this.name}' does not have validation configuration`,
            workspaceName: this.name,
          }),
        );
      }

      const configWithValidation = this.config as ConfigWithValidation;
      const datasets = configWithValidation.validation.datasets;

      if (datasets.length === 0) {
        return yield* Effect.fail(
          new NoDatasetsDefinedError({ message: `Validation config has no datasets defined` }),
        );
      }

      const configSettings = configWithValidation.validation;

      // Merge options with config settings (options take precedence)
      const settings = options?.failFast !== undefined
        ? { ...configSettings, failFast: options.failFast }
        : configSettings;

      // Get cross-dataset rules from config (if present)
      const crossDatasetRules = "crossDatasetRules" in this.config
        ? this.config.crossDatasetRules
        : undefined;

      // Use the existing WorkspaceValidator with the workspace's connection
      const validator = new WorkspaceValidator();
      const result = yield* validator.validateDatasetsWithConnection(
        this.connection,
        datasets,
        settings,
        this.basePath,
        this.config.id,
        crossDatasetRules,
      ).pipe(
        Effect.mapError((error) =>
          new ValidationError({
            message: error.message,
            cause: error.cause,
          })
        ),
      );

      return result;
    });
  }

  /**
   * Get the validation datasets from configuration
   *
   * @returns Array of dataset configurations, or empty array if no validation config
   */
  getValidationDatasets(): readonly DatasetConfig[] {
    if (!this.hasValidation) {
      return [];
    }
    return (this.config as ConfigWithValidation).validation.datasets;
  }

  /**
   * Get the validation settings from configuration
   *
   * @returns Validation settings, or undefined if no validation config
   */
  getValidationSettings(): ValidationSettings | undefined {
    if (!this.hasValidation) {
      return undefined;
    }
    return (this.config as ConfigWithValidation).validation;
  }

  /**
   * Open a workspace - returns scoped Effect for automatic cleanup
   *
   * Discovers and loads configuration, creates a DuckDB instance with connection,
   * and returns a Workspace that will automatically clean up resources when the
   * Effect's scope ends.
   *
   * @param configPath - Optional path to config file or directory containing it
   * @returns Scoped Effect that yields a Workspace
   *
   * @example
   * ```typescript
   * // With explicit config path
   * const workspace = yield* Workspace.open("./my-project/darwinkit.yaml");
   *
   * // Auto-discover config in current/parent directories
   * const workspace = yield* Workspace.open();
   *
   * // Resources are automatically released when scope ends
   * ```
   */
  static open(
    configPath?: string,
  ): Effect.Effect<Workspace, WorkspaceConfigError, Scope.Scope> {
    return Effect.acquireRelease(
      // Acquire: load config, create DuckDB instance and connection
      Effect.gen(function* () {
        // Discover and load configuration
        const resolvedPath = yield* discoverConfig(configPath);
        const config = yield* loadConfig(resolvedPath);
        const basePath = dirname(resolvedPath);

        // Validate that referenced files exist
        yield* validateDatasetPaths(config, basePath);

        // Create DuckDB instance and connection
        const instance = yield* Effect.tryPromise({
          try: () => DuckDBInstance.create(":memory:"),
          catch: () =>
            new ConfigParseError({
              message: "Failed to create DuckDB instance",
              configPath: resolvedPath,
            }),
        });

        const connection = yield* Effect.tryPromise({
          try: () => instance.connect(),
          catch: () =>
            new ConfigParseError({
              message: "Failed to connect to DuckDB",
              configPath: resolvedPath,
            }),
        });

        return new Workspace(config, resolvedPath, basePath, connection, instance);
      }),
      // Release: close connection and instance (always runs, even on error)
      (workspace) =>
        Effect.sync(() => {
          try {
            workspace.connection.closeSync();
            workspace.instance.closeSync();
          } catch {
            // Ignore cleanup errors - resource may already be released
          }
        }),
    );
  }
}

// ============================================================================
// Helper Functions (internal)
// ============================================================================

/**
 * Check if a path exists and is a file
 */
const isFile = (path: string): Effect.Effect<boolean> =>
  Effect.tryPromise(() => Deno.stat(path)).pipe(
    Effect.match({
      onFailure: () => false,
      onSuccess: (stat) => stat.isFile,
    }),
  );

/**
 * Check if a path exists
 */
const pathExists = (path: string): Effect.Effect<boolean> =>
  Effect.tryPromise(() => Deno.stat(path)).pipe(
    Effect.match({
      onFailure: () => false,
      onSuccess: () => true,
    }),
  );

/**
 * Check if a path looks like a config file (has .yaml or .yml extension)
 */
const isConfigFilePath = (path: string): boolean => {
  const lower = path.toLowerCase();
  return lower.endsWith(".yaml") || lower.endsWith(".yml");
};

/**
 * Discover darwinkit.yaml configuration file
 *
 * Searches for configuration starting from the given path:
 * - If searchDir looks like a config file path, checks if it exists and fails with clear error if not
 * - If searchDir is an existing file, returns it directly
 * - Otherwise searches up the directory tree for darwinkit.yaml
 */
function discoverConfig(
  searchDir: string = Deno.cwd(),
): Effect.Effect<string, ConfigNotFoundError> {
  return Effect.gen(function* () {
    const resolvedPath = resolve(searchDir);

    // If user provided a path that looks like a config file, check if it exists
    if (isConfigFilePath(resolvedPath)) {
      const exists = yield* isFile(resolvedPath);
      if (exists) {
        return resolvedPath;
      }
      // File path provided but doesn't exist - fail with clear error
      return yield* Effect.fail(
        new ConfigNotFoundError({
          message: `Configuration file not found at specified path: ${searchDir}`,
          searchedPaths: [resolvedPath],
          startDirectory: dirname(resolvedPath),
        }),
      );
    }

    // Check if searchDir is an existing file (direct config path without standard extension)
    const isDirectFile = yield* isFile(resolvedPath);
    if (isDirectFile) {
      return resolvedPath;
    }

    // Search up the directory tree for darwinkit.yaml
    let currentDir = resolvedPath;
    let depth = 0;
    const searchedPaths: string[] = [];

    while (depth < MAX_SEARCH_DEPTH) {
      const configPath = join(currentDir, DEFAULT_CONFIG_FILENAME);
      searchedPaths.push(configPath);

      const exists = yield* pathExists(configPath);
      if (exists) {
        return configPath;
      }

      const parentDir = dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }

      currentDir = parentDir;
      depth++;
    }

    return yield* Effect.fail(
      new ConfigNotFoundError({
        message: `Configuration file '${DEFAULT_CONFIG_FILENAME}' not found`,
        searchedPaths,
        startDirectory: searchDir,
      }),
    );
  });
}

/**
 * Load workspace configuration from file path
 */
function loadConfig(
  configPath: string,
): Effect.Effect<
  WorkspaceConfig,
  ConfigNotFoundError | ConfigParseError | ConfigValidationError
> {
  return Effect.gen(function* () {
    const configContent = yield* Effect.tryPromise({
      try: () => Deno.readTextFile(configPath),
      catch: () =>
        new ConfigNotFoundError({
          message: `Configuration file not found: ${configPath}`,
          searchedPaths: [configPath],
          startDirectory: dirname(configPath),
        }),
    });

    const parsedConfig = yield* Effect.try({
      try: () => parseYAML(configContent),
      catch: (error) =>
        new ConfigParseError({
          message: `Invalid YAML syntax`,
          configPath,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });

    const config = yield* Effect.try({
      try: () => decodeWorkspaceConfig(parsedConfig),
      catch: (error) => {
        // Extract validation errors from the error message
        const errorStr = String(error);
        const validationErrors = errorStr
          .split("\n")
          .filter((line) => line.trim().length > 0);

        return new ConfigValidationError({
          message: `Configuration schema validation failed`,
          configPath,
          validationErrors,
        });
      },
    });

    return config;
  });
}

/**
 * Validate dataset file paths exist (parallel validation)
 */
function validateDatasetPaths(
  config: WorkspaceConfig,
  base: string,
): Effect.Effect<
  void,
  DatasetFileNotFoundError | TransformInputNotFoundError
> {
  const configPath = join(base, DEFAULT_CONFIG_FILENAME);
  const validations: Effect.Effect<
    void,
    DatasetFileNotFoundError | TransformInputNotFoundError
  >[] = [];

  // Collect validation dataset paths
  if ("validation" in config && config.validation) {
    for (const dataset of config.validation.datasets) {
      const filePath = resolve(base, dataset.path);
      validations.push(
        Effect.tryPromise({
          try: () => Deno.stat(filePath),
          catch: () =>
            new DatasetFileNotFoundError({
              message: `Dataset file not found`,
              datasetName: dataset.name,
              filePath,
              configPath,
            }),
        }).pipe(Effect.asVoid),
      );
    }
  }

  // Collect transform input paths
  if ("transform" in config && config.transform) {
    for (const [inputName, path] of Object.entries(config.transform.inputs)) {
      if (typeof path !== "string") continue;
      const filePath = resolve(base, path);
      validations.push(
        Effect.tryPromise({
          try: () => Deno.stat(filePath),
          catch: () =>
            new TransformInputNotFoundError({
              message: `Transform input file not found`,
              inputName,
              filePath,
              configPath,
            }),
        }).pipe(Effect.asVoid),
      );
    }
  }

  // Run all validations in parallel - fail on first error
  return validations.length > 0
    ? Effect.all(validations, { concurrency: "unbounded" }).pipe(Effect.asVoid)
    : Effect.void;
}
