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

import type { ResolvedSpec, WorkspaceFieldMapping } from "@dwkt/domain/schemas";
import type { Constraint, RequirementLevel, SpecField } from "@dwkt/domain/specs";
import {
  getPreset,
  mergeConstraints,
  mergeProfileConstraints,
  obligationForStandard,
  RequiredConstraint,
  REQUIREMENT_STRICTNESS,
} from "@dwkt/domain/specs";

// =============================================================================
// Helper Functions (moved from workspace-validator.ts)
// =============================================================================

/**
 * Resolve the active standard for obligation lookup.
 *
 * Takes the `standard` value from the workspace config.
 * Defaults to "obis" when not specified.
 */
export function resolveActiveStandard(
  standard: "obis" | "gbif" | undefined,
): "obis" | "gbif" {
  return standard ?? "obis";
}

/**
 * Derive the strictest requirement level from a field's constraint array.
 *
 * Picks the strictest RequiredConstraint's level.
 * This matches the validator's takeStrictest behavior so missing-field
 * detection uses the same effective level.
 */
export function deriveRequirementFromConstraints(
  constraints: readonly Constraint[] | undefined,
): RequirementLevel | undefined {
  if (!constraints) return undefined;
  const requiredConstraints = constraints.filter(
    (c): c is RequiredConstraint => c._tag === "required",
  );
  if (requiredConstraints.length === 0) return undefined;
  const strictest = requiredConstraints.reduce((a, b) =>
    (REQUIREMENT_STRICTNESS[a.level] ?? 0) >=
        (REQUIREMENT_STRICTNESS[b.level] ?? 0)
      ? a
      : b
  );
  return strictest.level;
}

/**
 * Compile a requirement level into a RequiredConstraint.
 *
 * Every requirement level produces a constraint — the level
 * value controls the severity (required → ERROR, recommended → WARNING,
 * optional → INFO).
 */
export function requirementToConstraint(
  requirement: RequirementLevel,
): Constraint {
  return new RequiredConstraint({
    level: requirement,
    allowEmpty: false,
    allowWhitespace: false,
  });
}

// =============================================================================
// Additive Constraint Merge
// =============================================================================

/**
 * Additive constraint merge: config constraints are appended to existing ones.
 * Multiple constraints of the same type are allowed — validators check all of
 * them, so the data must satisfy every constraint (natural intersection/tightening).
 *
 * **Exception:** RequiredConstraints that are weaker than an existing one are
 * filtered out (they would be meaningless since deriveRequirementFromConstraints
 * picks the strictest). A diagnostic is emitted when this happens.
 *
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
  diagnostics?: { fieldName: string; overlapping: string[]; filtered: string[] },
): Constraint[] {
  const existingTypes = new Set(existing.map((c) => c._tag));

  // Find the strictest existing RequiredConstraint (if any)
  const existingRequired = existing.filter(
    (c): c is RequiredConstraint => c._tag === "required",
  );
  const strictestExisting = existingRequired.length > 0
    ? existingRequired.reduce((a, b) =>
      (REQUIREMENT_STRICTNESS[a.level] ?? 0) >=
          (REQUIREMENT_STRICTNESS[b.level] ?? 0)
        ? a
        : b
    )
    : undefined;

  const kept: Constraint[] = [];
  for (const c of additions) {
    if (diagnostics && existingTypes.has(c._tag)) {
      diagnostics.overlapping.push(c._tag);
    }

    // Filter out RequiredConstraints weaker than the existing strictest
    if (c._tag === "required" && strictestExisting) {
      const rc = c as RequiredConstraint;
      if (
        (REQUIREMENT_STRICTNESS[rc.level] ?? 0) <
          (REQUIREMENT_STRICTNESS[strictestExisting.level] ?? 0)
      ) {
        if (diagnostics) {
          diagnostics.filtered.push(
            `Config '${rc.level}' requirement ignored — spec/profile requires '${strictestExisting.level}'`,
          );
        }
        continue;
      }
    }
    kept.push(c);
  }

  return [...existing, ...kept];
}

// =============================================================================
// Field Resolution Pipeline
// =============================================================================

/**
 * Diagnostic message from constraint resolution.
 * Produced when a config-level constraint overlaps with a
 * spec/profile constraint of the same type (both are kept),
 * or when a weaker RequiredConstraint is filtered out.
 */
