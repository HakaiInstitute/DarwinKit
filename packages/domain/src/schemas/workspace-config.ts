/**
 * Effect Schema definitions for workspace configuration validation
 *
 * Structure Overview:
 * - importConfigSchema: Common settings for data import (nullValues, dropTable)
 * - outputConfigSchema: Base output settings (dir)
 * - validationSettingsSchema: Validation-specific settings with nested import/output
 * - transformSettingsSchema: Transform-specific settings with nested import/output
 *
 * This unified structure allows:
 * - Passing `config.validation.import` or `config.transform.import` directly to functions
 * - Consistent `output` structure across both validation and transform
 * - Clear separation of concerns with extensible foundation
 *
 * Configuration Approach:
 * - Single WorkspaceConfig class with optional validation/transform properties
 * - Type predicates (hasValidation, hasTransform) for type narrowing
 * - Effect helpers (requireValidation, requireTransform) for safe property access
 * - Use Match.when with predicates for pattern matching
 */

import * as Effect from "effect/Effect";
import * as S from "effect/Schema";
import { EnforcementLevel, ValidatorConfigSchema } from "../specs/validators.ts";

// =============================================================================
// Field Mapping Schemas
// =============================================================================

/**
 * Workspace field mapping schema - maps source columns to Darwin Core fields
 */
export const fieldMappingSchema = S.Struct({
  originName: S.String,
  targetName: S.String,
  isRequired: S.optional(S.Boolean),
  constraints: S.optional(S.Record({ key: S.String, value: S.Unknown })),
  validators: S.optional(S.Array(ValidatorConfigSchema)),
});

/**
 * Cross-dataset rule schema - defines relationships between datasets
 */
export const crossDatasetRuleSchema = S.Struct({
  ruleType: S.Literal("foreignKey", "referentialIntegrity"),
  sourceDataset: S.String,
  sourceField: S.String,
  targetDataset: S.String,
  targetField: S.String,
  enforcement: S.optional(EnforcementLevel),
  description: S.optional(S.String),
});

// =============================================================================
// Dataset Configuration Schemas
// =============================================================================

/**
 * Dataset configuration for validation workflows
 */
export const datasetConfigSchema = S.Struct({
  name: S.String,
  spec: S.String,
  path: S.String,
  description: S.optional(S.String),
  profile: S.optional(S.String),
  fieldMappings: S.Array(fieldMappingSchema),
});

/**
 * Dataset configuration for transformation workflows
 */
export const transformDatasetConfigSchema = S.Struct({
  name: S.String,
  profile: S.String,
  source: S.optional(S.Object),
  description: S.optional(S.String),
  fields: S.optional(S.Object),
});

// =============================================================================
// Common Configuration Schemas
// =============================================================================

/**
 * Import configuration - common settings for data import operations
 *
 * Used by both validation and transformation workflows.
 * Access via `config.validation.import` or `config.transform.import`.
 *
 * ## Default Value Pattern
 *
 * Fields use a dual-default pattern for complete flexibility:
 * - `S.optionalWith(schema, { default: () => value })` - Applies defaults during decoding (JSON parsing)
 * - `.pipe(S.withConstructorDefault(() => value))` - Applies defaults when using `Schema.make()`
 */
export const importConfigSchema = S.Struct({
  /** Values to treat as NULL during import (e.g., ["NA", "N/A", ""]). Null means use DuckDB defaults. */
  nullValues: S.optionalWith(S.NullOr(S.Array(S.String)), { default: () => null }).pipe(
    S.withConstructorDefault(() => null),
  ),
  /** Whether to drop existing tables before import */
  dropTable: S.optionalWith(S.Boolean, { default: () => false }).pipe(
    S.withConstructorDefault(() => false),
  ),
});

/**
 * Base output configuration - common output settings
 *
 * Extended by transform-specific output options.
 */
export const outputConfigSchema = S.Struct({
  /** Directory for output files */
  dir: S.optionalWith(S.String, { default: () => "./output" }).pipe(
    S.withConstructorDefault(() => "./output"),
  ),
});

