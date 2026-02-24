/**
 * Validation Profile Registry
 *
 * Central registry for specs (base schemas from JSON) and profiles
 * (TypeScript overlays) with support for inheritance and composition.
 *
 * - Specs: Base Darwin Core schemas (Event, Occurrence, etc.) from dwcSchema.json
 * - Profiles: Community-specific overlays (OBIS, OBIS-Event) defined in TypeScript
 * - ResolvedSpec: Merged result of Spec + Profile for validation
 */

import { join } from "@std/path";
import type {
  FieldOverride,
  Profile,
  ProfileRegistry,
  RawField,
  ResolvedSpec,
  Spec,
  TransformField,
} from "../../schemas/validation-profile.ts";
import { mergeProfileConstraints } from "../constraints.ts";
import {
  normalizeField,
  type ResolvedField,
  type SpecField,
  toResolvedField,
} from "../field-definition.ts";
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

// =============================================================================
// Profile Registry (TypeScript-defined overlays)
// =============================================================================

/**
 * All available TypeScript profiles
 */
export const PROFILE_REGISTRY: ProfileRegistry = {
  "obis": OBIS_BASE_PROFILE,
  "obis-event": OBIS_EVENT_PROFILE,
} as const;

// =============================================================================
// Field Override Merging
// =============================================================================

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

// =============================================================================
// Spec Loading (from JSON)
// =============================================================================

/**
 * Normalize a JSON profile to a Spec by converting raw fields to SpecFields.
 *
 * Produces a Spec with both rawFields (for DDL) and normalizedFields (for validation).
 */
function normalizeJsonToSpec(jsonProfile: unknown): Spec {
  if (typeof jsonProfile !== "object" || jsonProfile === null) {
    throw new Error("Invalid JSON profile: expected object");
  }

  const profile = jsonProfile as Record<string, unknown>;

  // Normalize fields if they exist
  const normalizedFields: Record<string, SpecField> = {};
  const rawFields: Record<string, TransformField> = {};

  if (
    "fields" in profile &&
    typeof profile.fields === "object" &&
    profile.fields !== null
  ) {
    for (const [fieldName, fieldValue] of Object.entries(profile.fields)) {
      try {
        normalizedFields[fieldName] = normalizeField(fieldValue as RawField);
      } catch {
        // Skip invalid fields rather than failing the entire spec
      }
      // Preserve raw field data for DDL generation
      const raw = fieldValue as Record<string, unknown>;
      rawFields[fieldName] = {
        type: typeof raw.type === "string" ? raw.type : undefined,
        unique: typeof raw.unique === "string" ? raw.unique : undefined,
        values: typeof raw.values === "object" && raw.values !== null
          ? raw.values as Record<string, unknown>
          : undefined,
      };
    }
  }

  return {
    id: (profile.id ?? profile.name) as string,
    name: profile.name as string,
    description: profile.description as string | undefined,
    normalizedFields,
    rawFields: Object.keys(rawFields).length > 0 ? rawFields : undefined,
  };
}

/**
 * Get a base Spec by ID from JSON schema.
 *
 * Returns a Spec with normalizedFields and rawFields.
 * Does NOT resolve inheritance — use getResolvedSpec() for that.
 */
function getJsonSpec(specId: string): Spec | undefined {
  const rawJsonProfile = loadDwcSchema()[specId];
  if (!rawJsonProfile) return undefined;
  return normalizeJsonToSpec(rawJsonProfile);
}

// =============================================================================
// Profile Resolution
// =============================================================================

/**
 * Get a Profile by ID from the TypeScript registry.
 */
export function getProfile(profileId: string): Profile | undefined {
  return PROFILE_REGISTRY[profileId];
}

/**
 * Resolve a Profile's inheritance chain, merging field overrides.
 *
 * Returns the profile with all inherited field overrides merged.
 * Parent profiles contribute their field overrides (child takes precedence).
 */
