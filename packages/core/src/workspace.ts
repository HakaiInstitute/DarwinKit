/**
 * Workspace - Stateful workspace management
 *
 * Represents a single Darwin Core data project with its configuration,
 * datasets, and validation state. Consolidates configuration loading,
 * validation, and state management into a cohesive API.
 *
 * Based on the vision from issue #34:
 * - Maintains state about a single project
 * - Encapsulates configuration loading
 * - Provides clean validation API
 * - Foundation for interactive workflows
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";
import type {
  DatasetConfig,
  ValidationSettings,
  WorkspaceConfig,
  WorkspaceValidationResult,
} from "@dwkt/domain";
import {
  createTaggedFormatter,
  ErrorCode,
  isValidationOnlyConfig,
  prettyPrintCause,
  resolveDatasetProfile,
  workspaceConfigSchema,
} from "@dwkt/domain";
import { dirname, join, resolve } from "@std/path";
import type * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as YAML from "js-yaml";
// Import validation functions - these will be used internally
import {
  sanitizeTableName,
  WorkspaceImportCSV,
  WorkspaceImportSchema,
} from "./validation/database/index.ts";
import { calculateSummary, WorkspaceValidationError } from "./validation/utils.ts";
import { validateDataset } from "./validation/dataset-validator.ts";
import { validateCrossDatasetRule } from "./validation/field-validators.ts";

/**
 * Error classes for workspace configuration operations
 *
 * Using Data.TaggedError for proper Effect integration and type-safe error handling.
 * Each error extends Data.TaggedError with a unique tag for pattern matching.
 */
export class ConfigNotFoundError extends Data.TaggedError("ConfigNotFoundError")<{
  readonly message: string;
  readonly searchDir: string;
  readonly searchedPaths: readonly string[];
}> {
  readonly code = ErrorCode.FILE_NOT_FOUND;
}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  readonly message: string;
  readonly configPath: string;
  readonly cause?: Error;
}> {
  readonly code = ErrorCode.PARSE_ERROR;
}

export class ConfigValidationError extends Data.TaggedError("ConfigValidationError")<{
  readonly message: string;
  readonly configPath: string;
  readonly validationErrors: readonly string[];
}> {
  readonly code = ErrorCode.VALIDATION_FAILED;
}

export class DatasetFileNotFoundError extends Data.TaggedError("DatasetFileNotFoundError")<{
  readonly message: string;
  readonly datasetName: string;
  readonly filePath: string;
}> {
  readonly code = ErrorCode.FILE_NOT_FOUND;
}

/**
 * Union type of all configuration errors
 */
export type ConfigError =
  | ConfigNotFoundError
  | ConfigParseError
  | ConfigValidationError
  | DatasetFileNotFoundError;

/**
 * Format configuration-specific errors using tagged error pattern matching
 *
 * This formatter leverages Data.TaggedError's _tag property for type-safe
 * pattern matching, similar to Effect.catchTags. Each formatter is automatically
 * typed based on the error tag.
 */
const formatConfigError = createTaggedFormatter<ConfigError>({
  ConfigNotFoundError: (error) => {
    const pathsList = error.searchedPaths.map((p) => `  - ${p}`).join("\n");
    return `${error.message}\n\nSearched paths:\n${pathsList}\n\nSuggestion: Create 'darwinkit.json' in your project directory or a parent directory.`;
  },
  ConfigParseError: (error) => {
    return `Failed to parse configuration file: ${error.configPath}\n\n${error.message}\n\nCause: ${error.cause?.message}`;
  },
  ConfigValidationError: (error) => {
    return `Configuration validation failed: ${error.configPath}\n\nValidation errors:\n${
      error.validationErrors.map((e) => `  - ${e}`).join("\n")
    }`;
  },
  DatasetFileNotFoundError: (error) => {
    return `Dataset file not found:\n  Dataset: ${error.datasetName}\n  Path: ${error.filePath}\n\nCheck that the path in darwinkit.json is correct.`;
  },
});

/**
 * Pretty print configuration errors using Effect's Cause
 *
 * This is a specialized version of prettyPrintCause for config errors.
 * Uses the generic Cause infrastructure with config-specific formatting.
 *
 * @param cause - The Cause containing config-related errors
 * @returns Human-readable error message with config-specific context
 */
