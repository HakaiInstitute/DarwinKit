/**
 * Workspace Configuration Types
 *
 * Defines the structure for darwinkit.json configuration files that specify
 * multi-dataset validation and transformation workflows.
 *
 * Note: Most types and functions are defined in and exported from
 * ../schemas/workspace-config.ts. This file provides additional type aliases
 * for convenience.
 */

import type * as S from "effect/Schema";
import type {
  crossDatasetRuleSchema,
  datasetConfigSchema,
  fieldMappingSchema,
  importConfigSchema,
  outputConfigSchema,
  transformDatasetConfigSchema,
  transformOutputConfigSchema,
} from "../schemas/workspace-config.ts";

// =============================================================================
// Common Configuration Types (Type Aliases from Schema Types)
// =============================================================================

/** Import configuration - common settings for data import */
export type ImportConfig = S.Schema.Type<typeof importConfigSchema>;

/** Base output configuration */
export type OutputConfig = S.Schema.Type<typeof outputConfigSchema>;

/** Transform output configuration with additional options */
export type TransformOutputConfig = S.Schema.Type<typeof transformOutputConfigSchema>;

// =============================================================================
// Dataset Configuration Types (Type Aliases from Schema Types)
// =============================================================================

/** Field mapping from source to Darwin Core */
export type WorkspaceFieldMapping = S.Schema.Type<typeof fieldMappingSchema>;

/** Cross-dataset relationship rule */
export type WorkspaceCrossDatasetRule = S.Schema.Type<typeof crossDatasetRuleSchema>;

/** Dataset configuration for validation */
export type DatasetConfig = S.Schema.Type<typeof datasetConfigSchema>;

/** Dataset configuration for transformation */
export type TransformDatasetConfig = S.Schema.Type<typeof transformDatasetConfigSchema>;

// =============================================================================
// Utility Functions
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
