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
import type { DatasetConfig, WorkspaceConfig, WorkspaceValidationResult } from "@dwkt/domain";
import {
  createTaggedFormatter,
  hasValidationConfig,
  isValidationOnlyConfig,
  prettyPrintCause,
  workspaceConfigSchema,
} from "@dwkt/domain";
import { dirname, join, resolve } from "@std/path";
import type * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as YAML from "js-yaml";
// Import database utilities
import { importCsv } from "../database/index.ts";
import {
  type ConfigError,
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
  type WorkspaceImportError,
} from "./errors.ts";
import { Validator } from "./validator.ts";

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
   * - getConnection() is the ONLY method that creates connections
   * - It checks `if (this.duckdb)` before creating (guard clause)
   * - validate() is the only caller of getConnection()
   * - close() sets this to undefined (enables recreation)
   *
   * Therefore: first validate() creates connection, subsequent calls reuse it.
   */
  private duckdb?: {
    instance: DuckDBInstance;
    connection: DuckDBConnection;
  };

  /**
   * Lazy-initialized validator instance
   *
   * Created on first access to workspace.validator property.
   * Handles all validation orchestration and result caching.
   */
  private _validator?: Validator;

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
   * Create a minimal workspace without a configuration file
   *
   * Useful for programmatic use, testing, or ad-hoc data operations
   * where you don't need a full darwinkit.json configuration.
   *
   * @param options - Optional workspace metadata
   * @returns Workspace instance with minimal configuration
   *
   * @example
   * ```typescript
   * const workspace = Workspace.create({ name: "Test Workspace" });
   *
   * // Import and query data
   * await Effect.runPromise(workspace.importCsv(
   *   "./data.csv",
   *   "test_data",
   *   ["NA", ""]
   * ));
   *
   * const rows = await Effect.runPromise(
   *   workspace.query("SELECT * FROM test_data")
   * );
   *
   * workspace.close();
   * ```
   */
  static create(
    config: WorkspaceConfig,
  ): Workspace {
    return new Workspace(config, ":memory:");
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
   * Get the validator for this workspace
   *
   * Lazy-initializes the validator on first access. The validator handles
   * all validation orchestration and result caching.
   *
   * @returns Validator instance for this workspace
   *
   * @example
   * ```typescript
   * const workspace = await Effect.runPromise(Workspace.discover());
   * const result = await Effect.runPromise(workspace.validator.validate());
   *
   * if (workspace.validator.isValid()) {
   *   console.log("All datasets valid!");
   * }
   * ```
   */
  get validator(): Validator {
    if (!this._validator) {
      this._validator = new Validator(this);
    }
    return this._validator;
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
   * Returns undefined if validator.validate() has not been called yet.
   *
   * @returns Last validation result, or undefined if not yet validated
   *
   * @example
   * ```typescript
   * const workspace = await Effect.runPromise(Workspace.discover());
   * console.log(workspace.getValidationResult()); // undefined
   *
   * await Effect.runPromise(workspace.validator.validate());
   * const result = workspace.getValidationResult(); // WorkspaceValidationResult
   * ```
   */
  getValidationResult(): WorkspaceValidationResult | undefined {
    return this.validator.getResult();
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
   * await Effect.runPromise(workspace.validator.validate());
   * if (workspace.isValid()) {
   *   console.log("All datasets are valid!");
   * }
   * ```
   */
  isValid(): boolean {
    return this.validator.isValid();
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
   * Exposed publicly to allow transform operations to use the workspace's connection.
   *
   * @returns Effect yielding the DuckDB connection
   *
   * @example
   * ```typescript
   * const connection = yield* _(workspace.getConnection());
   * // Use connection for database operations
   * ```
   */
  getConnection(): Effect.Effect<DuckDBConnection, never> {
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
   * Import a CSV file into the workspace
   *
   * Imports a CSV file into a DuckDB table with automatic row numbering
   * for deterministic validation. This is a stateful operation that uses
   * the workspace's managed database connection.
   *
   * This method is a convenience wrapper around the pure importCsv utility
   * function, automatically providing the workspace's connection and null
   * value configuration.
   *
   * @param csvPath - Path to the CSV file
   * @param tableName - Name for the database table
   * @param dropTable - Whether to drop existing table first (defaults to false)
   * @returns Effect that succeeds when import completes
   *
   * @example
   * ```typescript
   * const workspace = await Effect.runPromise(Workspace.discover());
   *
   * // Import with workspace defaults
   * await Effect.runPromise(workspace.importCsv(
   *   "./data/events.csv",
   *   "events"
   * ));
   *
   * // Import and replace existing table
   * await Effect.runPromise(workspace.importCsv(
   *   "./data/occurrences.csv",
   *   "occurrences",
   *   true
   * ));
   * ```
   */
  importCsv(
    csvPath: string,
    tableName: string,
    dropTable = false,
  ): Effect.Effect<void, WorkspaceImportError> {
    return Effect.gen(this, function* (_) {
      // Get or create connection
      const connection = yield* _(this.getConnection());

      // Get nullValues from either validation or transform config
      let nullValues: readonly string[] = [];
      if (hasValidationConfig(this.config) && this.config.validation?.nullValues) {
        nullValues = this.config.validation.nullValues;
      } else if ("transform" in this.config && this.config.transform?.nullValues) {
        nullValues = this.config.transform.nullValues;
      }

      // Delegate to pure importCsv function
      yield* _(
        importCsv(connection, csvPath, tableName, {
          nullValues,
          dropTable,
        }),
      );
    });
  }

  /**
   * Execute a SQL query against the workspace database
   *
   * Allows querying imported data and tables within the workspace.
   * Useful for inspecting imported data, running ad-hoc queries,
   * or verifying data integrity.
   *
   * @param sql - SQL query to execute
   * @returns Effect yielding query results as an array of row objects
   *
   * @example
   * ```typescript
   * const workspace = await Effect.runPromise(Workspace.discover());
   * await Effect.runPromise(workspace.importCsv(
   *   "./data/events.csv"
   *   "events"
   * ));
   *
   * // Query the imported data
   * const rows = await Effect.runPromise(
   *   workspace.query("SELECT * FROM events LIMIT 10")
   * );
   * console.log(rows);
   * ```
   */
  query(sql: string): Effect.Effect<Array<Record<string, unknown>>, never> {
    return Effect.gen(this, function* (_) {
      const connection = yield* _(this.getConnection());

      const result = yield* _(
        Effect.tryPromise(() => connection.runAndReadAll(sql)).pipe(Effect.orDie),
      );

      return result.getRowObjects();
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
