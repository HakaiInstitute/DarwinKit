/**
 * Validation Profile Registry
 *
 * Central registry for all available validation profiles with support
 * for profile inheritance and composition.
 */

import DWC_SCHEMA from "../../../../../external/dwcSchema.json" with { type: "json" };
import { parseSpecIdentifier } from "../../schemas/workspace-config.ts";
import type {
  Field,
  FieldOverride,
  ValidationProfile,
  ValidationProfileRegistry,
} from "../../types/validation-profile.ts";
import { type FieldDefinition, normalizeField } from "../field-definition.ts";
import { OBIS_EVENT_PROFILE } from "./obis-event.ts";
import { OBIS_BASE_PROFILE } from "./obis.ts";
/**
 * All available validation profiles
 */
export const VALIDATION_PROFILES: ValidationProfileRegistry = {
  "obis": OBIS_BASE_PROFILE,
  "obis-event": OBIS_EVENT_PROFILE,
  // Add more profiles here:
  // "obis-occurrence": OBIS_OCCURRENCE_PROFILE,
  // "gbif-event": GBIF_EVENT_PROFILE,
  // "gbif-occurrence": GBIF_OCCURRENCE_PROFILE,
} as const;

/**
 * Merge two field override objects (child overrides parent)
 */
function mergeFieldOverrides(
  parent: Record<string, FieldOverride>,
  child: Record<string, FieldOverride>,
): Record<string, FieldOverride> {
  const merged: Record<string, FieldOverride> = { ...parent };

  for (const [fieldName, childOverride] of Object.entries(child)) {
    const parentOverride = merged[fieldName];

    if (!parentOverride) {
      // Field only in child
      merged[fieldName] = childOverride;
    } else {
      // Merge parent and child overrides (child takes precedence)
      merged[fieldName] = {
        requirement: childOverride.requirement ?? parentOverride.requirement,
        validators: childOverride.validators
          ? [...(parentOverride.validators || []), ...childOverride.validators]
          : parentOverride.validators,
        enforcement: childOverride.enforcement ?? parentOverride.enforcement,
      };
    }
  }

  return merged;
}

/**
 * Merge parent and child profiles (child overrides parent)
 *
 * Inherits fields and normalizedFields from parent, then applies child's fieldOverrides.
 */
function mergeProfiles(parent: ValidationProfile, child: ValidationProfile): ValidationProfile {
  return {
    ...child,
    // Inherit field definitions from parent (used for SQL DDL generation)
    fields: child.fields || parent.fields,
    // Inherit normalized fields from parent (used for validation)
    normalizedFields: child.normalizedFields || parent.normalizedFields,
    // Merge field overrides (child takes precedence)
    fieldOverrides: mergeFieldOverrides(parent.fieldOverrides, child.fieldOverrides),
  };
}

/**
 * Normalize a JSON profile by converting field objects to NormalizedField
 *
 * This ensures consistent field structure regardless of source (JSON vs TypeScript).
 * Preserves raw fields for transformation while adding normalized fields for validation.
 */
function normalizeJsonProfile(jsonProfile: unknown): ValidationProfile {
  // Type guard: ensure jsonProfile is an object
  if (typeof jsonProfile !== "object" || jsonProfile === null) {
    throw new Error("Invalid JSON profile: expected object");
  }

  const profile = jsonProfile as Record<string, unknown>;

  // Normalize fields if they exist
  const normalizedFields: Record<string, FieldDefinition> = {};

  // TODO: Can we use schema parsing here?

  if (
    "fields" in profile &&
    typeof profile.fields === "object" &&
    profile.fields !== null
  ) {
    for (const [fieldName, fieldValue] of Object.entries(profile.fields)) {
      try {
        normalizedFields[fieldName] = normalizeField(fieldValue as Field);
      } catch (error) {
        console.warn(`Failed to normalize field '${fieldName}':`, error);
        // Skip invalid fields rather than failing the entire profile
      }
    }
  }

  return {
    ...profile,
    // Keep raw fields for transformation (SQL DDL generation)
    fields: "fields" in profile ? profile.fields : undefined,
    // Add normalized fields for validation
    normalizedFields: normalizedFields,
  } as ValidationProfile;
}

/**
 * Get a validation profile by ID with inheritance resolution
 *
 * If a profile extends another profile, the parent's field overrides
 * are merged with the child's (child takes precedence).
 */
