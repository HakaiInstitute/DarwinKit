/**
 * Workspace Configuration Service - Manages configurable parsing settings
 *
 * Handles user-defined field configurations including expected types and null value handling
 * for DuckDB-based CSV parsing. Uses Effect for consistent error handling and type safety.
 */

import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import { join } from "@std/path";

import { ErrorCode } from "@dwkt/domain";
import { WorkspaceError } from "./service.ts";

// Supported DuckDB types for user configuration
export const DuckDBTypeSchema = S.Literal("NUMERIC", "DATE", "VARCHAR", "BOOLEAN");
export type DuckDBType = S.Schema.Type<typeof DuckDBTypeSchema>;

// Field configuration schema
export const FieldConfigSchema = S.Struct({
  expectedType: DuckDBTypeSchema,
  nullValues: S.Array(S.String),
});
export type FieldConfig = S.Schema.Type<typeof FieldConfigSchema>;

// Complete workspace configuration schema
export const WorkspaceConfigSchema = S.Struct({
  version: S.String,
  fields: S.Record({ key: S.String, value: FieldConfigSchema }),
  createdAt: S.Date,
  updatedAt: S.Date,
});
export type WorkspaceConfig = S.Schema.Type<typeof WorkspaceConfigSchema>;

// Error class for configuration operations
export class WorkspaceConfigError extends WorkspaceError {
  readonly configPath: string;

  constructor(props: { message: string; configPath: string; code: ErrorCode; cause?: Error }) {
    super({ message: props.message, code: props.code, cause: props.cause });
    this.configPath = props.configPath;
  }
}

// Default configuration for new workspaces
export const DEFAULT_WORKSPACE_CONFIG: Omit<WorkspaceConfig, "createdAt" | "updatedAt"> = {
  version: "1.0.0",
  fields: {},
};

/**
 * Service for managing workspace parsing configurations
 */
export class WorkspaceConfigService {
  private readonly workspacesDir: string;

  constructor({ workspacesDir = "./workspaces" }: { workspacesDir?: string } = {}) {
    this.workspacesDir = workspacesDir;
  }