/**
 * Transform output configuration - extends base with transform-specific options
 */
export const transformOutputConfigSchema = S.Struct({
  ...outputConfigSchema.fields,
  /** Whether to export a DuckDB database file */
  exportDB: S.optionalWith(S.Boolean, { default: () => false }).pipe(
    S.withConstructorDefault(() => false),
  ),
  /** Custom filename for exported database */
  exportDbFileName: S.optional(S.String),
  /** Whether to add timestamps to output filenames */
  outputFilesWithTimestamp: S.optionalWith(S.Boolean, { default: () => false }).pipe(
    S.withConstructorDefault(() => false),
  ),
  /** Whether to drop columns that are entirely NULL */
  dropNullColumns: S.optionalWith(S.Boolean, { default: () => false }).pipe(
    S.withConstructorDefault(() => false),
  ),
});

// =============================================================================
// Workflow Settings Schemas
// =============================================================================

/**
 * Validation settings schema
 *
 * Structure:
 * - import: Import configuration (nullValues, dropTable) - optional, defaults to {}
 * - output: Output configuration (dir)
 * - failFast, datasets, etc.: Validation-specific options
 */
export const validationConfigSchema = S.Struct({
  /** Import configuration - defaults to { nullValues: null, dropTable: false } */
  import: S.optionalWith(importConfigSchema, {
    default: () => makeImportConfig({}),
  }).pipe(S.withConstructorDefault(() => makeImportConfig({}))),
  /** Output configuration */
  output: S.optionalWith(outputConfigSchema, {
    default: () => makeOutputConfig({}),
  }).pipe(S.withConstructorDefault(() => makeOutputConfig({}))),
  /** Stop validation on first error */
  failFast: S.optionalWith(S.Boolean, { default: () => true }).pipe(
    S.withConstructorDefault(() => true),
  ),
  /** Optional description */
  description: S.optional(S.String),
  /** Limit violations reported per field */
  maxViolationsPerField: S.optionalWith(S.Number, { default: () => 50 }).pipe(
    S.withConstructorDefault(() => 50),
  ),
  /** Enable fuzzy matching suggestions for vocabulary violations */
  enableSuggestions: S.optionalWith(S.Boolean, { default: () => true }).pipe(
    S.withConstructorDefault(() => true),
  ),
  /** Datasets to validate */
  datasets: S.optionalWith(S.Array(datasetConfigSchema), { default: () => [] }).pipe(
    S.withConstructorDefault(() => []),
  ),
});

/**
 * Transform settings schema
 *
 * Structure:
 * - import: Import configuration (nullValues, dropTable) - optional, defaults to {}
 * - inputs: Map of table names to CSV file paths
 * - output: Output configuration (dir, exportDB, etc.)
 * - datasets, etc.: Transform-specific options
 */
export const transformConfigSchema = S.Struct({
  /** Import configuration */
  import: S.optionalWith(importConfigSchema, {
    default: () => makeImportConfig({}),
  }).pipe(S.withConstructorDefault(() => makeImportConfig({}))),
  /** Map of table names to CSV file paths */
  inputs: S.optionalWith(S.Record({ key: S.String, value: S.String }), {
    default: () => ({}),
  }).pipe(S.withConstructorDefault(() => ({}))),
  /** SQL statements to run after import */
  postImportTransforms: S.optionalWith(S.Array(S.String), { default: () => [] }).pipe(
    S.withConstructorDefault(() => []),
  ),
  /** Output configuration - defaults to { dir: "./output", exportDB: false, ... } */
  output: S.optionalWith(transformOutputConfigSchema, {
    default: () => makeTransformOutputConfig({}),
  }).pipe(S.withConstructorDefault(() => makeTransformOutputConfig({}))),
  /** Datasets to transform */
  datasets: S.Array(transformDatasetConfigSchema),
});

// =============================================================================
// Type Exports
// =============================================================================