export function getValidationProfile(profileId: string): ValidationProfile | undefined {
  // Try to get profile from TypeScript registry first
  const tsProfile = VALIDATION_PROFILES[profileId];
  if (tsProfile) {
    // Resolve inheritance chain for TypeScript profiles
    if (tsProfile.extends) {
      const parent = getValidationProfile(tsProfile.extends);
      if (parent) {
        return mergeProfiles(parent, tsProfile);
      }
    }
    return tsProfile;
  }

  // Fall back to JSON schema (for base Darwin Core profiles like "Event", "Occurrence")
  const rawJsonProfile = (DWC_SCHEMA as unknown as Record<string, unknown>)[profileId];

  if (!rawJsonProfile) return undefined;

  // Normalize JSON profile to ensure consistent field structure
  const jsonProfile = normalizeJsonProfile(rawJsonProfile);

  // JSON profiles use the schema as-is without extracting obis_required metadata
  // obis_required is only enforced when using explicit OBIS profiles like "obis-event"

  // Resolve inheritance chain
  if (jsonProfile.extends) {
    const parent = getValidationProfile(jsonProfile.extends);
    if (parent) {
      return mergeProfiles(parent, jsonProfile);
    }
  }

  return jsonProfile;
}

/**
 * List all available profile IDs
 */
export function listValidationProfiles(): string[] {
  return Object.keys(VALIDATION_PROFILES);
}

/**
 * Check if a profile ID is valid
 */
export function isValidProfileId(profileId: string): boolean {
  return profileId in VALIDATION_PROFILES;
}

/**
 * Resolve validation profile from dataset configuration
 *
 * This function encapsulates the common pattern of deriving a validation profile
 * from a dataset config, with fallback logic:
 * 1. Try explicit dataset.profile first (direct lookup via getValidationProfile)
 * 2. Fall back to deriving from dataset.spec (parses spec identifier, then derives profile name)
 *
 * Spec identifier parsing follows the format "namespace-type" (e.g., "dwc-event"):
 * - Parses using parseSpecIdentifier() to extract the type
 * - Capitalizes the type to match profile names (e.g., "event" → "Event")
 * - Handles special aliases (e.g., "eMOF" → "ExtendedMeasurementOrFact")
 *
 * @param dataset - Dataset configuration (needs spec and/or profile fields)
 * @returns Resolved validation profile, or undefined if no profile can be determined
 *
 * @example
 * ```typescript
 * // Using explicit profile (takes precedence)
 * const dataset = { spec: "dwc-event", profile: "obis-event" };
 * const profile = resolveDatasetProfile(dataset); // Returns OBIS Event profile
 *
 * // Deriving from spec identifier
 * const dataset = { spec: "dwc-event" };
 * const profile = resolveDatasetProfile(dataset); // Parses "dwc-event" → derives "Event" profile
 *
 * // Handling spec aliases
 * const dataset = { spec: "dwc-eMOF" };
 * const profile = resolveDatasetProfile(dataset); // Maps "eMOF" → "ExtendedMeasurementOrFact"
 * ```
 */
/**
 * Map of spec type aliases to their canonical profile names
 *
 * Used for:
 * 1. Common abbreviations (eMOF → ExtendedMeasurementOrFact)
 * 2. Non-standard capitalizations (dnaDerivedData starts with lowercase)
 */
const SPEC_TYPE_ALIASES: Record<string, string> = {
  "eMOF": "ExtendedMeasurementOrFact",
  "emof": "ExtendedMeasurementOrFact",
  "dnaDerivedData": "dnaDerivedData", // Profile name doesn't follow standard capitalization
};

export function resolveDatasetProfile(
  dataset: { profile?: string; spec?: string },
): ValidationProfile | undefined {
  // Try explicit profile first (highest priority)
  if (dataset.profile) {
    return getValidationProfile(dataset.profile);
  }

  // Fall back to deriving from spec identifier
  if (dataset.spec) {
    const parsed = parseSpecIdentifier(dataset.spec);
    if (parsed) {
      // Check for known aliases first
      const aliasedProfileId = SPEC_TYPE_ALIASES[parsed.type];
      if (aliasedProfileId) {
        return getValidationProfile(aliasedProfileId);
      }

      // Capitalize the type to match profile names (e.g., "event" → "Event")
      const derivedProfileId = parsed.type.charAt(0).toUpperCase() + parsed.type.slice(1);
      return getValidationProfile(derivedProfileId);
    }
  }

  return undefined;
}