  /**
   * Load configuration for a workspace
   */
  loadConfig(workspaceId: string): Effect.Effect<WorkspaceConfig, WorkspaceConfigError> {
    const workspacesDir = this.workspacesDir;

    return Effect.gen(function* (_) {
      const configPath = join(workspacesDir, `workspace-${workspaceId}`, "config.json");

      // Check if config file exists
      const configExists = yield* _(
        Effect.tryPromise({
          try: () => Deno.stat(configPath),
          catch: () =>
            new WorkspaceConfigError({
              message: `Configuration file not found: ${configPath}`,
              configPath,
              code: ErrorCode.WORKSPACE_NOT_FOUND,
            }),
        }).pipe(
          Effect.map(() => true),
          Effect.orElse(() => Effect.succeed(false)),
        ),
      );

      if (!configExists) {
        // Return default configuration if none exists
        const now = new Date();
        return {
          ...DEFAULT_WORKSPACE_CONFIG,
          createdAt: now,
          updatedAt: now,
        };
      }

      // Read and parse configuration file
      const configData = yield* _(
        Effect.tryPromise({
          try: () => Deno.readTextFile(configPath),
          catch: (error) =>
            new WorkspaceConfigError({
              message: `Failed to read configuration file: ${error}`,
              configPath,
              code: ErrorCode.WORKSPACE_IO_ERROR,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );

      const rawConfig = yield* _(
        Effect.try({
          try: () => JSON.parse(configData),
          catch: (error) =>
            new WorkspaceConfigError({
              message: `Invalid JSON in configuration file: ${error}`,
              configPath,
              code: ErrorCode.WORKSPACE_VALIDATION_FAILED,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );

      // Validate configuration using Effect Schema
      const config = yield* _(
        S.decodeUnknown(WorkspaceConfigSchema)(rawConfig).pipe(
          Effect.mapError((error) =>
            new WorkspaceConfigError({
              message: `Configuration validation failed: ${error}`,
              configPath,
              code: ErrorCode.WORKSPACE_VALIDATION_FAILED,
            })
          ),
        ),
      );

      return config;
    });
  }

  /**
   * Save configuration for a workspace
   */
  saveConfig(
    workspaceId: string,
    config: WorkspaceConfig,
  ): Effect.Effect<void, WorkspaceConfigError> {
    const workspacesDir = this.workspacesDir;

    return Effect.gen(function* (_) {
      const workspaceDir = join(workspacesDir, `workspace-${workspaceId}`);
      const configPath = join(workspaceDir, "config.json");

      // Ensure workspace directory exists
      yield* _(
        Effect.tryPromise({
          try: () => Deno.mkdir(workspaceDir, { recursive: true }),
          catch: (error) =>
            new WorkspaceConfigError({
              message: `Failed to create workspace directory: ${error}`,
              configPath,
              code: ErrorCode.WORKSPACE_IO_ERROR,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );

      // Update timestamp
      const configWithTimestamp = {
        ...config,
        updatedAt: new Date(),
      };

      // Serialize and write configuration
      const serialized = JSON.stringify(configWithTimestamp, null, 2);
      yield* _(
        Effect.tryPromise({
          try: () => Deno.writeTextFile(configPath, serialized),
          catch: (error) =>
            new WorkspaceConfigError({
              message: `Failed to write configuration file: ${error}`,
              configPath,
              code: ErrorCode.WORKSPACE_IO_ERROR,
              cause: error instanceof Error ? error : new Error(String(error)),
            }),
        }),
      );
    });
  }

  /**
   * Update field configuration for a workspace
   */
  updateFieldConfig(
    workspaceId: string,
    fieldName: string,
    fieldConfig: FieldConfig,
  ): Effect.Effect<WorkspaceConfig, WorkspaceConfigError> {
    const loadConfig = this.loadConfig.bind(this);
    const saveConfig = this.saveConfig.bind(this);

    return Effect.gen(function* (_) {
      const config = yield* _(loadConfig(workspaceId));

      const updatedConfig: WorkspaceConfig = {
        ...config,
        fields: {
          ...config.fields,
          [fieldName]: fieldConfig,
        },
        updatedAt: new Date(),
      };

      yield* _(saveConfig(workspaceId, updatedConfig));

      return updatedConfig;
    });
  }

  /**
   * Parse raw configuration data with validation
   */
  parseConfig(data: unknown): Effect.Effect<WorkspaceConfig, WorkspaceConfigError> {
    return S.decodeUnknown(WorkspaceConfigSchema)(data).pipe(
      Effect.mapError((error) =>
        new WorkspaceConfigError({
          message: `Configuration validation failed: ${error}`,
          configPath: "<in-memory>",
          code: ErrorCode.WORKSPACE_VALIDATION_FAILED,
        })
      ),
    );
  }

  /**
   * Get field configuration or return default
   */
  getFieldConfig(config: WorkspaceConfig, fieldName: string): FieldConfig {
    return config.fields[fieldName] || {
      expectedType: "VARCHAR", // Default to string if not configured
      nullValues: [""], // Default to empty string as null
    };
  }

  /**
   * Build DuckDB nullstr parameter from configuration
   */
  buildNullStrParameter(config: WorkspaceConfig): string {
    // Collect all unique null values from field configurations
    const allNullValues = new Set<string>();

    for (const fieldConfig of Object.values(config.fields)) {
      for (const nullValue of fieldConfig.nullValues) {
        allNullValues.add(nullValue);
      }
    }

    // Add common defaults if no configuration exists
    if (allNullValues.size === 0) {
      allNullValues.add("");
      allNullValues.add("NA");
      allNullValues.add("NULL");
    }

    // Format for DuckDB: ['value1', 'value2', ...]
    return `[${Array.from(allNullValues).map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")}]`;
  }
}
