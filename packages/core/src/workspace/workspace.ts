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
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

import type {
  ConfigWithValidation,
  DatasetConfig,
  ValidationSettings,
  WorkspaceConfig,
  WorkspaceValidationResult,
} from "@dwkt/domain";
import { hasValidationConfig, workspaceConfigSchema } from "@dwkt/domain";

import { ValidationError } from "../errors/index.ts";
import { WorkspaceValidator } from "../validation/workspace-validator.ts";

import {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
  TransformInputNotFoundError,
  ValidationConfigMissingError,
  type WorkspaceConfigError,
} from "./errors.ts";

// Configuration file constants
const DEFAULT_CONFIG_FILENAME = "darwinkit.json";
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
 *     const workspace = yield* Workspace.open("./darwinkit.json");
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
   * const workspace = yield* Workspace.open("./darwinkit.json");
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
    ValidationError | ValidationConfigMissingError
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
   * const workspace = yield* Workspace.open("./my-project/darwinkit.json");
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
              format: "json",
            }),
        });

        const connection = yield* Effect.tryPromise({
          try: () => instance.connect(),
          catch: () =>
            new ConfigParseError({
              message: "Failed to connect to DuckDB",
              configPath: resolvedPath,
              format: "json",
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
 * Discover darwinkit.json configuration file
 *
 * Searches for configuration starting from the given path:
 * - If searchDir is a file, returns it directly
 * - Otherwise searches up the directory tree for darwinkit.json
 */
function discoverConfig(
  searchDir: string = Deno.cwd(),
): Effect.Effect<string, ConfigNotFoundError> {
  return Effect.gen(function* () {
    let currentDir = resolve(searchDir);
    let depth = 0;
    const searchedPaths: string[] = [];

    // Check if searchDir is a file (direct config path provided)
    const isDirectFile = yield* isFile(currentDir);
    if (isDirectFile) {
      return currentDir;
    }

    // Search up the directory tree
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

    const isYaml = configPath.endsWith(".yaml") || configPath.endsWith(".yml");

    let configJson: unknown;
    if (isYaml) {
      configJson = yield* Effect.try({
        try: () => parseYAML(configContent),
        catch: (error) =>
          new ConfigParseError({
            message: `Invalid YAML syntax`,
            configPath,
            format: "yaml",
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      });
    } else {
      configJson = yield* Effect.try({
        try: () => JSON.parse(configContent),
        catch: (error) =>
          new ConfigParseError({
            message: `Invalid JSON syntax`,
            configPath,
            format: "json",
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      });
    }

    const configRecord = configJson as Record<string, unknown>;
    const configWithMeta = {
      id: configRecord.id || "workspace-" + Date.now(),
      ...configRecord,
      createdAt: configRecord.createdAt || new Date().toISOString(),
      updatedAt: configRecord.updatedAt || new Date().toISOString(),
    };

    const config = yield* Effect.try({
      try: () => {
        const decoded = Schema.decodeUnknownSync(workspaceConfigSchema)(
          configWithMeta,
        );
        return decoded;
      },
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