function resolveProfileChain(profile: Profile): {
  fieldOverrides: Record<string, FieldOverride>;
  spec: Spec | undefined;
} {
  if (!profile.extends) {
    return { fieldOverrides: profile.fieldOverrides, spec: undefined };
  }

  // Check if parent is another Profile
  const parentProfile = PROFILE_REGISTRY[profile.extends];
  if (parentProfile) {
    const parentResolved = resolveProfileChain(parentProfile);
    return {
      fieldOverrides: mergeFieldOverrides(parentResolved.fieldOverrides, profile.fieldOverrides),
      spec: parentResolved.spec,
    };
  }

  // Parent must be a JSON Spec
  const parentSpec = getJsonSpec(profile.extends);
  return {
    fieldOverrides: profile.fieldOverrides,
    spec: parentSpec,
  };
}

// =============================================================================
// ResolvedSpec Construction
// =============================================================================

/**
 * Build a ResolvedSpec from a Spec and optional Profile.
 */
function buildResolvedSpec(
  spec: Spec,
  profile?: Profile,
  mergedOverrides?: Record<string, FieldOverride>,
): ResolvedSpec {
  // Convert SpecFields → ResolvedFields (drops obligations)
  const fields: Record<string, ResolvedField> = {};
  for (const [name, specField] of Object.entries(spec.normalizedFields)) {
    fields[name] = toResolvedField(specField);
  }

  return {
    id: profile?.id ?? spec.id,
    name: profile?.name ?? spec.name,
    spec: spec.id,
    profile: profile?.id,
    fieldOverrides: mergedOverrides ?? profile?.fieldOverrides ?? {},
    fields,
    specFields: spec.normalizedFields,
    rawFields: spec.rawFields,
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get a validation profile by ID with inheritance resolution.
 *
 * Returns a ResolvedSpec that combines the base Spec with any Profile overlays.
 * Handles both TypeScript profiles and JSON specs.
 *
 * Resolution order:
 * 1. Check TypeScript profile registry → resolve inheritance → build ResolvedSpec
 * 2. Check JSON spec registry → build ResolvedSpec (no profile)
 */
export function getValidationProfile(profileId: string): ResolvedSpec | undefined {
  // Try TypeScript profile registry first
  const tsProfile = PROFILE_REGISTRY[profileId];
  if (tsProfile) {
    const { fieldOverrides, spec } = resolveProfileChain(tsProfile);
    if (spec) {
      return buildResolvedSpec(spec, tsProfile, fieldOverrides);
    }
    // Profile with no resolvable spec (shouldn't normally happen)
    return {
      id: tsProfile.id,
      name: tsProfile.name,
      spec: tsProfile.extends ?? tsProfile.id,
      profile: tsProfile.id,
      fieldOverrides,
      fields: {},
      specFields: {},
      rawFields: undefined,
    };
  }

  // Fall back to JSON spec
  const jsonSpec = getJsonSpec(profileId);
  if (!jsonSpec) return undefined;
  return buildResolvedSpec(jsonSpec);
}

/**
 * Resolve a validation profile using standard + class combination.
 *
 * Resolution order:
 * 1. Try `"${standard}-${dwcClass}"` in TypeScript registry (e.g., "obis-event")
 * 2. Fall back to base JSON profile using capitalized class key (e.g., "Event")
 *
 * This allows `standard: "obis"` + `class: "Event"` to automatically load
 * the OBIS-Event TypeScript profile with its field overrides.
 */
export function resolveProfile(
  standard: string | undefined,
  dwcClass: string,
): ResolvedSpec | undefined {
  if (standard) {
    const compositeKey = `${standard}-${dwcClass.toLowerCase()}`;
    const tsProfile = getValidationProfile(compositeKey);
    if (tsProfile) return tsProfile;
  }

  // Fall back to base profile using class key directly (PascalCase)
  return getValidationProfile(dwcClass);
}
