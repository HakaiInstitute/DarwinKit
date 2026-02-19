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
import type { Constraint, EnforcementLevel, FieldDefinition } from "@dwkt/domain/specs";
import {
  ENFORCEMENT_STRICTNESS,
  getPreset,
  mergeConstraints,
  obligationForStandard,
} from "@dwkt/domain/specs";

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
 *
 * TODO: Revisit the "obis" default when GBIF profiles are actively used.
 * Users selecting a GBIF profile will need their own obligation metadata
 * to drive requirement resolution rather than falling back to OBIS.
 */
export function resolveActiveStandard(
  profile: ValidationProfile | undefined,
): "obis" | "gbif" | "custom" {
  if (profile?.targetSchema) return profile.targetSchema;
  return "obis";
}

/**
 * Derive the strictest enforcement level from a field's constraint array.
 *
 * Picks the strictest RequiredConstraint's enforcement level.
 * This matches the validator's takeStrictest behavior so missing-field
 * detection uses the same effective level.
 */
export function deriveEnforcementFromConstraints(
  constraints: readonly Constraint[] | undefined,
): EnforcementLevel | undefined {
  if (!constraints) return undefined;
  const requiredConstraints = constraints.filter((c) => c.type === "required");
  if (requiredConstraints.length === 0) return undefined;
  const strictest = requiredConstraints.reduce((a, b) =>
    (ENFORCEMENT_STRICTNESS[a.enforcement] ?? 0) >=
        (ENFORCEMENT_STRICTNESS[b.enforcement] ?? 0)
      ? a
      : b
  );
  return strictest.enforcement;
}

/**
 * Compile an enforcement level into a RequiredConstraint.
 *
 * Every enforcement level produces a constraint — the enforcement
 * value controls the severity (required → ERROR, recommended → WARNING,
 * optional → INFO).
 */
export function requirementToConstraint(
  requirement: EnforcementLevel,
): Constraint {
  return {
    type: "required",
    enforcement: requirement,
    allowEmpty: false,
    allowWhitespace: false,
  };
}

// =============================================================================
// Additive Constraint Merge
// =============================================================================

/**
 * Additive constraint merge: config constraints are appended to existing ones.
 * Multiple constraints of the same type are allowed — validators check all of
 * them, so the data must satisfy every constraint (natural intersection/tightening).
 * When `diagnostics` is provided, overlapping types are recorded as informational.
 *
 * **Known limitation:** No type-compatibility validation is performed. Config can
 * add constraints that don't make sense for the field's data type (e.g. `range` on
 * a string field). Validators will run and produce confusing-but-diagnosable errors.
 * This is acceptable because config authors are the data owners and FieldDataType
 * is not reliably present on all field definitions.
 */
export function addConstraints(
  existing: readonly Constraint[],
  additions: readonly Constraint[],
  diagnostics?: { fieldName: string; overlapping: string[] },
): Constraint[] {
  if (diagnostics) {
    const existingTypes = new Set(existing.map((c) => c.type));
    for (const c of additions) {
      if (existingTypes.has(c.type)) {
        diagnostics.overlapping.push(c.type);
      }
    }
  }
  return [...existing, ...additions];
}

// =============================================================================
// Field Resolution Pipeline
// =============================================================================

/**
 * Diagnostic message from constraint resolution.
 * Produced when a config-level constraint overlaps with a
 * spec/profile constraint of the same type (both are kept).
 */
export interface ResolutionDiagnostic {
  readonly fieldName: string;
  readonly overlappingTypes: readonly string[];
  readonly message: string;
}

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
 * Config constraints that share a type with spec/profile constraints are kept — validators
 * check all constraints of a given type, so data must satisfy every one (tightening).
 *
 * When `diagnostics` is provided, overlapping config constraint types are recorded.
 */
export function resolveFieldDefinitions(
  schemaProfile: ValidationProfile,
  activeStandard: "obis" | "gbif" | "custom",
  configMappings: readonly WorkspaceFieldMapping[],
  diagnostics?: ResolutionDiagnostic[],
): Record<string, WorkspaceFieldMapping> {
  // --- Tier 1: Spec fields with obligation-derived constraints ---
  const result: Record<string, WorkspaceFieldMapping> = {};

  // Fields explicitly mapped by the user's config (needed for conditional obligations)
  const mappedFieldNames = new Set(configMappings.map((m) => m.targetName));

  for (const [fieldName, field] of Object.entries(schemaProfile.normalizedFields || {})) {
    // Start with the spec's own constraints
    let constraints: Constraint[] = [...(field.constraints ?? [])];

    // Add obligation-derived constraint
    const obligationResult = obligationForStandard(field, activeStandard);
    if (obligationResult?.enforcement) {
      // Obligation → RequiredConstraint merged via replacement (spec-level, trusted)
      constraints = mergeConstraints(constraints, [{
        type: "required" as const,
        enforcement: obligationResult.enforcement,
        allowEmpty: false,
        allowWhitespace: false,
      }]);
    } else if (
      obligationResult?.obligation === "required (if exists)" &&
      mappedFieldNames.has(fieldName)
    ) {
      // "Required (if exists)" — the field is not required to be in the dataset,
      // but when the user has mapped it, empty values are likely an error.
      // Emit a WARNING-level constraint with a descriptive message so users
      // can verify the blanks are intentional.
      const label = field.label ?? fieldName;
      constraints = mergeConstraints(constraints, [{
        type: "required" as const,
        enforcement: "recommended" as const,
        allowEmpty: false,
        allowWhitespace: false,
        message: `"${label}" is included in your dataset and is required when applicable. ` +
          `Empty values will be flagged — verify that blanks are intentional ` +
          `(e.g. rows where no ${label.toLowerCase()} applies).`,
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
        constraints = mergeConstraints(constraints, [
          requirementToConstraint(override.requirement),
        ]);
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

    // Track overlapping constraint types when diagnostics are requested
    const tracker = diagnostics
      ? { fieldName: configMapping.targetName, overlapping: [] as string[] }
      : undefined;

    // Resolve preset to constraints and add
    if (configMapping.preset) {
      const presetConstraints = getPreset(configMapping.preset);
      if (presetConstraints) {
        constraints = addConstraints(constraints, presetConstraints, tracker);
      }
    }

    // Config explicit constraints
    if (configMapping.constraints) {
      constraints = addConstraints(constraints, configMapping.constraints, tracker);
    }

    // Config requirement → constraint
    if (configMapping.requirement) {
      constraints = addConstraints(
        constraints,
        [requirementToConstraint(configMapping.requirement)],
        tracker,
      );
    }

    // Record diagnostics for overlapping constraint types
    if (tracker && tracker.overlapping.length > 0) {
      const unique = [...new Set(tracker.overlapping)];
      diagnostics!.push({
        fieldName: configMapping.targetName,
        overlappingTypes: unique,
        message: `Config adds additional '${
          unique.join("', '")
        }' constraint(s) for field '${configMapping.targetName}' — data must satisfy both the spec/profile constraint and the config constraint`,
      });
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
