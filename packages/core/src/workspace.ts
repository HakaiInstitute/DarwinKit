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

import type {
  DatasetConfig,
  ValidationSettings,
  WorkspaceConfig,
  WorkspaceValidationResult,
} from "@dwkt/domain";
import { ErrorCode, resolveDatasetProfile } from "@dwkt/domain";
import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";
import { dirname, resolve } from "@std/path";
import * as Effect from "effect/Effect";
import type {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
} from "./workspace-config.ts";
import { WorkspaceConfigService } from "./workspace-config.ts";
// Import validation functions - these will be used internally
import {
  sanitizeTableName,
  WorkspaceImportCSV,
  WorkspaceImportSchema,
} from "./validation/database-operations.ts";
import { calculateSummary, WorkspaceValidationError } from "./validation/validation-utils.ts";
import { validateCrossDatasetRule } from "./validation/validators.ts";
import { validateDataset } from "./validation/workspace-validator.ts";

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
      // Use WorkspaceConfigService to discover and load config
      const { config, configPath } = yield* _(
        WorkspaceConfigService.discoverAndLoad(searchDir),
      );

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
      const config = yield* _(WorkspaceConfigService.loadConfig(configPath));

      // Validate dataset paths
      const basePath = configPath.split("/").slice(0, -1).join("/") || ".";
      yield* _(WorkspaceConfigService.validateDatasetPaths(config, basePath));

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
      return yield* _(
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

          const overallStatus: "fail" | "warn" | "pass" = summary.datasetsFailedCount > 0
            ? "fail"
            : summary.datasetsWithWarningsCount > 0
            ? "warn"
            : "pass";

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