/** Import configuration type */
export type ImportConfig = S.Schema.Type<typeof importConfigSchema>;

/** Base output configuration type */
export type OutputConfig = S.Schema.Type<typeof outputConfigSchema>;

/** Transform output configuration type */
export type TransformOutputConfig = S.Schema.Type<typeof transformOutputConfigSchema>;

/** Field mapping type */
export type WorkspaceFieldMapping = S.Schema.Type<typeof fieldMappingSchema>;

/** Cross-dataset rule type */
export type WorkspaceCrossDatasetRule = S.Schema.Type<typeof crossDatasetRuleSchema>;

/** Dataset configuration type (validation) */
export type DatasetConfig = S.Schema.Type<typeof datasetConfigSchema>;

/** Dataset configuration type (transformation) */
export type TransformDatasetConfig = S.Schema.Type<typeof transformDatasetConfigSchema>;

/** Validation settings type */
export type ValidationConfig = S.Schema.Type<typeof validationConfigSchema>;

/** Transform settings type */
export type TransformSettings = S.Schema.Type<typeof transformConfigSchema>;

// =============================================================================
// Workspace Configuration Schema (Single Class Approach)
// =============================================================================

/**
 * Base fields shared by all workspace configurations.
 *
 * Uses the dual-default pattern for optional fields:
 * - `S.optionalWith(schema, { default: () => value })` - Applies defaults during decoding (JSON parsing)
 * - `.pipe(S.withConstructorDefault(() => value))` - Applies defaults when using `Schema.make()`
 */
const baseConfigFields = {
  id: S.optionalWith(S.String, { default: () => crypto.randomUUID() }).pipe(
    S.withConstructorDefault(() => crypto.randomUUID()),
  ),
  name: S.String,
  version: S.String,
  description: S.optional(S.String),
  crossDatasetRules: S.optional(S.Array(crossDatasetRuleSchema)),
  createdAt: S.optionalWith(S.Date, { default: () => new Date() }).pipe(
    S.withConstructorDefault(() => new Date()),
  ),
  updatedAt: S.optionalWith(S.Date, { default: () => new Date() }).pipe(
    S.withConstructorDefault(() => new Date()),
  ),
};

/**
 * Schema for base config fields - used for type derivation.
 */
const baseConfigSchema = S.Struct(baseConfigFields);

/**
 * Full base config type with all defaults applied.
 */
type BaseConfigOutput = S.Schema.Type<typeof baseConfigSchema>;

/**
 * Input type for factory functions.
 *
 * Derived from the schema's output type, with fields that have defaults made optional.
 * This approach:
 * - Uses the correct value types (Date, not string)
 * - Makes id, createdAt, updatedAt optional (since schema provides defaults)
 * - Keeps required fields (name, version) as required
 */
type BaseConfigInput =
  & Omit<BaseConfigOutput, "id" | "createdAt" | "updatedAt">
  & Partial<Pick<BaseConfigOutput, "id" | "createdAt" | "updatedAt">>;

/**
 * Unified workspace configuration class.
 *
 * This single class has optional `validation` and `transform` properties.
 * Use type predicates and Effect helpers to safely access these properties
 * with proper type narrowing.
 *
 * @example
 * ```typescript
 * // Parse from JSON
 * const config = S.decodeUnknownSync(workspaceConfigSchema)(jsonData);
 *
 * // Option 1: Type predicate with if-statement
 * if (hasValidation(config)) {
 *   // config.validation is typed as ValidationSettings (not undefined)
 *   console.log(config.validation.datasets.length);
 * }
 *
 * // Option 2: Effect-based helper
 * const result = await Effect.runPromise(
 *   requireValidation(config).pipe(
 *     Effect.map(c => c.validation.datasets.length)
 *   )
 * );
 *
 * // Option 3: Pattern matching with Match.when
 * const message = Match.value(config).pipe(
 *   Match.when(hasValidation, c => `Has ${c.validation.datasets.length} datasets`),
 *   Match.when(hasTransform, c => `Has ${c.transform.datasets.length} transforms`),
 *   Match.orElse(() => "Empty config")
 * );
 * ```
 */
