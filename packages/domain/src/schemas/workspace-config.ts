/**
 * Effect Schema definitions for workspace configuration validation
 */

import * as S from "effect/Schema";
import { EnforcementLevel } from "../specs/validators.ts";

/**
 * Validation settings schema
 */
export const validationSettingsSchema = S.Struct({
  profile: S.optional(S.String),
  nullValues: S.Array(S.String),
  failFast: S.Boolean,
  outputDir: S.String,
});

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
  fieldMappings: S.Array(workspaceFieldMappingSchema),
});

/**
 * Complete workspace configuration schema
 */
export const workspaceConfigSchema = S.Struct({
  id: S.String,
  name: S.String,
  version: S.String,
  description: S.optional(S.String),
  validation: validationSettingsSchema,
  datasets: S.Array(datasetConfigSchema),
  crossDatasetRules: S.optional(S.Array(workspaceCrossDatasetRuleSchema)),
  createdAt: S.Date,
  updatedAt: S.Date,
});

// Note: Type exports are defined in types/workspace-config.ts to avoid duplication
// These schemas validate the types defined there
