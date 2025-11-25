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
 * Dataset configuration schema
 */
export const datasetConfigSchema = S.Struct({
  name: S.String,
  spec: S.optional(S.String),
  path: S.optional(S.String),
  source: S.optional(S.Object),
  description: S.optional(S.String),
  profile: S.String,
  fieldMappings: S.optional(S.Array(workspaceFieldMappingSchema)),
  fields: S.optional(S.Object),
});

/**
 * Validation settings schema
 */
export const validationSettingsSchema = S.Struct({
  nullValues: S.Array(S.String),
  failFast: S.Boolean,
  outputDir: S.String,
  datasets: S.Array(datasetConfigSchema),
});

/**
 * Transform settings schema
 */
export const transformSettingsSchema = S.Struct({
  nullValues: S.Array(S.String),
  inputs: S.Object,
  postImportTransforms: S.Array(S.String),
  datasets: S.Array(datasetConfigSchema),
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

/**
 * Workspace configuration schema that requires at least one of validation or transform.
 * This creates a proper discriminated union with three variants:
 * 1. Only validation (no transform)
 * 2. Only transform (no validation)
 * 3. Both validation and transform
 */
export const workspaceConfigSchema = S.Union(
  // Only validation
  S.Struct({
    ...workspaceConfigBaseFields.fields,
    validation: validationSettingsSchema,
  }),
  // Only transform
  S.Struct({
    ...workspaceConfigBaseFields.fields,
    transform: transformSettingsSchema,
  }),
  // Both validation and transform
  S.Struct({
    ...workspaceConfigBaseFields.fields,
    validation: validationSettingsSchema,
    transform: transformSettingsSchema,
  }),
);

// Note: Type exports are defined in types/workspace-config.ts to avoid duplication
// These schemas validate the types defined there
