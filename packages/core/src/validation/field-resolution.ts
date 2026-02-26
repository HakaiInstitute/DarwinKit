/**
 * Field Resolution
 *
 * Pure functions for resolving field definitions through a 3-tier merge pipeline:
 *   spec → profile → config
 *
 * **Merge semantics:**
 * - Spec → Profile: `mergeProfileConstraints()` — strictest-wins for required, replacement for others
 * - Profile → Config: `addConstraints()` — additive only (config cannot weaken spec/profile)
 *
 * @module validation/field-resolution
 */

import {
  type DatasetConfig,
  KNOWN_VARIANTS,
  type ResolvedSpec,
  type ResolvedStandard,
  type WorkspaceFieldMapping,
} from "@dwkt/domain/schemas";
import type { Constraint, RequirementLevel, SpecField } from "@dwkt/domain/specs";
import {
  getPreset,
  mergeProfileConstraints,
  obligationForStandard,
  overrideConstraints,
  RequiredConstraint,
  REQUIREMENT_STRICTNESS,
  resolveProfile,
  strictestRequired,
} from "@dwkt/domain/specs";

export interface ActiveStandardResult {
  readonly standard: "obis" | "gbif";
  readonly warning?: string;
}

export function resolveActiveStandard(
  standard: ResolvedStandard | undefined,
): ActiveStandardResult {
  const variant = standard?.variant;
  if (variant && KNOWN_VARIANTS.has(variant)) return { standard: variant as "obis" | "gbif" };
  if (variant) {
    return {
      standard: "obis",
      warning: `Unknown standard variant "${variant}" — defaulting to "obis". Known variants: ${
        [...KNOWN_VARIANTS].join(", ")
      }.`,
    };
  }
  return {
    standard: "obis",
    warning: `No standard variant specified — defaulting to "obis".`,
  };
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
  return strictestRequired(requiredConstraints)?.level;
}

export function requirementToConstraint(
  requirement: RequirementLevel,
): Constraint {
  return new RequiredConstraint({
    level: requirement,
    allowEmpty: false,
    allowWhitespace: false,
  });
}

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

  const existingRequired = existing.filter(
    (c): c is RequiredConstraint => c._tag === "required",
  );
  const strictestExisting = strictestRequired(existingRequired);

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
 * 2. Apply profile fieldOverrides (requirement → constraint, constraints via mergeProfileConstraints)
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
  resolvedSpec: ResolvedSpec,
  activeStandard: "obis" | "gbif",
  configMappings: readonly WorkspaceFieldMapping[],
  diagnostics?: ResolutionDiagnostic[],
): Record<string, WorkspaceFieldMapping> {
  const result: Record<string, WorkspaceFieldMapping> = {};
  const mappedFieldNames = new Set(configMappings.map((m) => m.targetName));

  // Tier 1 uses overrideConstraints — obligation-derived constraints override any
  // same-type constraints already on the spec field. This is safe because there is
  // no prior layer to protect. Tier 2 uses mergeProfileConstraints which applies
  // strictest-wins for required constraints, preventing profiles from weakening
  // spec obligations.
  for (const [fieldName, field] of Object.entries(resolvedSpec.specFields || {})) {
    let constraints: Constraint[] = [...(field.constraints ?? [])];

    const obligationResult = obligationForStandard(field, activeStandard);
    if (obligationResult?.requirement) {
      constraints = overrideConstraints(constraints, [
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
      constraints = overrideConstraints(constraints, [
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

  if (resolvedSpec.fieldOverrides) {
    for (const [fieldName, override] of Object.entries(resolvedSpec.fieldOverrides)) {
      const existing = result[fieldName];
      let constraints = existing?.constraints ?? [];
      if (override.constraints) {
        constraints = mergeProfileConstraints(constraints, override.constraints);
      }

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

  for (const configMapping of configMappings) {
    const existing = result[configMapping.targetName];
    let constraints = existing?.constraints ?? [];

    const tracker = diagnostics
      ? {
        fieldName: configMapping.targetName,
        overlapping: [] as string[],
        filtered: [] as string[],
      }
      : undefined;

    if (configMapping.preset) {
      const presetConstraints = getPreset(configMapping.preset);
      if (presetConstraints) {
        constraints = addConstraints(constraints, presetConstraints, tracker);
      }
    }

    if (configMapping.constraints) {
      constraints = addConstraints(constraints, configMapping.constraints, tracker);
    }

    if (configMapping.requirement) {
      constraints = addConstraints(
        constraints,
        [requirementToConstraint(configMapping.requirement)],
        tracker,
      );
    }

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
 * Combine base field metadata with fully-resolved constraints from resolveSpecFields().
 */
export function applyResolvedConstraints(
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

/**
 * Pre-resolved field data for a single dataset.
 *
 * - `all`: Full resolution of all spec + profile + config fields. Used by
 *   validators for missing-field detection and constraint-driven validation.
 * - `mapped`: Subset filtered to fields with explicit config mappings. Used
 *   by importSchema for NOT NULL column generation — unmapped spec fields
 *   would cause spurious NOT NULL failures since no data is inserted for them.
 */
export interface ResolvedFieldsEntry {
  readonly all: Record<string, WorkspaceFieldMapping>;
  readonly mapped: Record<string, WorkspaceFieldMapping>;
  readonly resolvedSpec: ResolvedSpec;
}

/**
 * Resolve constraints for all datasets in a single pass.
 *
 * This is the single source of truth for constraint resolution — both
 * schema creation (importSchema) and validation (validateDataset) consume
 * the same pre-resolved fields, eliminating duplicated resolution logic
 * and preventing divergence between DDL and validation.
 */
export function resolveFieldsForDatasets(
  datasets: readonly DatasetConfig[],
  standard: ResolvedStandard,
  diagnosticsPerDataset?: Map<string, ResolutionDiagnostic[]>,
): Map<string, ResolvedFieldsEntry> {
  const { standard: activeStandard } = resolveActiveStandard(standard);
  const result = new Map<string, ResolvedFieldsEntry>();

  for (const dataset of datasets) {
    const datasetProfile = resolveProfile(standard.variant, dataset.class);
    if (!datasetProfile) continue;

    const configMappings = dataset.fieldMappings || [];
    const diagnostics = diagnosticsPerDataset?.get(dataset.name);
    const all = resolveSpecFields(datasetProfile, activeStandard, configMappings, diagnostics);

    const mappedNames = new Set(configMappings.map((m) => m.targetName));
    const mapped: Record<string, WorkspaceFieldMapping> = {};
    for (const [name, field] of Object.entries(all)) {
      if (mappedNames.has(name)) mapped[name] = field;
    }

    result.set(dataset.name, { all, mapped, resolvedSpec: datasetProfile });
  }

  return result;
}
