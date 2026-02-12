/**
 * Field Resolution
 *
 * Pure functions for resolving field definitions through a 3-tier merge pipeline:
 *   spec → profile → config
 *
 * **Merge semantics:**
 * - Spec → Profile: `mergeConstraints()` — full replacement by type (trusted, domain-expert curated)
 * - Profile → Config: `addConstraints()` — additive only (config cannot weaken spec/profile)
 *
 * @module validation/field-resolution
 */

import type { ValidationProfile, WorkspaceFieldMapping } from "@dwkt/domain/schemas";
import { FieldRequirementLevel } from "@dwkt/domain/schemas";
import type { Constraint, EnforcementLevel, FieldDefinition } from "@dwkt/domain/specs";
import { getPreset, mergeConstraints, obligationToEnforcement } from "@dwkt/domain/specs";

// =============================================================================
// Helper Functions (moved from workspace-validator.ts)
// =============================================================================

/**
 * Resolve the active standard for a profile.
 *
 * TypeScript profiles (obis, obis-event) have an explicit `targetSchema`.
 * JSON base profiles (Event, Occurrence, etc.) have `targetSchema: undefined`
 * since they come from dwcSchema.json. Default to "obis" for these since
 * the JSON schema contains OBIS requirement metadata.
 */
export function resolveActiveStandard(
  profile: ValidationProfile | undefined,
): "obis" | "gbif" | "custom" {
  if (profile?.targetSchema) return profile.targetSchema;
  return "obis";
}

/**
 * Get the obligation-derived enforcement level for a field, given the active standard.
 */
export function obligationForStandard(
  field: FieldDefinition,
  standard: "obis" | "gbif" | "custom",
): EnforcementLevel | undefined {
  if (!field.obligations) return undefined;
  const obligation = standard === "obis"
    ? field.obligations.obis
    : standard === "gbif"
    ? field.obligations.gbif
    : undefined;
  if (!obligation) return undefined;
  return obligationToEnforcement(obligation);
}

/**
 * Derive FieldRequirementLevel from a field's constraint array.
 *
 * Reads the last RequiredConstraint and maps its enforcement to FieldRequirementLevel.
 * This is the single derivation path for missing-field detection.
 */
export function deriveRequirementFromConstraints(
  constraints: readonly Constraint[] | undefined,
): FieldRequirementLevel | undefined {
  if (!constraints) return undefined;
  const requiredConstraints = constraints.filter((c) => c.type === "required");
  if (requiredConstraints.length === 0) return undefined;
  const last = requiredConstraints[requiredConstraints.length - 1];
  switch (last.enforcement) {
    case "required":
      return FieldRequirementLevel.Required;
    case "recommended":
      return FieldRequirementLevel.StronglyRecommended;
    case "optional":
      return undefined; // optional required = field not needed
  }
}

/**
 * Compile a requirement string into a RequiredConstraint.
 *
 * Only Required and StronglyRecommended produce constraints.
 * Recommended, Optional, and RequiredIfExists return undefined
 * to avoid phantom constraints.
 */
export function requirementToConstraint(
  requirement: string,
): Constraint | undefined {
  switch (requirement) {
    case FieldRequirementLevel.Required:
      return {
        type: "required",
        enforcement: "required",
        allowEmpty: false,
        allowWhitespace: false,
      };
    case FieldRequirementLevel.StronglyRecommended:
      return {
        type: "required",
        enforcement: "recommended",
        allowEmpty: false,
        allowWhitespace: false,
      };
    case FieldRequirementLevel.Recommended:
    case FieldRequirementLevel.Optional:
    case FieldRequirementLevel.RequiredIfExists:
      return undefined;
    default:
      return undefined;
  }
}

// =============================================================================
// Additive Constraint Merge
// =============================================================================

/**
 * Additive-only merge: config can add constraint types not already present.
 * Constraint types already in `existing` are preserved; `additions` with
 * conflicting types are silently ignored.
 */
export function addConstraints(
  existing: readonly Constraint[],
  additions: readonly Constraint[],
): Constraint[] {
  const existingTypes = new Set(existing.map((c) => c.type));
  const newConstraints = additions.filter((c) => !existingTypes.has(c.type));
  return [...existing, ...newConstraints];
}

// =============================================================================
// Field Resolution Pipeline
// =============================================================================