export interface ResolutionDiagnostic {
  readonly fieldName: string;
  readonly overlappingTypes: readonly string[];
  readonly filteredMessages: readonly string[];
  readonly message: string;
}

/**
 * Resolve all field definitions for a dataset through the 3-tier merge pipeline.
 *
 * Pipeline:
 * 1. Start with spec specFields → derive obligation-based constraints
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
export function resolveSpecFields(
  schemaProfile: ResolvedSpec,
  activeStandard: "obis" | "gbif",
  configMappings: readonly WorkspaceFieldMapping[],
  diagnostics?: ResolutionDiagnostic[],
): Record<string, WorkspaceFieldMapping> {
  // --- Tier 1: Spec fields with obligation-derived constraints ---
  const result: Record<string, WorkspaceFieldMapping> = {};

  // Fields explicitly mapped by the user's config (needed for conditional obligations)
  const mappedFieldNames = new Set(configMappings.map((m) => m.targetName));

  for (const [fieldName, field] of Object.entries(schemaProfile.specFields || {})) {
    // Start with the spec's own constraints
    let constraints: Constraint[] = [...(field.constraints ?? [])];

    // Add obligation-derived constraint
    const obligationResult = obligationForStandard(field, activeStandard);
    if (obligationResult?.requirement) {
      // Obligation → RequiredConstraint merged via replacement (spec-level, trusted)
      constraints = mergeConstraints(constraints, [
        new RequiredConstraint({
          level: obligationResult.requirement,
          allowEmpty: false,
          allowWhitespace: false,
        }),
      ]);
    } else if (
      obligationResult?.obligation === "required (if exists)" &&
      mappedFieldNames.has(fieldName)
    ) {
      // "Required (if exists)" — the field is not required to be in the dataset,
      // but when the user has mapped it, empty values are likely an error.
      // Emit a WARNING-level constraint with a descriptive message so users
      // can verify the blanks are intentional.
      const label = field.label ?? fieldName;
      constraints = mergeConstraints(constraints, [
        new RequiredConstraint({
          level: "recommended",
          allowEmpty: false,
          allowWhitespace: false,
          message: `"${label}" is included in your dataset and is required when applicable. ` +
            `Empty values will be flagged — verify that blanks are intentional ` +
            `(e.g. rows where no ${label.toLowerCase()} applies).`,
        }),
      ]);
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

      // Merge profile override constraints (replacement for values, strictest-wins for required)
      let constraints = existing?.constraints ?? [];
      if (override.constraints) {
        constraints = mergeProfileConstraints(constraints, override.constraints);
      }

      // Profile requirement → constraint (strictest-wins for required)
      if (override.requirement) {
        constraints = mergeProfileConstraints(constraints, [
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
      ? {
        fieldName: configMapping.targetName,
        overlapping: [] as string[],
        filtered: [] as string[],
      }
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

    // Record diagnostics for overlapping constraint types and filtered constraints
    if (tracker && (tracker.overlapping.length > 0 || tracker.filtered.length > 0)) {
      const unique = [...new Set(tracker.overlapping)];
      const parts: string[] = [];
      if (unique.length > 0) {
        parts.push(
          `Config adds additional '${
            unique.join("', '")
          }' constraint(s) for field '${configMapping.targetName}' — data must satisfy both the spec/profile constraint and the config constraint`,
        );
      }
      for (const msg of tracker.filtered) {
        parts.push(`Field '${configMapping.targetName}': ${msg}`);
      }
      diagnostics!.push({
        fieldName: configMapping.targetName,
        overlappingTypes: unique,
        filteredMessages: tracker.filtered,
        message: parts.join(". "),
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
 * Build a SpecField for validation by combining base field metadata
 * (name, label, data type) with the fully-resolved constraints from
 * resolveSpecFields().
 *
 * The resolved constraints already include all spec, profile, and config
 * constraints — this function simply applies them to the base definition.
 */
export function withResolvedConstraints(
  baseField: SpecField,
  resolvedMapping: WorkspaceFieldMapping | undefined,
): SpecField {
  if (!resolvedMapping?.constraints) {
    return baseField;
  }
  return {
    ...baseField,
    constraints: resolvedMapping.constraints,
  };
}
