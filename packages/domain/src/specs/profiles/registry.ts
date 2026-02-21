/**
 * Validation Profile Registry
 *
 * Central registry for all available validation profiles with support
 * for profile inheritance and composition.
 */

import { join } from "@std/path";
import type {
  FieldOverride,
  RawField,
  ValidationProfile,
  ValidationProfileRegistry,
} from "../../schemas/validation-profile.ts";
import { mergeProfileConstraints } from "../constraints.ts";
import { normalizeField, type SpecField } from "../field-definition.ts";
import { OBIS_EVENT_PROFILE } from "./obis-event.ts";
import { OBIS_BASE_PROFILE } from "./obis.ts";

let _dwcSchemaCache: Record<string, unknown> | null = null;

function loadDwcSchema(): Record<string, unknown> {
  if (!_dwcSchemaCache) {
    const schemaPath = join(import.meta.dirname!, "..", "generated", "dwcSchema.json");
    const text = Deno.readTextFileSync(schemaPath);
    _dwcSchemaCache = JSON.parse(text) as Record<string, unknown>;
  }
  return _dwcSchemaCache;
}
/**
 * All available validation profiles
 */
export const VALIDATION_PROFILES: ValidationProfileRegistry = {
  "obis": OBIS_BASE_PROFILE,
  "obis-event": OBIS_EVENT_PROFILE,
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
        constraints: childOverride.constraints
          ? mergeProfileConstraints(parentOverride.constraints || [], childOverride.constraints)
          : parentOverride.constraints,
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
  const normalizedFields: Record<string, SpecField> = {};

  if (
    "fields" in profile &&
    typeof profile.fields === "object" &&
    profile.fields !== null
  ) {
    for (const [fieldName, fieldValue] of Object.entries(profile.fields)) {
      try {
        normalizedFields[fieldName] = normalizeField(fieldValue as RawField);
      } catch {
        // Skip invalid fields rather than failing the entire profile
        // TODO: When imlementing issue #64 (https://github.com/HakaiInstitute/DarwinKit/issues/64):
        // Surface logs here
        // Effect.logWarning(`Invalid field "${fieldName}" in profile "${profile.id}"`);
      }
    }
  }

  return {
    ...profile,
    // Ensure id is set (JSON profiles may only have 'name', not 'id')
    id: profile.id ?? profile.name,
    // Keep raw fields for transformation (SQL DDL generation)
    fields: "fields" in profile ? profile.fields : undefined,
    // Add normalized fields for validation
    normalizedFields: normalizedFields,
  } as ValidationProfile;
}

/**
 * Resolve a validation profile using standard + class combination.
 *
 * Resolution order:
 * 1. Try `"${standard}-${dwcClass}"` in TypeScript registry (e.g., "obis-event")
 * 2. Fall back to base JSON profile using capitalized class key (e.g., "Event")
 *
 * This allows `standard: "obis"` + `class: "event"` to automatically load
 * the OBIS-Event TypeScript profile with its field overrides.
 */
export function resolveProfile(
  standard: string | undefined,
  dwcClass: string,
): ValidationProfile | undefined {
  if (standard) {
    const compositeKey = `${standard}-${dwcClass.toLowerCase()}`;
    const tsProfile = getValidationProfile(compositeKey);
    if (tsProfile) return tsProfile;
  }

  // Fall back to base profile using capitalized class key
  const baseKey = dwcClass.charAt(0).toUpperCase() + dwcClass.slice(1);
  return getValidationProfile(baseKey);
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
  const rawJsonProfile = loadDwcSchema()[profileId];

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
