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

import type { WorkspaceConfig } from "@dwkt/domain";
import * as Effect from "effect/Effect";
import type {
  ConfigError,
  ConfigNotFoundError,
  ConfigParseError,
  ConfigValidationError,
  DatasetFileNotFoundError,
} from "./workspace-config.ts";
import { WorkspaceConfigService } from "./workspace-config.ts";

/**
 * Workspace class - represents a single Darwin Core data project
 *
 * Encapsulates all workspace state including configuration, datasets,
 * and validation results. Provides a clean API for working with
 * biodiversity data validation workflows.
 */
export class Workspace {
  private readonly config: WorkspaceConfig;
  private readonly configPath: string;

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
}
