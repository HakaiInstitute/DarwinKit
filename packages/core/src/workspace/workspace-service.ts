/**
 * Workspace Service
 *
 * This service provides a unified interface for loading workspace configurations
 * and managing workspace state including validation results. Uses Effect's
 * Context.Tag pattern for dependency injection.
 *
 * @module workspace-service
 */

import { dirname, join, resolve } from "@std/path";
import { parse as parseYAML } from "@std/yaml";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import type {
  ConfigWithValidation,
  WorkspaceConfig,
  WorkspaceValidationResult,
} from "@dwkt/domain";
import { isValidationOnlyConfig, workspaceConfigSchema } from "@dwkt/domain";
import { ValidationError, WorkspaceError } from "../errors/index.ts";
import { ValidationService } from "../validation/validation-service.ts";

// Configuration file constants
const DEFAULT_CONFIG_FILENAME = "darwinkit.json";
const MAX_SEARCH_DEPTH = 10;

/**
 * Workspace state - includes configuration and validation status
 */
export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly configPath: string;
  readonly config: WorkspaceConfig;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly validationState: ValidationState;
}

/**
 * Validation state - tracks validation progress and results
 */
export type ValidationState =
  | { readonly status: "not-validated" }
  | { readonly status: "validating" }
  | {
    readonly status: "validated";
    readonly result: WorkspaceValidationResult;
  };

// Re-export error types for consumers who import from this module
export { ValidationError, WorkspaceError } from "../errors/index.ts";

/**
 * Workspace Service
 *
 * This service provides workspace management including configuration loading,
 * discovery, and validation coordination.
 */
export class WorkspaceService extends Context.Tag("@dwkt/WorkspaceService")<
  WorkspaceService,
  {
    readonly load: (configPath: string) => Effect.Effect<Workspace, WorkspaceError>;
    readonly loadFromDirectory: (searchDir?: string) => Effect.Effect<Workspace, WorkspaceError>;
    readonly validate: (workspace: Workspace) => Effect.Effect<Workspace, ValidationError>;
  }
>() {
  static readonly layer = Layer.effect(
    WorkspaceService,
    Effect.gen(function* (_) {
      const validationService = yield* _(ValidationService);

      return WorkspaceService.of({
        load: (configPath: string) =>
          Effect.gen(function* (_) {
            const config = yield* _(loadConfig(configPath));
            const basePath = dirname(configPath);
            yield* _(validateDatasetPaths(config, basePath));
            return createWorkspace(config, configPath);
          }),

        loadFromDirectory: (searchDir?: string) =>
          Effect.gen(function* (_) {
            const configPath = yield* _(discoverConfig(searchDir));
            const config = yield* _(loadConfig(configPath));
            const basePath = dirname(configPath);
            yield* _(validateDatasetPaths(config, basePath));
            return createWorkspace(config, configPath);
          }),

        validate: (workspace: Workspace) =>
          Effect.gen(function* (_) {
            if (!isValidationOnlyConfig(workspace.config)) {
              return yield* _(
                Effect.fail(
                  new ValidationError({
                    message: `Workspace '${workspace.name}' does not have validation configuration`,
                  }),
                ),
              );
            }

            const configWithValidation = workspace.config as ConfigWithValidation;
            const datasets = configWithValidation.validation.datasets;
            const settings = configWithValidation.validation;
            const basePath = dirname(workspace.configPath);

            const result = yield* _(
              validationService.validateDatasets(datasets, settings, basePath).pipe(
                Effect.mapError((error) =>
                  new ValidationError({
                    message: error.message,
                    cause: error.cause,
                  })
                ),
              ),
            );

            return {
              ...workspace,
              validationState: {
                status: "validated" as const,
                result,
              },
            };
          }),
      });
    }),
  );
}

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
 */
