/**
 * Managed Workspace Service
 *
 * Provides a service layer for workspace operations using the Effect-managed
 * ManagedWorkspace pattern. Uses `Layer.scoped` to ensure the workspace's
 * DuckDB connection is properly managed throughout the service lifecycle.
 *
 * @module workspace/managed-workspace-service
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import type {
  DatasetConfig,
  ValidationSettings,
  WorkspaceConfig,
  WorkspaceValidationResult,
} from "@dwkt/domain";
import type { ValidationError } from "../errors/index.ts";

import type { ValidationConfigMissingError, WorkspaceConfigError } from "./errors.ts";
import { ManagedWorkspace, type ValidationOptions } from "./workspace.ts";

/**
 * Service API for workspace operations
 *
 * This interface defines the operations available when using the workspace
 * as a service via dependency injection.
 */
export interface ManagedWorkspaceServiceApi {
  /**
   * Validate datasets according to workspace configuration
   *
   * @param options - Optional validation settings (failFast, etc.)
   * @returns Effect that yields validation results
   */
  readonly validate: (
    options?: ValidationOptions,
  ) => Effect.Effect<
    WorkspaceValidationResult,
    ValidationError | ValidationConfigMissingError
  >;

  /**
   * Get the validation datasets from configuration
   *
   * @returns Array of dataset configurations
   */
  readonly getValidationDatasets: () => readonly DatasetConfig[];

  /**
   * Get the validation settings from configuration
   *
   * @returns Validation settings or undefined if no validation config
   */
  readonly getValidationSettings: () => ValidationSettings | undefined;

  /**
   * Whether this workspace has validation configuration
   */
  readonly hasValidation: boolean;

  /**
   * The workspace configuration
   */
  readonly config: WorkspaceConfig;

  /**
   * Absolute path to the configuration file
   */
  readonly configPath: string;

  /**
   * Base directory path for resolving relative paths
   */
  readonly basePath: string;

  /**
   * Workspace name from configuration
   */
  readonly name: string;

  /**
   * Workspace description from configuration
   */
  readonly description: string | undefined;
}

/**
 * Managed Workspace Service Tag
 *
 * Use this service for dependency injection scenarios where you need
 * workspace operations available through the Effect context.
 *
 * @example
 * ```typescript
 * // Create layer for a specific workspace
 * const WorkspaceLive = makeWorkspaceLayer("./darwinkit.json");
 *
 * // Use service in Effect programs
 * const program = Effect.gen(function* () {
 *   const workspace = yield* ManagedWorkspaceService;
 *
 *   // All operations reuse the same DuckDB connection
 *   const results = yield* workspace.validate();
 *   return results;
 * });
 *
 * // Run with layer - connection auto-closes when done
 * await Effect.runPromise(
 *   program.pipe(Effect.provide(WorkspaceLive))
 * );
 * ```
 */
export class ManagedWorkspaceService extends Context.Tag(
  "@dwkt/ManagedWorkspaceService",
)<ManagedWorkspaceService, ManagedWorkspaceServiceApi>() {}

/**
 * Create a workspace service layer for a specific configuration path
 *
 * Uses `Layer.scoped` to ensure the underlying ManagedWorkspace's DuckDB
 * connection is properly acquired when the layer is built and released
 * when the layer is disposed.
 *
 * @param configPath - Optional path to config file or directory containing it
 * @returns Layer that provides ManagedWorkspaceService
 *
 * @example
 * ```typescript
 * // With explicit config path
 * const WorkspaceLive = makeWorkspaceLayer("./my-project/darwinkit.json");
 *
 * // Auto-discover config in current directory
 * const WorkspaceLive = makeWorkspaceLayer();
 *
 * // Use in Effect programs
 * const program = Effect.gen(function* () {
 *   const workspace = yield* ManagedWorkspaceService;
 *   return yield* workspace.validate();
 * }).pipe(
 *   Effect.provide(WorkspaceLive)
 * );
 * ```
 */
export const makeWorkspaceLayer = (
  configPath?: string,
): Layer.Layer<ManagedWorkspaceService, WorkspaceConfigError, never> =>
  Layer.scoped(
    ManagedWorkspaceService,
    Effect.map(ManagedWorkspace.open(configPath), (ws) =>
      ManagedWorkspaceService.of({
        validate: (opts) => ws.validate(opts),
        getValidationDatasets: () => ws.getValidationDatasets(),
        getValidationSettings: () => ws.getValidationSettings(),
        hasValidation: ws.hasValidation,
        config: ws.config,
        configPath: ws.configPath,
        basePath: ws.basePath,
        name: ws.name,
        description: ws.description,
      })),
  );
