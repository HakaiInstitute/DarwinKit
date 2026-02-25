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

export const PROFILE_REGISTRY: ProfileRegistry = {
  "obis": OBIS_BASE_PROFILE,
  "obis-event": OBIS_EVENT_PROFILE,
} as const;

function mergeFieldOverrides(
  parent: Record<string, FieldOverride>,
  child: Record<string, FieldOverride>,
): Record<string, FieldOverride> {
  const merged: Record<string, FieldOverride> = { ...parent };

  for (const [fieldName, childOverride] of Object.entries(child)) {
    const parentOverride = merged[fieldName];

    if (!parentOverride) {
      merged[fieldName] = childOverride;
    } else {
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

function normalizeJsonToSpec(jsonProfile: unknown): Spec {
  if (typeof jsonProfile !== "object" || jsonProfile === null) {
    throw new Error("Invalid JSON profile: expected object");
  }

  const profile = jsonProfile as Record<string, unknown>;

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

function getJsonSpec(specId: string): Spec | undefined {
  const rawJsonProfile = loadDwcSchema()[specId];
  if (!rawJsonProfile) return undefined;
  return normalizeJsonToSpec(rawJsonProfile);
}

export function getProfile(profileId: string): Profile | undefined {
  return PROFILE_REGISTRY[profileId];
}

function resolveProfileChain(profile: Profile): {
  fieldOverrides: Record<string, FieldOverride>;
  spec: Spec | undefined;
} {
  if (!profile.extends) {
    return { fieldOverrides: profile.fieldOverrides, spec: undefined };
  }

  const parentProfile = PROFILE_REGISTRY[profile.extends];
  if (parentProfile) {
    const parentResolved = resolveProfileChain(parentProfile);
    return {
      fieldOverrides: mergeFieldOverrides(parentResolved.fieldOverrides, profile.fieldOverrides),
      spec: parentResolved.spec,
    };
  }

  const parentSpec = getJsonSpec(profile.extends);
  return {
    fieldOverrides: profile.fieldOverrides,
    spec: parentSpec,
  };
}

function buildResolvedSpec(
  spec: Spec,
  profile?: Profile,
  mergedOverrides?: Record<string, FieldOverride>,
): ResolvedSpec {
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

export function getValidationProfile(profileId: string): ResolvedSpec | undefined {
  // Try TypeScript profile registry first
  const tsProfile = PROFILE_REGISTRY[profileId];
  if (tsProfile) {
    const { fieldOverrides, spec } = resolveProfileChain(tsProfile);
    if (spec) {
      return buildResolvedSpec(spec, tsProfile, fieldOverrides);
    }
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

  return getValidationProfile(dwcClass);
}
