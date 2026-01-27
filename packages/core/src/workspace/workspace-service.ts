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
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import type {
  ConfigWithValidation,
  WorkspaceConfig,
  WorkspaceValidationResult,
} from "@dwkt/domain";
import { isValidationOnlyConfig, workspaceConfigSchema } from "@dwkt/domain";
import {
  ValidationError as ValError,
  ValidationService,
} from "../validation/validation-service.ts";

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

/**
 * Error classes for workspace operations
 */
export class WorkspaceError extends Data.TaggedError("WorkspaceError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

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
                Effect.mapError((error: ValError) =>
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
 * Discover darwinkit.json configuration file
 */
function discoverConfig(
  searchDir: string = Deno.cwd(),
): Effect.Effect<string, WorkspaceError> {
  return Effect.gen(function* (_) {
    let currentDir = resolve(searchDir);
    let depth = 0;
    const searchedPaths: string[] = [];

    // Check if searchDir is a file
    const statResult = yield* _(
      Effect.tryPromise(() => Deno.stat(currentDir)).pipe(Effect.option),
    );

    if (statResult._tag === "Some" && statResult.value.isFile) {
      return currentDir;
    }

    while (depth < MAX_SEARCH_DEPTH) {
      const configPath = join(currentDir, DEFAULT_CONFIG_FILENAME);
      searchedPaths.push(configPath);

      const checkResult = yield* _(
        Effect.tryPromise(() => Deno.stat(configPath)).pipe(
          Effect.map(() => true),
          Effect.catchAll(() => Effect.succeed(false)),
        ),
      );

      if (checkResult) {
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
 * Validate dataset file paths exist
 */
function validateDatasetPaths(
  config: WorkspaceConfig,
  base: string,
): Effect.Effect<void, WorkspaceError> {
  return Effect.gen(function* (_) {
    if ("validation" in config && config.validation) {
      for (const dataset of config.validation.datasets) {
        const filePath = resolve(base, dataset.path);

        yield* _(
          Effect.tryPromise({
            try: () => Deno.stat(filePath),
            catch: () =>
              new WorkspaceError({
                message:
                  `Dataset file not found:\n  Dataset: ${dataset.name}\n  Path: ${filePath}\n\nCheck that the path in darwinkit.json is correct.`,
              }),
          }),
        );
      }
    }

    if ("transform" in config && config.transform) {
      for (
        const [inputName, path] of Object.entries(config.transform.inputs)
      ) {
        if (typeof path !== "string") continue;

        const filePath = resolve(base, path);

        yield* _(
          Effect.tryPromise({
            try: () => Deno.stat(filePath),
            catch: () =>
              new WorkspaceError({
                message: `Transform input file not found: ${filePath} (input: ${inputName})`,
              }),
          }),
        );
      }
    }
  });
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