function discoverConfig(
  searchDir: string = Deno.cwd(),
): Effect.Effect<string, WorkspaceError> {
  return Effect.gen(function* (_) {
    let currentDir = resolve(searchDir);
    let depth = 0;
    const searchedPaths: string[] = [];

    // Check if searchDir is a file (direct config path provided)
    const isDirectFile = yield* _(isFile(currentDir));
    if (isDirectFile) {
      return currentDir;
    }

    // Search up the directory tree
    while (depth < MAX_SEARCH_DEPTH) {
      const configPath = join(currentDir, DEFAULT_CONFIG_FILENAME);
      searchedPaths.push(configPath);

      const exists = yield* _(pathExists(configPath));
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

    const pathsList = searchedPaths.map((p) => `  - ${p}`).join("\n");
    return yield* _(
      Effect.fail(
        new WorkspaceError({
          message:
            `Configuration file '${DEFAULT_CONFIG_FILENAME}' not found in '${searchDir}' or any parent directory.\n\nSearched paths:\n${pathsList}`,
        }),
      ),
    );
  });
}

/**
 * Load workspace configuration from file path
 */
function loadConfig(
  configPath: string,
): Effect.Effect<WorkspaceConfig, WorkspaceError> {
  return Effect.gen(function* (_) {
    const configContent = yield* _(
      Effect.tryPromise({
        try: () => Deno.readTextFile(configPath),
        catch: (error) =>
          new WorkspaceError({
            message: `Failed to read configuration file: ${configPath}`,
            cause: error instanceof Error ? error : new Error(String(error)),
          }),
      }),
    );

    let configJson: unknown;
    if (configPath.endsWith(".yaml") || configPath.endsWith(".yml")) {
      configJson = yield* _(
        Effect.try({
          try: () => parseYAML(configContent),
          catch: (error) =>
            new WorkspaceError({
              message: `Invalid YAML in configuration file: ${configPath}`,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );
    } else {
      configJson = yield* _(
        Effect.try({
          try: () => JSON.parse(configContent),
          catch: (error) =>
            new WorkspaceError({
              message: `Invalid JSON in configuration file: ${configPath}`,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );
    }

    const configRecord = configJson as Record<string, unknown>;
    const configWithMeta = {
      id: configRecord.id || "workspace-" + Date.now(),
      ...configRecord,
      createdAt: configRecord.createdAt || new Date().toISOString(),
      updatedAt: configRecord.updatedAt || new Date().toISOString(),
    };

    const config = yield* _(
      Effect.try({
        try: () => {
          const decoded = Schema.decodeUnknownSync(workspaceConfigSchema)(
            configWithMeta,
          );
          return decoded;
        },
        catch: (error) => {
          return new WorkspaceError({
            message: `Configuration validation failed: ${configPath}\n\nError: ${String(error)}`,
          });
        },
      }),
    );

    return config;
  });
}

/**
 * Validate that a file path exists
 */
const validatePath = (
  filePath: string,
  errorMessage: string,
): Effect.Effect<void, WorkspaceError> =>
  Effect.tryPromise({
    try: () => Deno.stat(filePath),
    catch: () => new WorkspaceError({ message: errorMessage }),
  }).pipe(Effect.asVoid);

/**
 * Validate dataset file paths exist (parallel validation)
 */
function validateDatasetPaths(
  config: WorkspaceConfig,
  base: string,
): Effect.Effect<void, WorkspaceError> {
  const validations: Effect.Effect<void, WorkspaceError>[] = [];

  // Collect validation dataset paths
  if ("validation" in config && config.validation) {
    for (const dataset of config.validation.datasets) {
      const filePath = resolve(base, dataset.path);
      validations.push(
        validatePath(
          filePath,
          `Dataset file not found:\n  Dataset: ${dataset.name}\n  Path: ${filePath}\n\nCheck that the path in darwinkit.json is correct.`,
        ),
      );
    }
  }

  // Collect transform input paths
  if ("transform" in config && config.transform) {
    for (const [inputName, path] of Object.entries(config.transform.inputs)) {
      if (typeof path !== "string") continue;
      const filePath = resolve(base, path);
      validations.push(
        validatePath(
          filePath,
          `Transform input file not found: ${filePath} (input: ${inputName})`,
        ),
      );
    }
  }

  // Run all validations in parallel - fail on first error
  return validations.length > 0
    ? Effect.all(validations, { concurrency: "unbounded" }).pipe(Effect.asVoid)
    : Effect.void;
}

/**
 * Create a Workspace instance from loaded configuration
 */
function createWorkspace(
  config: WorkspaceConfig,
  configPath: string,
): Workspace {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    configPath,
    config,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
    validationState: { status: "not-validated" },
  };
}