export class WorkspaceConfig extends S.Class<WorkspaceConfig>("WorkspaceConfig")({
  ...baseConfigFields,
  validation: S.optional(validationConfigSchema),
  transform: S.optional(transformConfigSchema),
}) {}

/**
 * Workspace configuration schema with validation filter.
 *
 * Parses JSON and creates a WorkspaceConfig class instance.
 * Validates that at least one of `validation` or `transform` is present.
 *
 * Note: S.Class schemas automatically handle instantiation during decoding
 * and serialization during encoding - no explicit transform needed.
 */
export const workspaceConfigSchema = WorkspaceConfig.pipe(
  S.filter(
    (config) => config.validation !== undefined || config.transform !== undefined,
    {
      message: () => "Workspace config must have 'validation' and/or 'transform' settings",
    },
  ),
);

// =============================================================================
// Type Definitions for Narrowed Configs
// =============================================================================

/**
 * WorkspaceConfig with validation settings guaranteed present.
 *
 * Use `hasValidation()` type predicate or `requireValidation()` Effect
 * to narrow a WorkspaceConfig to this type.
 */
export type ConfigWithValidation = WorkspaceConfig & {
  validation: ValidationConfig;
};

/**
 * WorkspaceConfig with transform settings guaranteed present.
 *
 * Use `hasTransform()` type predicate or `requireTransform()` Effect
 * to narrow a WorkspaceConfig to this type.
 */
export type ConfigWithTransformation = WorkspaceConfig & {
  transform: TransformSettings;
};

/**
 * WorkspaceConfig with both validation and transform settings.
 */
export type FullConfig = ConfigWithValidation & ConfigWithTransformation;

// =============================================================================
// Type Predicates
// =============================================================================

/**
 * Type predicate: Check if config has validation settings.
 *
 * When this returns true, TypeScript narrows the config type to include
 * `validation: ValidationSettings` (not undefined).
 *
 * @example
 * ```typescript
 * if (hasValidation(config)) {
 *   // config.validation is ValidationSettings here
 *   runValidation(config.validation);
 * }
 * ```
 */
export function hasValidation(config: WorkspaceConfig): config is ConfigWithValidation {
  return config.validation !== undefined;
}

/**
 * Type predicate: Check if config has transform settings.
 *
 * When this returns true, TypeScript narrows the config type to include
 * `transform: TransformSettings` (not undefined).
 *
 * @example
 * ```typescript
 * if (hasTransform(config)) {
 *   // config.transform is TransformSettings here
 *   runTransform(config.transform);
 * }
 * ```
 */
export function hasTransform(config: WorkspaceConfig): config is ConfigWithTransformation {
  return config.transform !== undefined;
}

/**
 * Type predicate: Check if config has both validation and transform.
 */
export function isFullConfig(config: WorkspaceConfig): config is FullConfig {
  return hasValidation(config) && hasTransform(config);
}

// =============================================================================
// Effect-Based Requirement Helpers
// =============================================================================

/**
 * Error type for missing config settings.
 */
export class ConfigMissingSettingsError extends S.TaggedError<ConfigMissingSettingsError>()(
  "ConfigMissingSettingsError",
  {
    message: S.String,
    missingSetting: S.Literal("validation", "transform"),
  },
) {}

