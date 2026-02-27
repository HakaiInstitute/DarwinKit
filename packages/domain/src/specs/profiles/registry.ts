import { join } from "@std/path";
import type {
  FieldOverride,
  Profile,
  ProfileRegistry,
  RawField,
  ResolvedSpec,
  Spec,
  TransformField,
} from "../../schemas/spec-types.ts";
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

export const PROFILE_REGISTRY: Readonly<ProfileRegistry> = {
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

interface NormalizeResult {
  spec: Spec;
  warnings: string[];
}

function normalizeJsonToSpec(jsonSpec: unknown): NormalizeResult {
  if (typeof jsonSpec !== "object" || jsonSpec === null) {
    throw new Error("Invalid JSON profile: expected object");
  }

  const spec = jsonSpec as Record<string, unknown>;

  const specFields: Record<string, SpecField> = {};
  const rawFields: Record<string, TransformField> = {};
  const warnings: string[] = [];

  if (
    "fields" in spec &&
    typeof spec.fields === "object" &&
    spec.fields !== null
  ) {
    for (const [fieldName, fieldValue] of Object.entries(spec.fields)) {
      try {
        const result = normalizeField(fieldValue as RawField);
        specFields[fieldName] = result.field;
        if (result.warnings.length > 0) {
          warnings.push(
            `Warnings normalizing field "${fieldName}": ${result.warnings.join(", ")}`,
          );
        }
      } catch (e) {
        warnings.push(
          `Failed to normalize field "${fieldName}": ${e instanceof Error ? e.message : String(e)}`,
        );
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

  const id = spec.id ?? spec.name;
  if (typeof id !== "string") {
    throw new Error("JSON spec missing both 'id' and 'name'");
  }

  return {
    spec: {
      id,
      name: (spec.name ?? id) as string,
      description: spec.description as string | undefined,
      specFields,
      rawFields: Object.keys(rawFields).length > 0 ? rawFields : undefined,
    },
    warnings,
  };
}

export function getSpecNames(): string[] {
  return Object.keys(loadDwcSchema());
}

function getJsonSpec(specId: string): NormalizeResult | undefined {
  const rawJsonSpec = loadDwcSchema()[specId];
  if (!rawJsonSpec) return undefined;
  return normalizeJsonToSpec(rawJsonSpec);
}

function resolveProfileChain(
  profile: Profile,
  visited: Set<string> = new Set(),
): {
  fieldOverrides: Record<string, FieldOverride>;
  spec: Spec | undefined;
  warnings: string[];
} {
  if (visited.has(profile.id)) {
    throw new Error(
      `Circular profile inheritance detected: ${[...visited].join(" -> ")} -> ${profile.id}`,
    );
  }
  visited.add(profile.id);

  if (!profile.extends) {
    return { fieldOverrides: profile.fieldOverrides, spec: undefined, warnings: [] };
  }

  const parentProfile = PROFILE_REGISTRY[profile.extends];
  if (parentProfile) {
    const parentResolved = resolveProfileChain(parentProfile, visited);
    return {
      fieldOverrides: mergeFieldOverrides(parentResolved.fieldOverrides, profile.fieldOverrides),
      spec: parentResolved.spec,
      warnings: parentResolved.warnings,
    };
  }

  const result = getJsonSpec(profile.extends);
  return {
    fieldOverrides: profile.fieldOverrides,
    spec: result?.spec,
    warnings: result?.warnings ?? [],
  };
}

function buildResolvedSpec(
  spec: Spec,
  profile?: Profile,
  mergedOverrides?: Record<string, FieldOverride>,
  warnings?: string[],
): ResolvedSpec {
  return {
    id: profile?.id ?? spec.id,
    name: spec.name,
    spec: spec.id,
    profile: profile?.id,
    fieldOverrides: mergedOverrides ?? profile?.fieldOverrides ?? {},
    specFields: spec.specFields,
    rawFields: spec.rawFields,
    ...(warnings && warnings.length > 0 ? { warnings } : {}),
  };
}

export function getResolvedSpec(specOrProfileId: string): ResolvedSpec | undefined {
  // Try TypeScript profile registry first
  const tsProfile = PROFILE_REGISTRY[specOrProfileId];
  if (tsProfile) {
    const { fieldOverrides, spec, warnings } = resolveProfileChain(tsProfile);
    if (spec) {
      return buildResolvedSpec(spec, tsProfile, fieldOverrides, warnings);
    }
    // Profile's inheritance chain did not resolve to a base JSON spec.
    // This indicates a misconfigured profile (e.g., extends a non-existent spec).
    throw new Error(
      `Profile "${tsProfile.id}" resolved without a base spec. ` +
        `Check that the "extends" chain terminates at a known JSON spec (e.g., "Event", "Occurrence").`,
    );
  }

  const result = getJsonSpec(specOrProfileId);
  if (!result) return undefined;
  return buildResolvedSpec(result.spec, undefined, undefined, result.warnings);
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
    const tsProfile = getResolvedSpec(compositeKey);
    if (tsProfile) return tsProfile;
  }

  return getResolvedSpec(dwcClass);
}
