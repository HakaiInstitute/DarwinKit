/**
 * Effect Schema definitions for workspace configuration validation
 */

import type { WorkspaceConfig } from "@dwkt/domain";
import * as S from "effect/Schema";
import { EnforcementLevel, ValidatorConfigSchema } from "../specs/validators.ts";
import type {
  TransformAndValidationConfig,
  TransformOnlyConfig,
  ValidationOnlyConfig,
} from "../types/workspace-config.ts";

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
  nullValues: S.Array(S.String),
  failFast: S.Boolean,
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
  nullValues: S.Array(S.String),
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

export const isTransformOnlyConfig = (
  config: WorkspaceConfig,
): config is TransformOnlyConfig => {
  return S.is(transformOnlyConfigSchema)(config);
};

export const hasTransformationConfig = (
  config: WorkspaceConfig,
): config is TransformOnlyConfig | TransformAndValidationConfig => {
  return S.is(configWithTransformationSchema)(config);
};

export const isTransformAndValidationConfig = (
  config: WorkspaceConfig,
): config is TransformAndValidationConfig => {
  return S.is(transformAndValidationConfigSchema)(config);
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
