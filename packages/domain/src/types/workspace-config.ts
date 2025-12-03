/**
 * Workspace Configuration Types
 *
 * Defines the structure for darwinkit.json configuration files that specify
 * multi-dataset validation workflows. Each dataset is validated against a
 * specification (e.g., Darwin Core) with explicit field mappings.
 */

import type * as S from "effect/Schema";
import type {
  datasetConfigSchema,
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

/**
 * Default validation settings
 */
export const DEFAULT_VALIDATION_SETTINGS: ValidationSettings = {
  nullValues: ["", "NA", "N/A", "NULL", "null"],
  failFast: false,
  outputDir: "./validation_results",
  // maxViolationsPerField: undefined, // Optional: defaults to unlimited
  // enableSuggestions: true, // Optional: defaults to true
};

/**
 * Supported spec identifiers
 *
 * These correspond to specification registries in the shared/specs directory.
 * Each spec defines its own field definitions and validators.
 */
export type SpecIdentifier =
  | "Event"
  | "Occurrence"
  | "ExtendedMeasurementOrFact"
  | "dwc-resourceRelationship"
  | "metadata-v1";

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

/**
 * Validate that a spec identifier is supported
 */
export function isValidSpecIdentifier(specId: string): specId is SpecIdentifier {
  const validSpecs: readonly string[] = [
    "Event",
    "Occurrence",
    "ExtendedMeasurementOrFact",
    "dwc-resourceRelationship",
    "metadata-v1",
  ];

  return validSpecs.includes(specId);
}
