/**
 * Effect Schema definitions for workspace configuration validation
 */

import * as S from "effect/Schema";
import { EnforcementLevel } from "../specs/validators.ts";



/**
 * Workspace field mapping schema
 */
export const workspaceFieldMappingSchema = S.Struct({
  originName: S.String,
  targetName: S.String,
  isRequired: S.optional(S.Boolean),
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
  spec: S.String,
  path: S.String,
  description: S.optional(S.String),
  profile: S.String,
  fieldMappings: S.Array(workspaceFieldMappingSchema),
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
  datasets: S.Array(S.Object),
  outputDir: S.String,
  outputFilesWithTimestamp: S.optional(S.Boolean),
});

/**
 * Complete workspace configuration schema
 */
const workspaceConfigBaseSchema = S.Struct({
  id: S.String,
  name: S.String,
  version: S.String,
  description: S.optional(S.String),
  transform: transformSettingsSchema,
  validation: validationSettingsSchema,
  crossDatasetRules: S.optional(S.Array(workspaceCrossDatasetRuleSchema)),
  createdAt: S.Date,
  updatedAt: S.Date,
});

/**
 * Workspace configuration schema that allows either validation or transform settings to be omitted, but not both.
 */
export const workspaceConfigSchema = S.Union(
  workspaceConfigBaseSchema.pipe(S.omit("validation")),
  workspaceConfigBaseSchema.pipe(S.omit("transform")),
  workspaceConfigBaseSchema
);

// Note: Type exports are defined in types/workspace-config.ts to avoid duplication
// These schemas validate the types defined there
