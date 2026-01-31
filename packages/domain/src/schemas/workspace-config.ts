/**
 * Effect Schema definitions for workspace configuration validation
 *
 * Uses a single struct with optional validation/transform fields,
 * filtered to ensure at least one is present. This approach:
 * - Simplifies schema logic over union-based variants
 * - Enables schema.make() with constructor defaults
 * - Keeps all validation logic in the schema definition
 */

import * as S from "effect/Schema";
import { EnforcementLevel, ValidatorConfigSchema } from "../specs/validators.ts";

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_NULL_VALUES = ["NA", "N/A", "", "NULL", "null"];
const DEFAULT_WORKSPACE_NAME = "Workspace";
const DEFAULT_VERSION = "1.0.0";
const DEFAULT_OUTPUT_DIR = "./output";

// =============================================================================
// Field Mapping Schemas
// =============================================================================

/**
 * Maps source columns to Darwin Core fields
 */
export const workspaceFieldMappingSchema = S.Struct({
  originName: S.String,
  targetName: S.String,
  isRequired: S.optional(S.Boolean),
  constraints: S.optional(S.Record({ key: S.String, value: S.Unknown })),
  validators: S.optional(S.Array(ValidatorConfigSchema)),
});

/**
 * Defines relationships between datasets
 */
export const workspaceCrossDatasetRuleSchema = S.Struct({
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
 * Dataset configuration schema for validation
 * TODO: Should probably name accordingly (something like validationDatasetConfig)
 */
export const datasetConfigSchema = S.Struct({
  name: S.String,
  spec: S.String,
  path: S.String,
  description: S.optional(S.String),
  profile: S.optional(S.String),
  fieldMappings: S.Array(workspaceFieldMappingSchema),
});

/**
 * Dataset configuration schema for transform workflows
 */
export const transformDatasetConfigSchema = S.Struct({
  name: S.String,
  profile: S.String,
  source: S.optional(S.Object),
  description: S.optional(S.String),
  fields: S.optional(S.Object),
});

// =============================================================================
// Validation Settings Schema
// =============================================================================

/**
 * Validation settings schema
 *
 * Uses two default patterns for optional fields:
 * - `S.optionalWith(schema, { default: () => value })` - Applies defaults during decoding
 * - `.pipe(S.withConstructorDefault(() => value))` - Applies defaults when using schema.make()
 */
export const validationSettingsSchema = S.Struct({
  nullValues: S.optionalWith(S.Array(S.String), {
    default: () => [...DEFAULT_NULL_VALUES],
  }).pipe(S.withConstructorDefault(() => [...DEFAULT_NULL_VALUES])),
  failFast: S.optionalWith(S.Boolean, { default: () => false }).pipe(
    S.withConstructorDefault(() => false),
  ),
  debug: S.optionalWith(S.Boolean, { default: () => false }).pipe(
    S.withConstructorDefault(() => false),
  ),
  outputDir: S.optionalWith(S.String, { default: () => DEFAULT_OUTPUT_DIR }).pipe(
    S.withConstructorDefault(() => DEFAULT_OUTPUT_DIR),
  ),
  description: S.optional(S.String),
  maxViolationsPerField: S.optional(S.Number),
  enableSuggestions: S.optional(S.Boolean),
  datasets: S.optionalWith(S.Array(datasetConfigSchema), { default: () => [] }).pipe(
    S.withConstructorDefault(() => []),
  ),
});

// =============================================================================
// Transform Settings Schema
// =============================================================================

/**
 * Transform settings schema
 */
export const transformSettingsSchema = S.Struct({
  nullValues: S.optionalWith(S.Array(S.String), {
    default: () => [...DEFAULT_NULL_VALUES],
  }),
  inputs: S.Object,
  postImportTransforms: S.optional(S.Array(S.String)),
  datasets: S.Array(transformDatasetConfigSchema),
  output: S.Struct({
    outputDir: S.String,
    outputFilesWithTimestamp: S.optional(S.Boolean),
    exportDB: S.Boolean,
    exportDBFileName: S.optional(S.String),
    dropNullColumns: S.optional(S.Boolean),
  }),
});

// =============================================================================
// Workspace Configuration Schema
// =============================================================================

/**
 * Defines the structure with optional validation/transform, filtered to ensure
 * at least one is present.
 */
const workspaceConfigSchema = S.Struct({
  id: S.optionalWith(S.String, { default: () => crypto.randomUUID() }).pipe(
    S.withConstructorDefault(() => crypto.randomUUID()),
  ),
  name: S.optionalWith(S.String, { default: () => DEFAULT_WORKSPACE_NAME }).pipe(
    S.withConstructorDefault(() => DEFAULT_WORKSPACE_NAME),
  ),
  version: S.optionalWith(S.String, { default: () => DEFAULT_VERSION }).pipe(
    S.withConstructorDefault(() => DEFAULT_VERSION),
  ),
  description: S.optional(S.String),
  crossDatasetRules: S.optional(S.Array(workspaceCrossDatasetRuleSchema)),
  createdAt: S.optionalWith(S.Date, { default: () => new Date() }).pipe(
    S.withConstructorDefault(() => new Date()),
  ),
  updatedAt: S.optionalWith(S.Date, { default: () => new Date() }).pipe(
    S.withConstructorDefault(() => new Date()),
  ),
  validation: S.optional(validationSettingsSchema),
  transform: S.optional(transformSettingsSchema),
}).pipe(
  S.filter(
    (config) => config.validation !== undefined || config.transform !== undefined,
    { message: () => "Workspace config must have 'validation' and/or 'transform' settings" },
  ),
);

// =============================================================================
// Type Exports
// =============================================================================

export type ValidationSettings = S.Schema.Type<typeof validationSettingsSchema>;
export type ValidationSettingsInput = S.Schema.Encoded<typeof validationSettingsSchema>;
export type TransformSettings = S.Schema.Type<typeof transformSettingsSchema>;
export type WorkspaceFieldMapping = S.Schema.Type<typeof workspaceFieldMappingSchema>;
export type WorkspaceCrossDatasetRule = S.Schema.Type<typeof workspaceCrossDatasetRuleSchema>;
export type DatasetConfig = S.Schema.Type<typeof datasetConfigSchema>;
export type WorkspaceConfig = S.Schema.Type<typeof workspaceConfigSchema>;

/**
 * Result of looking up a foreign key rule
 */
export type ForeignKeyRuleMatch =
  & Pick<WorkspaceCrossDatasetRule, "targetDataset" | "targetField">
  & Required<Pick<WorkspaceCrossDatasetRule, "enforcement">>;

/** Config with validation settings guaranteed present */
export type ConfigWithValidation = WorkspaceConfig & { validation: ValidationSettings };

/** Config with transform settings guaranteed present */
export type ConfigWithTransform = WorkspaceConfig & { transform: TransformSettings };

// =============================================================================
// Type Predicates
// =============================================================================

export const hasValidationConfig = (c: WorkspaceConfig): c is ConfigWithValidation =>
  c.validation !== undefined;

export const hasTransformationConfig = (c: WorkspaceConfig): c is ConfigWithTransform =>
  c.transform !== undefined;

// =============================================================================
// Factory Functions
// =============================================================================

/** Input type for makeWorkspaceConfig - allows partial settings with defaults applied */
export type WorkspaceConfigInput = S.Schema.Encoded<typeof workspaceConfigSchema>;

/**
 * Create a WorkspaceConfig with defaults applied.
 *
 * Uses schema decoding to apply defaults to both workspace fields and nested
 * validation settings. All defaults are defined in the schema itself.
 *
 * @example
 * ```typescript
 * const config = makeWorkspaceConfig({
 *   validation: {
 *     datasets: [{ name: "events", spec: "dwc-event", path: "./events.csv", fieldMappings: [] }]
 *   }
 * });
 * // id, name, version, createdAt, updatedAt are auto-generated
 * // validation.nullValues, failFast, debug, outputDir get defaults
 * ```
 */
export function makeWorkspaceConfig(input: WorkspaceConfigInput): WorkspaceConfig {
  return S.decodeUnknownSync(workspaceConfigSchema)(input);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Parse spec identifier into spec name and type
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
