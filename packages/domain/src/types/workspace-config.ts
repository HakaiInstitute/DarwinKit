/**
 * Workspace Configuration Types
 *
 * Defines the structure for darwinkit.json configuration files that specify
 * multi-dataset validation workflows. Each dataset is validated against a
 * specification (e.g., Darwin Core) with explicit field mappings.
 */

import type { validationOnlyConfigSchema } from "@dwkt/domain";
import type * as S from "effect/Schema";
import type {
  configWithTransformationSchema,
  configWithValidationSchema,
  datasetConfigSchema,
  transformAndValidationConfigSchema,
  transformOnlyConfigSchema,
  validationSettingsSchema,
  workspaceConfigSchema,
  workspaceCrossDatasetRuleSchema,
  workspaceFieldMappingSchema,
} from "../schemas/workspace-config.ts";

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
export type ConfigWithTransformation = S.Schema.Type<typeof configWithTransformationSchema>;

/**
 * Supported spec identifiers
 *
 * These correspond to specification registries in the shared/specs directory.
 * Each spec defines its own field definitions and validators.
 */

const validSpecs = [
  "Event",
  "Occurrence",
  "ExtendedMeasurementOrFact",
  "dwc-resourceRelationship",
  "metadata-v1",
] as const;

type SpecIdentifier = typeof validSpecs[number];

/**
 * Validate that a spec identifier is supported
 */
export function isValidSpecIdentifier(specId: string): specId is SpecIdentifier {
  return validSpecs.includes(specId as SpecIdentifier);
}

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