export function prettyPrintConfigError(
  cause: Cause.Cause<ConfigError>,
): string {
  return prettyPrintCause(cause, formatConfigError);
}

// Configuration file constants
const DEFAULT_CONFIG_FILENAME = "darwinkit.json";
const MAX_SEARCH_DEPTH = 10;

/**
 * Workspace class - represents a single Darwin Core data project
 *
 * Encapsulates all workspace state including configuration, datasets,
 * and validation results. Provides a clean API for working with
 * biodiversity data validation workflows.
 *
 * Manages a reusable DuckDB connection for validation operations,
 * improving performance when validating multiple times.
 */
export class Workspace {
  private readonly config: WorkspaceConfig;
  private readonly configPath: string;

  /**
   * DuckDB connection state (lazy-initialized, reused across validations)
   *
   * Design invariant: Connection reuse is guaranteed by structure:
   * - getOrCreateConnection() is the ONLY method that creates connections
   * - It checks `if (this.duckdb)` before creating (guard clause)
   * - validate() is the only caller of getOrCreateConnection()
   * - close() sets this to undefined (enables recreation)
   *
   * Therefore: first validate() creates connection, subsequent calls reuse it.
   */
  private duckdb?: {
    instance: DuckDBInstance;
    connection: DuckDBConnection;
  };

  /**
   * Cached validation result from the last validation run
   *
   * Updated each time validate() is called. Allows querying validation
   * state without re-running validation.
   *
   * TODO: This will need to be cleared any time the configuration or a dataset
   * is modified.
   */
  private validationResult?: WorkspaceValidationResult;

  /**
   * Private constructor - use static factory methods to create instances
   *
   * @param config - Validated workspace configuration
   * @param configPath - Path to the configuration file
   */
  private constructor(config: WorkspaceConfig, configPath: string) {
    this.config = config;
    this.configPath = configPath;
  }

  /**
   * Discover darwinkit.json configuration file
   *
   * Searches upward from the given directory until a darwinkit.json is found
   * or the maximum search depth is reached.
   *
   * @internal - Use Workspace.discover() or Workspace.fromPath() instead
   */
  static discoverConfigPath(
    searchDir: string = Deno.cwd(),
  ): Effect.Effect<string, ConfigNotFoundError> {
    return Effect.gen(function* (_) {
      let currentDir = resolve(searchDir);
      let depth = 0;
      const searchedPaths: string[] = [];

      /* check if config parameter is a file. No need to search if full config file path is provided.
        this also allows config files named something other than "darwinkit.json" */
      const statResult = yield* Effect.tryPromise(() => Deno.stat(currentDir)).pipe(
        Effect.option,
      );

      if (statResult._tag === "Some" && statResult.value.isFile) {
        return currentDir;
      }

      while (depth < MAX_SEARCH_DEPTH) {
        const configPath = join(currentDir, DEFAULT_CONFIG_FILENAME);
        searchedPaths.push(configPath);

        // Check if config exists at this level
        const checkResult = yield* _(
          Effect.tryPromise({
            try: () => Deno.stat(configPath),
            catch: () => new Error("not found"),
          }).pipe(
            Effect.map(() => true),
            Effect.catchAll(() => Effect.succeed(false)),
          ),
        );

        if (checkResult) {
          return configPath;
        }

        // Move up one directory
        const parentDir = dirname(currentDir);

        // Check if we've reached the root
        if (parentDir === currentDir) {
          break;
        }

        currentDir = parentDir;
        depth++;
      }

      // Config not found - include all searched paths in error
      return yield* _(
        Effect.fail(
          new ConfigNotFoundError({
            message:
              `Configuration file '${DEFAULT_CONFIG_FILENAME}' not found in '${searchDir}' or any parent directory`,
            searchDir,
            searchedPaths,
          }),
        ),
      );
    });
  }