/**
 * Resolve all field definitions for a dataset through the 3-tier merge pipeline.
 *
 * Pipeline:
 * 1. Start with spec normalizedFields → derive obligation-based constraints
 * 2. Apply profile fieldOverrides (requirement → constraint, constraints via mergeConstraints)
 * 3. Apply config fieldMappings (preset, requirement, constraints via addConstraints)
 *
 * Returns a map of targetName → WorkspaceFieldMapping with fully resolved constraints.
 * The constraints on each mapping are the final merged result from all three tiers.
 */
export function resolveFieldDefinitions(
  schemaProfile: ValidationProfile,
  activeStandard: "obis" | "gbif" | "custom",
  configMappings: readonly WorkspaceFieldMapping[],
): Record<string, WorkspaceFieldMapping> {
  // --- Tier 1: Spec fields with obligation-derived constraints ---
  const result: Record<string, WorkspaceFieldMapping> = {};

  for (const [fieldName, field] of Object.entries(schemaProfile.normalizedFields || {})) {
    // Start with the spec's own constraints
    let constraints: Constraint[] = [...(field.constraints ?? [])];

    // Add obligation-derived constraint
    const enforcement = obligationForStandard(field, activeStandard);
    if (enforcement) {
      // Obligation → RequiredConstraint merged via replacement (spec-level, trusted)
      constraints = mergeConstraints(constraints, [{
        type: "required" as const,
        enforcement,
        allowEmpty: false,
        allowWhitespace: false,
      }]);
    }

    result[fieldName] = {
      originName: fieldName,
      targetName: fieldName,
      constraints: constraints.length > 0 ? constraints : undefined,
    };
  }

  // --- Tier 2: Profile fieldOverrides (trusted, full replacement semantics) ---
  if (schemaProfile.fieldOverrides) {
    for (const [fieldName, override] of Object.entries(schemaProfile.fieldOverrides)) {
      const existing = result[fieldName];

      // Merge profile override constraints (replacement semantics)
      let constraints = existing?.constraints ?? [];
      if (override.constraints) {
        constraints = mergeConstraints(constraints, override.constraints);
      }

      // Profile requirement → constraint (replacement semantics, profile-level)
      if (override.requirement) {
        const reqConstraint = requirementToConstraint(override.requirement);
        if (reqConstraint) {
          constraints = mergeConstraints(constraints, [reqConstraint]);
        }
      }

      if (existing) {
        result[fieldName] = {
          ...existing,
          constraints: constraints.length > 0 ? constraints : undefined,
        };
      } else {
        // Field only exists in overrides (not in base schema)
        result[fieldName] = {
          originName: fieldName,
          targetName: fieldName,
          constraints: constraints.length > 0 ? constraints : undefined,
        };
      }
    }
  }

  // --- Tier 3: Config fieldMappings (additive-only constraints) ---
  for (const configMapping of configMappings) {
    const existing = result[configMapping.targetName];
    let constraints = existing?.constraints ?? [];

    // Resolve preset to constraints and add (additive-only)
    if (configMapping.preset) {
      const presetConstraints = getPreset(configMapping.preset);
      if (presetConstraints) {
        constraints = addConstraints(constraints, presetConstraints);
      }
    }

    // Config explicit constraints (additive-only)
    if (configMapping.constraints) {
      constraints = addConstraints(constraints, configMapping.constraints);
    }

    // Config requirement → constraint (additive-only)
    if (configMapping.requirement) {
      const reqConstraint = requirementToConstraint(configMapping.requirement);
      if (reqConstraint) {
        constraints = addConstraints(constraints, [reqConstraint]);
      }
    }

    // Apply config's originName/targetName, preserve resolved constraints
    result[configMapping.targetName] = {
      ...(existing ?? {}),
      originName: configMapping.originName,
      targetName: configMapping.targetName,
      constraints: constraints.length > 0 ? constraints : undefined,
    };
  }

  return result;
}

/**
 * Build a FieldDefinition for validation by applying resolved constraints
 * to the base field definition from the spec.
 *
 * Replaces the old `mergeFieldDefinition()` function. Since all constraint
 * resolution is now done in `resolveFieldDefinitions()`, this simply applies
 * the resolved constraints to the base FieldDefinition.
 */
export function applyResolvedConstraints(
  baseField: FieldDefinition,
  resolvedMapping: WorkspaceFieldMapping | undefined,
): FieldDefinition {
  if (!resolvedMapping?.constraints) {
    return baseField;
  }
  return {
    ...baseField,
    constraints: resolvedMapping.constraints,
  };
}
