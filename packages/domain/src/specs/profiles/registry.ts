/**
 * Validation Profile Registry
 *
 * Central registry for all available validation profiles with support
 * for profile inheritance and composition.
 */

import type {
  FieldOverride,
  ValidationProfile,
  ValidationProfileRegistry,
} from "../../types/validation-profile.ts";
import { OBIS_BASE_PROFILE } from "./obis.ts";
import { OBIS_EVENT_PROFILE } from "./obis-event.ts";
import DWC_SCHEMA from "../../../../../external/dwcSchema.json" with { type: "json" };
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
 */
function mergeProfiles(parent: ValidationProfile, child: ValidationProfile): ValidationProfile {
  return {
    ...child,
    fieldOverrides: mergeFieldOverrides(parent.fieldOverrides, child.fieldOverrides),
  };
}

/**
 * Get a validation profile by ID with inheritance resolution
 *
 * If a profile extends another profile, the parent's field overrides
 * are merged with the child's (child takes precedence).
 */
export function getValidationProfile(profileId: string): ValidationProfile | undefined {
  // const profile = VALIDATION_PROFILES[profileId];
  const profile = DWC_SCHEMA[profileId];
  
  if (!profile) return undefined;

  // Resolve inheritance chain
  if (profile.extends) {
    const parent = getValidationProfile(profile.extends);
    if (parent) {
      return mergeProfiles(parent, profile);
    }
  }

  return profile;
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
