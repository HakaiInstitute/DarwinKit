/**
 * Effect Schema definitions for workspace configuration validation
 */

import * as S from "effect/Schema";
import { EnforcementLevel, ValidatorConfigSchema } from "../specs/validators.ts";

/**
 * Workspace field mapping schema
 */
export const workspaceFieldMappingSchema = S.Struct({
  originName: S.String,
  targetName: S.String,
  isRequired: S.optional(S.Boolean),
  constraints: S.optional(S.Record({ key: S.String, value: S.Unknown })),
  validators: S.optional(S.Array(ValidatorConfigSchema)),
});

/**
 * Workspace cross-dataset rule schema
 */
export const workspaceCrossDatasetRuleSchema = S.Struct({
  ruleType: S.Literal("foreignKey", "referentialIntegrity"),
  sourceDataset: S.String,
  sourceField: S.String,
  targetDataset: S.String,
  targetField: S.String,
  enforcement: S.optional(EnforcementLevel), // Defaults to "required" if not specified
  description: S.optional(S.String),
});

/**
 * Dataset configuration schema for validation
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
 * Dataset configuration schema for transform
 * (includes additional fields needed for transformation)
 */
export const transformDatasetConfigSchema = S.Struct({
  name: S.String,
  profile: S.String,
  source: S.optional(S.Object),
  description: S.optional(S.String),
  fields: S.optional(S.Object),
});

/**
 * Validation settings schema
 */
export const validationSettingsSchema = S.Struct({
  nullValues: S.optionalWith(S.Array(S.String), {
    default: () => ["NA", "N/A", "", "NULL", "null"],
  }),
  failFast: S.optionalWith(S.Boolean, { default: () => false }),
  debug: S.optionalWith(S.Boolean, { default: () => false }),
  outputDir: S.String,
  description: S.optional(S.String),
  maxViolationsPerField: S.optional(S.Number), // Limit violations per field (default: unlimited)
  enableSuggestions: S.optional(S.Boolean), // Enable fuzzy matching for vocabulary violations (default: true)
  datasets: S.Array(datasetConfigSchema),
});

/**
 * Transform settings schema
 */
export const transformSettingsSchema = S.Struct({
  nullValues: S.optionalWith(S.Array(S.String), {
    default: () => ["NA", "N/A", "", "NULL", "null"],
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

/**
 * Base fields shared by all workspace configurations
 */
const workspaceConfigBaseFields = S.Struct({
  id: S.String,
  name: S.String,
  version: S.String,
  description: S.optional(S.String),
  crossDatasetRules: S.optional(S.Array(workspaceCrossDatasetRuleSchema)),
  createdAt: S.Date,
  updatedAt: S.Date,
});

export const validationOnlyConfigSchema = S.Struct({
  ...workspaceConfigBaseFields.fields,
  validation: validationSettingsSchema,
});

export const transformOnlyConfigSchema = S.Struct({
  ...workspaceConfigBaseFields.fields,
  transform: transformSettingsSchema,
});

export const transformAndValidationConfigSchema = S.Struct({
  ...workspaceConfigBaseFields.fields,
  validation: validationSettingsSchema,
  transform: transformSettingsSchema,
});

/**
 * Schema for any config that has validation settings
 * (may or may not have transformation settings)
 */
export const configWithValidationSchema = S.Union(
  validationOnlyConfigSchema,
  transformAndValidationConfigSchema,
);

/**
 * Schema for any config that has transformation settings
 * (may or may not have validation settings)
 */
export const configWithTransformationSchema = S.Union(
  transformOnlyConfigSchema,
  transformAndValidationConfigSchema,
);

export const isValidationOnlyConfig = (
  config: WorkspaceConfig,
): config is ValidationOnlyConfig => {
  return S.is(validationOnlyConfigSchema)(config);
};

export const hasValidationConfig = (
  config: WorkspaceConfig,
): config is ValidationOnlyConfig | TransformAndValidationConfig => {
  return S.is(configWithValidationSchema)(config);
};

export const hasTransformationConfig = (
  config: WorkspaceConfig,
): config is TransformOnlyConfig | TransformAndValidationConfig => {
  return S.is(configWithTransformationSchema)(config);
};

/**
 * Workspace configuration schema that requires at least one of validation or transform.
 * This creates a discriminated union with three variants:
 * 1. Only validation (no transform)
 * 2. Only transform (no validation)
 * 3. Both validation and transform
 *
 * Note: datasets is at root level for validation workflows
 */
export const workspaceConfigSchema = S.Union(
  validationOnlyConfigSchema,
  transformOnlyConfigSchema,
  transformAndValidationConfigSchema,
);

// Types derived from schemas
export type ValidationSettings = S.Schema.Type<typeof validationSettingsSchema>;
export type WorkspaceFieldMapping = S.Schema.Type<typeof workspaceFieldMappingSchema>;
export type WorkspaceCrossDatasetRule = S.Schema.Type<typeof workspaceCrossDatasetRuleSchema>;
export type DatasetConfig = S.Schema.Type<typeof datasetConfigSchema>;
export type WorkspaceConfig = S.Schema.Type<typeof workspaceConfigSchema>;
export type ValidationOnlyConfig = S.Schema.Type<typeof validationOnlyConfigSchema>;
export type TransformOnlyConfig = S.Schema.Type<typeof transformOnlyConfigSchema>;
export type TransformAndValidationConfig = S.Schema.Type<typeof transformAndValidationConfigSchema>;
export type ConfigWithValidation = S.Schema.Type<typeof configWithValidationSchema>;

/**
 * Result of looking up a foreign key rule
 *
 * Derived from WorkspaceCrossDatasetRule with required enforcement
 */
export type ForeignKeyRuleMatch =
  & Pick<WorkspaceCrossDatasetRule, "targetDataset" | "targetField">
  & Required<Pick<WorkspaceCrossDatasetRule, "enforcement">>;

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
