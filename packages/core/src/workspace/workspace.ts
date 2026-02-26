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

const DEFAULT_CONFIG_FILENAME = "darwinkit.yaml";
const MAX_SEARCH_DEPTH = 10;

export interface ValidationOptions {
  readonly failFast?: boolean;
}

export class Workspace {
  private constructor(
    readonly config: WorkspaceConfig,
    readonly configPath: string,
    readonly basePath: string,
    private readonly connection: DuckDBConnection,
    private readonly instance: DuckDBInstance,
  ) {}

  get name(): string {
    return this.config.name;
  }

  get description(): string | undefined {
    return this.config.description;
  }

  get hasValidation(): boolean {
    return hasValidationConfig(this.config);
  }

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

      const settings = options?.failFast !== undefined
        ? { ...configSettings, failFast: options.failFast }
        : configSettings;

      const crossDatasetRules = this.config.crossDatasetRules;

      const validator = new WorkspaceValidator();
      const result = yield* validator.validateDatasetsWithConnection(
        this.connection,
        datasets,
        settings,
        this.basePath,
        this.config.standard ?? { base: "darwin-core", variant: "obis" },
        this.config.id,
        crossDatasetRules,
        this.configPath,
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

  getValidationDatasets(): readonly DatasetConfig[] {
    if (!this.hasValidation) {
      return [];
    }
    return (this.config as ConfigWithValidation).validation.datasets;
  }

  getValidationSettings(): ValidationSettings | undefined {
    if (!this.hasValidation) {
      return undefined;
    }
    return (this.config as ConfigWithValidation).validation;
  }

  static open(
    configPath?: string,
  ): Effect.Effect<Workspace, WorkspaceConfigError, Scope.Scope> {
    return Effect.acquireRelease(
      Effect.gen(function* () {
        const resolvedPath = yield* discoverConfig(configPath);
        const config = yield* loadConfig(resolvedPath);
        const basePath = dirname(resolvedPath);

        yield* validateDatasetPaths(config, basePath);

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

const isFile = (path: string): Effect.Effect<boolean> =>
  Effect.tryPromise(() => Deno.stat(path)).pipe(
    Effect.match({
      onFailure: () => false,
      onSuccess: (stat) => stat.isFile,
    }),
  );

const pathExists = (path: string): Effect.Effect<boolean> =>
  Effect.tryPromise(() => Deno.stat(path)).pipe(
    Effect.match({
      onFailure: () => false,
      onSuccess: () => true,
    }),
  );

const isConfigFilePath = (path: string): boolean => {
  const lower = path.toLowerCase();
  return lower.endsWith(".yaml") || lower.endsWith(".yml");
};

/** Searches for darwinkit.yaml starting from the given path, walking up the directory tree. */
function discoverConfig(
  searchDir: string = Deno.cwd(),
): Effect.Effect<string, ConfigNotFoundError> {
  return Effect.gen(function* () {
    const resolvedPath = resolve(searchDir);

    if (isConfigFilePath(resolvedPath)) {
      const exists = yield* isFile(resolvedPath);
      if (exists) {
        return resolvedPath;
      }
      return yield* Effect.fail(
        new ConfigNotFoundError({
          message: `Configuration file not found at specified path: ${searchDir}`,
          searchedPaths: [resolvedPath],
          startDirectory: dirname(resolvedPath),
        }),
      );
    }

    const isDirectFile = yield* isFile(resolvedPath);
    if (isDirectFile) {
      return resolvedPath;
    }

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

  return validations.length > 0
    ? Effect.all(validations, { concurrency: "unbounded" }).pipe(Effect.asVoid)
    : Effect.void;
}