/**
 * Require validation settings, failing with descriptive error if missing.
 *
 * **Pattern:** Use this Effect helper in Effect generators for runtime validation with type narrowing.
 * Returns an Effect that succeeds with ConfigWithValidation or fails with ConfigMissingSettingsError.
 *
 * **When to use:**
 * - Inside Effect.gen functions where you need validation config
 * - In class methods that return Effects (Validator, Transformer)
 * - When you want automatic error handling via Effect pipeline
 *
 * **Alternative:** For synchronous code or type guards, use `hasValidation()` type predicate instead.
 *
 * @param config - Workspace configuration to validate
 * @returns Effect yielding narrowed config with validation settings
 * @throws ConfigMissingSettingsError if validation settings are missing
 *
 * @example Effect pipeline usage (recommended for class methods)
 * ```typescript
 * class Validator {
 *   private getConfig() {
 *     return requireValidation(this.workspace.getConfig());
 *   }
 *
 *   run(): Effect.Effect<ValidationResult, ConfigMissingSettingsError> {
 *     return Effect.gen(this, function* (_) {
 *       const config = yield* _(this.getConfig());
 *       // config.validation is guaranteed to exist
 *       const datasets = config.validation.datasets;
 *       // ...
 *     });
 *   }
 * }
 * ```
 *
 * @example Compare with hasValidation() type predicate
 * ```typescript
 * // Synchronous code - use type predicate
 * getDatasets(): readonly DatasetConfig[] {
 *   return hasValidation(this.config)
 *     ? this.config.validation.datasets ?? []
 *     : [];
 * }
 *
 * // Effect code - use Effect helper
 * validate(): Effect.Effect<Result, ConfigMissingSettingsError> {
 *   return Effect.gen(function* (_) {
 *     const config = yield* _(requireValidation(workspace.getConfig()));
 *     // Use config.validation
 *   });
 * }
 * ```
 */
export function requireValidation(
  config: WorkspaceConfig,
): Effect.Effect<ConfigWithValidation, ConfigMissingSettingsError> {
  if (hasValidation(config)) {
    return Effect.succeed(config);
  }
  return Effect.fail(
    new ConfigMissingSettingsError({
      message: "Workspace configuration does not include validation settings. " +
        "Add a 'validation' section to your darwinkit.json to enable validation operations.",
      missingSetting: "validation",
    }),
  );
}

/**
 * Require transform settings, failing with descriptive error if missing.
 *
 * **Pattern:** Use this Effect helper in Effect generators for runtime validation with type narrowing.
 * Returns an Effect that succeeds with ConfigWithTransformation or fails with ConfigMissingSettingsError.
 *
 * **When to use:**
 * - Inside Effect.gen functions where you need transform config
 * - In class methods that return Effects (Validator, Transformer)
 * - When you want automatic error handling via Effect pipeline
 *
 * **Alternative:** For synchronous code or type guards, use `hasTransform()` type predicate instead.
 *
 * @param config - Workspace configuration to validate
 * @returns Effect yielding narrowed config with transformation settings
 * @throws ConfigMissingSettingsError if transform settings are missing
 *
 * @example Effect pipeline usage (recommended for class methods)
 * ```typescript
 * class Transformer {
 *   private getConfig() {
 *     return requireTransform(this.workspace.getConfig());
 *   }
 *
 *   run(): Effect.Effect<void, ConfigMissingSettingsError> {
 *     return Effect.gen(this, function* (_) {
 *       const config = yield* _(this.getConfig());
 *       // config.transform is guaranteed to exist
 *       const datasets = config.transform.datasets;
 *       // ...
 *     });
 *   }
 * }
 * ```
 *
 * @example Compare with hasTransform() type predicate
 * ```typescript
 * // Synchronous code - use type predicate
 * hasTransformConfig(): boolean {
 *   return hasTransform(this.config);
 * }
 *
 * // Effect code - use Effect helper
 * transform(): Effect.Effect<void, ConfigMissingSettingsError> {
 *   return Effect.gen(function* (_) {
 *     const config = yield* _(requireTransform(workspace.getConfig()));
 *     // Use config.transform
 *   });
 * }
 * ```
 */
export function requireTransform(
  config: WorkspaceConfig,
): Effect.Effect<ConfigWithTransformation, ConfigMissingSettingsError> {
  if (hasTransform(config)) {
    return Effect.succeed(config);
  }
  return Effect.fail(
    new ConfigMissingSettingsError({
      message: "Workspace configuration does not include transform settings. " +
        "Add a 'transform' section to your darwinkit.json to enable transformation operations.",
      missingSetting: "transform",
    }),
  );
}

