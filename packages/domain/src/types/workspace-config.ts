/**
 * Workspace Configuration Types
 *
 * Defines the structure for darwinkit.json configuration files that specify
 * multi-dataset validation workflows. Each dataset is validated against a
 * specification (e.g., Darwin Core) with explicit field mappings.
 */

import type { BaseEntity } from "./common.ts";
import type { EnforcementLevel } from "../specs/validators.ts";

/**
 * Validation settings for the workspace
 */
export interface ValidationSettings {
  readonly nullValues: readonly string[];
  readonly failFast: boolean;
  readonly outputDir: string;

  /**
   * Optional validation profile ID (e.g., "obis-event", "gbif-occurrence")
   *
   * Profiles layer additional validation requirements on top of base specs.
   * See packages/shared/src/specs/profiles/ for available profiles.
   */
  readonly profile?: string;
}

/**
 * Field mapping from CSV column to spec field
 * Re-export from field-mapping types for workspace config
 */
export interface WorkspaceFieldMapping {
  readonly originName: string;
  readonly targetName: string;
  readonly isRequired?: boolean;

  /**
   * Field-level validation overrides
   *
   * Allows project-specific constraints or validators to override
   * both the base spec and validation profile.
   *
   * Priority: field override > profile > base spec
   */
  readonly constraints?: Record<string, unknown>;
  readonly validators?: readonly import("../specs/validators.ts").ValidatorConfig[];
}

/**
 * Cross-dataset validation rule for workspace config
 */
export interface WorkspaceCrossDatasetRule {
  readonly ruleType: "foreignKey" | "referentialIntegrity";
  readonly sourceDataset: string;
  readonly sourceField: string;
  readonly targetDataset: string;
  readonly targetField: string;
  readonly enforcement?: EnforcementLevel; // Defaults to "required" if not specified
  readonly description?: string;
}

/**
 * Individual dataset configuration within a workspace
 */
export interface DatasetConfig {
  readonly name: string;
  readonly spec: string; // e.g., "dwc-event", "dwc-occurrence", "metadata-v1"
  readonly path: string; // Path to CSV file
  readonly description?: string;
  readonly validation: {
    readonly profile?: string;
  };
  readonly fieldMappings: readonly WorkspaceFieldMapping[];
}

/**
 * Complete workspace configuration
 */
export interface WorkspaceConfig extends BaseEntity {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly validation: ValidationSettings;
  readonly datasets: readonly DatasetConfig[];
  readonly crossDatasetRules?: readonly WorkspaceCrossDatasetRule[];
}

/**
 * Default validation settings
 */
export const DEFAULT_VALIDATION_SETTINGS: ValidationSettings = {
  nullValues: ["", "NA", "N/A", "NULL", "null"],
  failFast: false,
  outputDir: "./validation_results",
};

/**
 * Supported spec identifiers
 *
 * These correspond to specification registries in the shared/specs directory.
 * Each spec defines its own field definitions and validators.
 */
export type SpecIdentifier =
  | "dwc-event"
  | "dwc-occurrence"
  | "dwc-extendedMeasurementOrFacts"
  | "dwc-resourceRelationship"
  | "metadata-v1";

/**
 * Parse spec identifier into spec name and type
 */
export function parseSpecIdentifier(
  specId: string,
): { spec: string; type: string } | null {
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
    "dwc-event",
    "dwc-occurrence",
    "dwc-extendedMeasurementOrFacts",
    "dwc-resourceRelationship",
    "metadata-v1",
  ];

  return validSpecs.includes(specId);
}
