/**
 * Workspace Configuration Service
 *
 * Discovers and loads darwinkit.json workspace configuration files.
 * Validates configuration structure and file paths.
 */

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Data from "effect/Data";
import type * as Cause from "effect/Cause";
import { dirname, join, resolve } from "@std/path";

import type { WorkspaceConfig } from "@dwkt/domain";
import { ErrorCode } from "@dwkt/domain";
import { workspaceConfigSchema } from "@dwkt/domain";
import { createTaggedFormatter, prettyPrintCause } from "@dwkt/domain";
import * as YAML from "js-yaml";

// Configuration file constants
const DEFAULT_CONFIG_FILENAME = "darwinkit.json";
const MAX_SEARCH_DEPTH = 10;

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
 * Workspace configuration service
 */
export class WorkspaceConfigService {
  /**
   * Discover darwinkit.json configuration file
   *
   * Searches upward from the given directory until a darwinkit.json is found
   * or the maximum search depth is reached.
   *
   * Uses Effect's Cause to track all searched paths for better debugging.
   */
  static discoverConfig(
    searchDir: string = Deno.cwd(),
  ): Effect.Effect<string, ConfigNotFoundError> {
    return Effect.gen(function* (_) {
      let currentDir = resolve(searchDir);
      let depth = 0;
      const searchedPaths: string[] = [];

      /* check if config paramiter is a file. No need to search if pull config file path is provided.
        this also allows config files named something other than "darwinkit.json" */
      const statResult = yield* Effect.tryPromise(() => Deno.stat(currentDir)).pipe(Effect.option);

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
   */
  static loadConfig(
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
      // Cast to Record to access properties - will be validated by schema below
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
          catch: (error) => {
            console.error(error);
            return new ConfigValidationError({
              message: `Configuration validation failed`,
              configPath,
              validationErrors: [String(error)],
            });
          },
        }),
      );

      return config;
    });
  }

  /**
   * Validate that all dataset file paths exist
   */
  static validateDatasetPaths(
    config: WorkspaceConfig,
    basePath?: string,
  ): Effect.Effect<void, DatasetFileNotFoundError> {
    const base = basePath || dirname(Deno.cwd());

    return Effect.gen(function* (_) {
      // Check validation datasets if present
      if ("validation" in config && config.validation.datasets) {
        for (const dataset of config.validation.datasets) {
          const filePath = resolve(base, dataset.path);

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

          const filePath = resolve(base, path);

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
   * Discover and load workspace configuration
   *
   * Convenience method that combines discovery, loading, and path validation.
   */
  static discoverAndLoad(
    searchDir?: string,
  ): Effect.Effect<
    { config: WorkspaceConfig; configPath: string },
    ConfigNotFoundError | ConfigParseError | ConfigValidationError | DatasetFileNotFoundError
  > {
    return Effect.gen(function* (_) {
      // Discover config file
      const configPath = yield* _(WorkspaceConfigService.discoverConfig(searchDir));

      // Load and validate config
      const config = yield* _(WorkspaceConfigService.loadConfig(configPath));

      // Validate dataset paths
      const basePath = dirname(configPath) || dirname(searchDir || Deno.cwd());
      yield* _(WorkspaceConfigService.validateDatasetPaths(config, basePath));

      return { config, configPath };
    });
  }
}

/**
 * Format configuration-specific errors using tagged error pattern matching
 *
 * This formatter leverages Data.TaggedError's _tag property for type-safe
 * pattern matching, similar to Effect.catchTags. Each formatter is automatically
 * typed based on the error tag.
 */
const formatConfigError = createTaggedFormatter<ConfigError>({
  ConfigNotFoundError: (error) => {
    // error is automatically typed as ConfigNotFoundError!
    const pathsList = error.searchedPaths.map((p) => `  - ${p}`).join("\n");
    return `${error.message}\n\nSearched paths:\n${pathsList}\n\nSuggestion: Create '${DEFAULT_CONFIG_FILENAME}' in your project directory or a parent directory.`;
  },
  ConfigParseError: (error) => {
    // error is automatically typed as ConfigParseError!
    return `Failed to parse configuration file: ${error.configPath}\n\n${error.message}\n\nCause: ${error.cause?.message}`;
  },
  ConfigValidationError: (error) => {
    // error is automatically typed as ConfigValidationError!
    return `Configuration validation failed: ${error.configPath}\n\nValidation errors:\n${
      error.validationErrors.map((e) => `  - ${e}`).join("\n")
    }`;
  },
  DatasetFileNotFoundError: (error) => {
    // error is automatically typed as DatasetFileNotFoundError!
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