/**
 * Require both validation and transform settings.
 */
export function requireFull(
  config: WorkspaceConfig,
): Effect.Effect<FullConfig, ConfigMissingSettingsError> {
  if (isFullConfig(config)) {
    return Effect.succeed(config);
  }
  const missing = !hasValidation(config) ? "validation" : "transform";
  return Effect.fail(
    new ConfigMissingSettingsError({
      message:
        `Workspace configuration requires both validation and transform settings. Missing: ${missing}`,
      missingSetting: missing,
    }),
  );
}

// =============================================================================
// Decode Helpers
// =============================================================================

/** Decode ValidationSettings input, applying defaults */
export const decodeValidationSettings = S.decodeUnknownSync(validationConfigSchema);

/** Decode full workspace config input, applying defaults */
export const decodeWorkspaceConfig = S.decodeUnknownSync(workspaceConfigSchema);

/** Decode dataset config input (validation), applying defaults */
export const decodeDatasetConfig = S.decodeUnknownSync(datasetConfigSchema);

// =============================================================================
// Make Helpers
// =============================================================================

export const makeTransformConfig = transformConfigSchema.make;
export const makeValidationConfig = validationConfigSchema.make;
export const makeImportConfig = importConfigSchema.make;
export const makeOutputConfig = outputConfigSchema.make;
export const makeTransformOutputConfig = transformOutputConfigSchema.make;

// =============================================================================
// Spec Identifier Utilities
// =============================================================================

/**
 * Supported spec identifiers
 *
 * These correspond to specification registries in the shared/specs directory.
 * Each spec defines its own field definitions and validators.
 *
 * Format: "<namespace>-<type>" where namespace is typically "dwc" for Darwin Core.
 * The type portion (after the hyphen) is used to derive the profile name.
 */

/**
 * Parse spec identifier into spec name and type
 *
 * @param specId - Spec identifier in format "namespace-type" (e.g., "dwc-event")
 * @returns Object with spec and type, or null if invalid format
 *
 * @example
 * ```typescript
 * parseSpecIdentifier("dwc-event")  // { spec: "dwc", type: "event" }
 * parseSpecIdentifier("obis-occurrence")  // { spec: "obis", type: "occurrence" }
 * parseSpecIdentifier("invalid")  // null
 * ```
 */
export function parseSpecIdentifier(
  specId: string | undefined,
): { spec: string; type: string } | null {
  if (!specId) {
    return null;
  }
  const parts = specId.split("-");
  if (parts.length < 2) {
    return null;
  }

  const spec = parts[0];
  const type = parts.slice(1).join("-");

  return { spec, type };
}

// =============================================================================
// Workspace Config Factory Functions
// =============================================================================

/**
 * Create a workspace config programmatically.
 *
 * At least one of `validation` or `transform` must be provided.
 * Fields `id`, `createdAt`, and `updatedAt` are optional - defaults are applied
 * automatically by the schema.
 *
 * @example
 * ```typescript
 * const config = makeWorkspaceConfig({
 *   name: "Test Workspace",
 *   version: "1.0.0",
 *   validation: {
 *     datasets: [{ name: "events", spec: "dwc-event", path: "./events.csv", fieldMappings: [] }],
 *   },
 * });
 *
 * // Type narrowing works after creation
 * if (hasValidation(config)) {
 *   console.log(config.validation.datasets.length);
 * }
 * ```
 */
export function makeWorkspaceConfig(
  input: BaseConfigInput & {
    validation?: ValidationConfig;
    transform?: TransformSettings;
  },
): WorkspaceConfig {
  if (input.validation === undefined && input.transform === undefined) {
    throw new Error("Config must have 'validation' and/or 'transform' settings");
  }

  // The WorkspaceConfig constructor applies defaults for id, createdAt, updatedAt
  return new WorkspaceConfig(input);
}