  /**
   * Load workspace configuration from file path
   *
   * @internal - Use Workspace.discover() or Workspace.fromPath() instead
   */
  static loadAndValidateConfig(
    configPath: string,
  ): Effect.Effect<WorkspaceConfig, ConfigParseError | ConfigValidationError> {
    return Effect.gen(function* (_) {
      // Read configuration file
      const configContent = yield* _(
        Effect.tryPromise({
          try: () => Deno.readTextFile(configPath),
          catch: (error) =>
            new ConfigParseError({
              message: `Failed to read configuration file: ${error}`,
              configPath,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );

      // Parse as unknown - will be validated by WorkspaceConfig schema below
      let configJson: unknown;
      if (configPath.endsWith(".yaml") || configPath.endsWith(".yml")) {
        // Parse YAML
        configJson = yield* _(
          Effect.try({
            try: () => {
              return YAML.load(configContent);
            },
            catch: (error) =>
              new ConfigParseError({
                message: `Invalid YAML in configuration file: ${error}`,
                configPath,
                cause: error instanceof Error ? error : new Error(String(error)),
              }),
          }),
        );
      } else {
        // Parse JSON
        configJson = yield* _(
          Effect.try({
            try: () => JSON.parse(configContent),
            catch: (error) =>
              new ConfigParseError({
                message: `Invalid JSON in configuration file: ${error}`,
                configPath,
                cause: error instanceof Error ? error : new Error(String(error)),
              }),
          }),
        );
      }

      // Add metadata if missing (keep as strings for schema validation)
      const configRecord = configJson as Record<string, unknown>;
      const configWithMeta = {
        id: configRecord.id || "workspace-" + Date.now(),
        ...configRecord,
        createdAt: configRecord.createdAt || new Date().toISOString(),
        updatedAt: configRecord.updatedAt || new Date().toISOString(),
      };

      // Validate against schema
      const config = yield* _(
        Effect.try({
          try: () => Schema.decodeUnknownSync(workspaceConfigSchema)(configWithMeta),
          catch: (error) =>
            new ConfigValidationError({
              message: `Configuration validation failed`,
              configPath,
              validationErrors: [String(error)],
            }),
        }),
      );

      return config;
    });
  }

  /**
   * Validate that all dataset file paths exist
   *
   * @internal - Use Workspace.discover() or Workspace.fromPath() instead
   */
  static validateDatasetPaths(
    config: WorkspaceConfig,
    basePath: string,
  ): Effect.Effect<void, DatasetFileNotFoundError> {
    return Effect.gen(function* (_) {
      // Check validation datasets if present
      if (isValidationOnlyConfig(config)) {
        for (const dataset of config.validation.datasets) {
          const filePath = resolve(basePath, dataset.path);

          yield* _(
            Effect.tryPromise({
              try: () => Deno.stat(filePath),
              catch: () =>
                new DatasetFileNotFoundError({
                  message: `Dataset file not found: ${filePath}`,
                  datasetName: dataset.name,
                  filePath,
                }),
            }),
          );
        }
      }

      // Check transform inputs if present
      if ("transform" in config && config.transform) {
        for (const [inputName, path] of Object.entries(config.transform.inputs)) {
          if (typeof path !== "string") continue;

          const filePath = resolve(basePath, path);

          yield* _(
            Effect.tryPromise({
              try: () => Deno.stat(filePath),
              catch: () =>
                new DatasetFileNotFoundError({
                  message: `Transform input file not found: ${filePath}`,
                  datasetName: inputName,
                  filePath,
                }),
            }),
          );
        }
      }
    });
  }

  /**
   * Discover and load workspace from current or parent directories
   *
   * Searches upward from the given directory until a darwinkit.json
   * configuration file is found, then loads and validates it.
   *
   * @param searchDir - Directory to start searching from (defaults to current directory)
   * @returns Effect that yields a Workspace instance
   *
   * @example
   * ```typescript
   * // Auto-discover in current directory
   * const workspace = await Effect.runPromise(Workspace.discover());
   *
   * // Search from specific directory
   * const workspace = await Effect.runPromise(
   *   Workspace.discover("./project")
   * );
   * ```
   */
  static discover(
    searchDir?: string,
  ): Effect.Effect<
    Workspace,
    ConfigNotFoundError | ConfigParseError | ConfigValidationError | DatasetFileNotFoundError
  > {
    return Effect.gen(function* (_) {
      // Discover config file
      const configPath = yield* _(Workspace.discoverConfigPath(searchDir));

      // Load and validate config
      const config = yield* _(Workspace.loadAndValidateConfig(configPath));

      // Validate dataset paths
      const basePath = dirname(configPath);
      yield* _(Workspace.validateDatasetPaths(config, basePath));

      // Create workspace instance
      return new Workspace(config, configPath);
    });
  }

  /**
   * Load workspace from a specific configuration file path
   *
   * @param configPath - Path to darwinkit.json configuration file
   * @returns Effect that yields a Workspace instance
   *
   * @example
   * ```typescript
   * const workspace = await Effect.runPromise(
   *   Workspace.fromPath("./project/darwinkit.json")
   * );
   * ```
   */
  static fromPath(
    configPath: string,
  ): Effect.Effect<
    Workspace,
    ConfigParseError | ConfigValidationError | DatasetFileNotFoundError
  > {
    return Effect.gen(function* (_) {
      // Load and validate config
      const config = yield* _(Workspace.loadAndValidateConfig(configPath));

      // Validate dataset paths
      const basePath = dirname(configPath);
      yield* _(Workspace.validateDatasetPaths(config, basePath));

      // Create workspace instance
      return new Workspace(config, configPath);
    });
  }

  /**
   * Get the workspace configuration
   *
   * @returns The workspace configuration object
   */
  getConfig(): WorkspaceConfig {
    return this.config;
  }

  /**
   * Get the path to the configuration file
   *
   * @returns Path to darwinkit.json
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Get the workspace name
   *
   * @returns Workspace name from configuration
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Get the workspace version
   *
   * @returns Workspace version from configuration
   */
  getVersion(): string {
    return this.config.version;
  }

  /**
   * Get the workspace description
   *
   * @returns Workspace description if set
   */
  getDescription(): string | undefined {
    return this.config.description;
  }

  /**
   * Get the cached validation result from the last validation run
   *
   * Returns undefined if validate() has not been called yet.
   *
   * @returns Last validation result, or undefined if not yet validated
   *
   * @example
   * ```typescript
   * const workspace = await Effect.runPromise(Workspace.discover());
   * console.log(workspace.getValidationResult()); // undefined
   *
   * await Effect.runPromise(workspace.validate());
   * const result = workspace.getValidationResult(); // WorkspaceValidationResult
   * ```
   */
  getValidationResult(): WorkspaceValidationResult | undefined {
    return this.validationResult;
  }

  /**
   * Check if the workspace is currently valid
   *
   * Returns true if the last validation passed without errors.
   * Returns false if validation failed, had warnings, or hasn't been run yet.
   *
   * @returns true if last validation passed, false otherwise
   *
   * @example
   * ```typescript
   * const workspace = await Effect.runPromise(Workspace.discover());
   * console.log(workspace.isValid()); // false (not validated yet)
   *
   * await Effect.runPromise(workspace.validate());
   * if (workspace.isValid()) {
   *   console.log("All datasets are valid!");
   * }
   * ```
   */
  isValid(): boolean {
    return this.validationResult?.overallStatus === "pass";
  }

  /**
   * Get all datasets configured in the workspace
   *
   * Returns an empty array if the workspace doesn't have validation configured.
   *
   * @returns Array of dataset configurations
   *
   * @example
   * ```typescript
   * const workspace = await Effect.runPromise(Workspace.discover());
   * const datasets = workspace.getDatasets();
   * console.log(`Found ${datasets.length} datasets`);
   * ```
   */
  getDatasets(): readonly DatasetConfig[] {
    if (!("validation" in this.config)) {
      return [];
    }
    return this.config.validation.datasets || [];
  }

  /**
   * Get a specific dataset by name
   *
   * @param name - Dataset name to find
   * @returns Dataset configuration, or undefined if not found
   *
   * @example
   * ```typescript
   * const workspace = await Effect.runPromise(Workspace.discover());
   * const eventData = workspace.getDataset("event_data");
   * if (eventData) {
   *   console.log(`Found dataset with spec: ${eventData.spec}`);
   * }
   * ```
   */
  getDataset(name: string): DatasetConfig | undefined {
    return this.getDatasets().find((d) => d.name === name);
  }

  /**
   * Get or create DuckDB connection (lazy initialization)
   *
   * Creates an in-memory DuckDB database on first call, reuses on subsequent calls.
   * Connection failures are treated as defects (system failures, not user errors).
   *
   * @returns Effect yielding the DuckDB connection
   *
   * @example
   * ```typescript
   * const connection = yield* _(workspace.getOrCreateConnection());
   * // Use connection for validation operations
   * ```
   */
  private getOrCreateConnection(): Effect.Effect<DuckDBConnection, never> {
    return Effect.gen(this, function* (_) {
      if (this.duckdb) {
        return this.duckdb.connection;
      }

      // Create isolated DuckDB instance - each workspace gets its own in-memory database
      const instance = yield* _(
        Effect.tryPromise(() => DuckDBInstance.create(":memory:")).pipe(Effect.orDie),
      );

      // Create connection from isolated instance - failure is a system defect
      const connection = yield* _(
        Effect.tryPromise(() => instance.connect()).pipe(Effect.orDie),
      );

      this.duckdb = { instance, connection };
      return connection;
    });
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
   * const result = await Effect.runPromise(workspace.validate());
   *
   * if (result.overallStatus === "pass") {
   *   console.log("All datasets valid!");
   * }
   * ```
   */
  validate(
    options?: {
      failFast?: boolean;
    },
  ): Effect.Effect<WorkspaceValidationResult, WorkspaceValidationError> {
    const config = this.config;
    const configPath = this.configPath;

    return Effect.gen(this, function* (_) {
      const startTime = Date.now();

      // Ensure config has validation settings
      if (!("validation" in config)) {
        return yield* _(
          Effect.fail(
            new WorkspaceValidationError({
              message: `Configuration '${configPath}' does not contain validation settings`,
              code: ErrorCode.INVALID_CONFIG,
            }),
          ),
        );
      }

      if (!("datasets" in config.validation)) {
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
      const validationSettings: ValidationSettings = options?.failFast !== undefined
        ? { ...config.validation, failFast: options.failFast }
        : config.validation;

      // Get datasets
      const datasets: readonly DatasetConfig[] = config.validation.datasets;

      // Get or create managed DuckDB connection (reused across validations)
      const connection = yield* _(this.getOrCreateConnection());

      // Generate workspace ID for this validation run
      const workspaceId = config.id;
      const basePath = dirname(configPath);

      // Load each dataset into DuckDB
      for (const dataset of datasets) {
        const filePath = resolve(basePath, dataset.path);
        // Prepend 'raw_' to table name because dataset.name and spec/profile cannot be the same name otherwise tables conflict
        const tableName = `raw_${sanitizeTableName(dataset.name)}`;

        // Build null values string for DuckDB
        const nullStr = validationSettings.nullValues.map((v: string) => `'${v}'`).join(", ");
        const dropTable = true;
        yield* _(WorkspaceImportCSV(connection, tableName, filePath, nullStr, dropTable));
        yield* _(WorkspaceImportSchema(connection, dataset, datasets));
      }

      // Perform validation
      const result = yield* _(
        Effect.gen(function* (_) {
          // Validate each dataset
          const datasetResults = [];

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
          const crossDatasetResults = [];
          if (config.crossDatasetRules && !validationSettings.failFast) {
            for (const rule of config.crossDatasetRules) {
              const result = yield* _(
                validateCrossDatasetRule(connection, rule, datasets),
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
        }),
      );

      // Cache the result for state queries (after successful validation)
      this.validationResult = result;

      return result;
    });
  }

  /**
   * Close DuckDB connection and clean up resources
   *
   * Should be called when workspace is no longer needed.
   * Safe to call multiple times - subsequent calls are no-ops.
   *
   * After closing, the connection can be recreated by calling validate() again.
   *
   * @example
   * ```typescript
   * const workspace = await Effect.runPromise(Workspace.discover());
   * await workspace.validate();
   * workspace.close(); // Clean up resources
   * ```
   */
  close(): void {
    if (this.duckdb) {
      try {
        this.duckdb.connection.closeSync();
        // Note: DuckDBInstance doesn't have explicit close method in current API
      } catch (error) {
        console.warn("Failed to close DuckDB connection:", error);
      } finally {
        this.duckdb = undefined;
      }
    }
  }

  /**
   * Automatic cleanup support for `using` declarations
   *
   * Enables automatic resource cleanup when used with `using` keyword.
   * The connection is closed when the workspace goes out of scope.
   *
   * @example
   * ```typescript
   * using workspace = await Effect.runPromise(Workspace.discover());
   * await Effect.runPromise(workspace.validate());
   * // Automatically closed when leaving scope
   * ```
   */
  [Symbol.dispose](): void {
    // Close connection synchronously
    this.close();
  }
}
