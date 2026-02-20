/**
 * Typed Constraint System
 *
 * Defines a discriminated union of constraint types for field validation.
 * Each constraint type has its own typed parameters, replacing the flat
 * "god bag" ValidatorParams approach.
 *
 * "Constraint" is the config data (what to check), "validator" is the
 * runtime function (how to check it). This file defines the constraint
 * schemas, types, and a registry for programmatic discovery.
 *
 * @module specs/constraints
 */

import * as S from "effect/Schema";

// =============================================================================
// Requirement Level (shared infrastructure, moved from validators.ts)
// =============================================================================

/**
 * Requirement levels determine how strictly constraints are applied
 */
export const RequirementLevel: S.Literal<[
  "required",
  "recommended",
  "optional",
]> = S.Literal(
  "required",
  "recommended",
  "optional",
);

export type RequirementLevel = S.Schema.Type<typeof RequirementLevel>;

/** Strictness ordering for requirement levels (higher = stricter). */
export const REQUIREMENT_STRICTNESS: Record<RequirementLevel, number> = {
  required: 2,
  recommended: 1,
  optional: 0,
};

// =============================================================================
// Field Data Types (for registry discoverability)
// =============================================================================

export const FieldDataType = S.Literal(
  "string",
  "number",
  "integer",
  "date",
  "boolean",
  "uri",
  "identifier",
  "coordinate",
);

export type FieldDataType = S.Schema.Type<typeof FieldDataType>;

// =============================================================================
// Individual Constraint Schemas
// =============================================================================

/**
 * Range constraint - validates numeric values within min/max bounds
 */
export const RangeConstraint = S.Struct({
  type: S.Literal("range"),
  min: S.optional(S.Number),
  max: S.optional(S.Number),
  inclusive: S.optionalWith(S.Boolean, { default: () => true }),
  message: S.optional(S.String),
});

export type RangeConstraint = S.Schema.Type<typeof RangeConstraint>;

/**
 * Required constraint - field must have a non-null/non-empty value
 */
export const RequiredConstraint = S.Struct({
  type: S.Literal("required"),
  allowEmpty: S.optionalWith(S.Boolean, { default: () => false }),
  allowWhitespace: S.optionalWith(S.Boolean, { default: () => false }),
  requirement: RequirementLevel,
  message: S.optional(S.String),
});

export type RequiredConstraint = S.Schema.Type<typeof RequiredConstraint>;

/**
 * Unique constraint - field value must be unique within the dataset
 */
export const UniqueConstraint = S.Struct({
  type: S.Literal("unique"),
  message: S.optional(S.String),
});

export type UniqueConstraint = S.Schema.Type<typeof UniqueConstraint>;

/**
 * Pattern constraint - field value must match a regular expression
 */
export const PatternConstraint = S.Struct({
  type: S.Literal("pattern"),
  pattern: S.String,
  flags: S.optional(S.String),
  message: S.optional(S.String),
});

export type PatternConstraint = S.Schema.Type<typeof PatternConstraint>;

/**
 * Length constraint - string field must meet length requirements
 */
export const LengthConstraint = S.Struct({
  type: S.Literal("length"),
  minLength: S.optional(S.Number),
  maxLength: S.optional(S.Number),
  message: S.optional(S.String),
});

export type LengthConstraint = S.Schema.Type<typeof LengthConstraint>;

/**
 * Format constraint - field must conform to a specific format
 */
export const FormatConstraint = S.Struct({
  type: S.Literal("format"),
  format: S.Literal(
    "email",
    "url",
    "uuid",
    "iso8601",
    "decimal-degrees",
    "integer",
  ),
  message: S.optional(S.String),
});

export type FormatConstraint = S.Schema.Type<typeof FormatConstraint>;

// =============================================================================
// Discriminated Union
// =============================================================================

/**
 * The discriminated union of all constraint types.
 * Discriminated by the `type` field - YAML users write `type: range` naturally.
 */
export const Constraint = S.Union(
  RangeConstraint,
  RequiredConstraint,
  UniqueConstraint,
  PatternConstraint,
  LengthConstraint,
  FormatConstraint,
);

export type Constraint = S.Schema.Type<typeof Constraint>;

// =============================================================================
// Obligation System
// =============================================================================

/**
 * Obligation levels from biodiversity data standards (OBIS, GBIF).
 *
 * These represent the requirement level for a field within a specific standard,
 * directly matching the values used in dwcSchema.json.
 */
export const Obligation = S.Literal(
  "required",
  "strongly recommended",
  "recommended",
  "optional",
  "required (if exists)",
  "optional (required for imaging data)",
);

export type Obligation = S.Schema.Type<typeof Obligation>;

/**
 * Per-standard obligations map.
 *
 * Each key represents a biodiversity data standard and its value is the
 * obligation level for the field within that standard.
 */
export const ObligationsMap = S.Struct({
  obis: S.optional(Obligation),
  gbif: S.optional(Obligation),
});

export type ObligationsMap = S.Schema.Type<typeof ObligationsMap>;

// =============================================================================
// Merge & Utility Functions
// =============================================================================

/**
 * Map an Obligation (external standard metadata) to a RequirementLevel for constraints.
 *
 * **Terminology chain:**
 * - **Obligation**: External metadata from biodiversity standards (dwcSchema.json). Per-standard, per-field.
 * - **RequirementLevel**: Per-constraint severity. The single mechanism for all validation strictness.
 *
 * Returns undefined for obligations that do not unconditionally generate a required constraint
 * ("optional", "optional (required for imaging data)", "required (if exists)").
 *
 * Note: "required (if exists)" is handled separately in resolveFieldDefinitions() —
 * it emits a WARNING-level constraint only when the field is actually mapped in the dataset.
 */
export function obligationToRequirement(
  obligation: Obligation,
): RequirementLevel | undefined {
  switch (obligation) {
    case "required":
      return "required";
    case "strongly recommended":
      return "recommended";
    case "recommended":
      return "optional";
    case "optional":
    case "optional (required for imaging data)":
    case "required (if exists)":
      return undefined;
  }
}

/**
 * Merge parent and child constraint arrays.
 *
 * For each constraint type present in child, ALL child constraints of that type
 * replace ALL parent constraints of that type (batch replacement).
 * Non-overlapping types from both arrays are preserved.
 */
export function mergeConstraints(
  parent: readonly Constraint[],
  child: readonly Constraint[],
): Constraint[] {
  // Collect the set of constraint types the child defines
  const childTypes = new Set(child.map((c) => c.type));

  // Keep parent constraints whose type is NOT overridden by child
  const kept = parent.filter((c) => !childTypes.has(c.type));

  // Append all child constraints (preserving duplicates within child)
  return [...kept, ...child];
}

/**
 * Merge constraints for profile overrides (Tier 2).
 *
 * For RequiredConstraints: uses strictest-wins semantics — a profile
 * cannot weaken a spec's requirement level.
 * For all other constraint types: uses replacement semantics (same as mergeConstraints).
 */
export function mergeProfileConstraints(
  parent: readonly Constraint[],
  child: readonly Constraint[],
): Constraint[] {
  const childTypes = new Set(child.map((c) => c.type));

  // Separate required constraints for strictest-wins handling
  const parentRequired = parent.filter(
    (c): c is Constraint & { type: "required" } => c.type === "required",
  );
  const childRequired = child.filter(
    (c): c is Constraint & { type: "required" } => c.type === "required",
  );

  // For non-required types: standard replacement semantics
  const keptNonRequired = parent.filter(
    (c) => c.type !== "required" && !childTypes.has(c.type),
  );
  const childNonRequired = child.filter((c) => c.type !== "required");

  // For required type: pick strictest from either side
  let resolvedRequired: Constraint[] = [];
  if (childRequired.length > 0 || parentRequired.length > 0) {
    const allRequired = [...parentRequired, ...childRequired];
    const strictest = allRequired.reduce((a, b) =>
      (REQUIREMENT_STRICTNESS[a.requirement] ?? 0) >=
          (REQUIREMENT_STRICTNESS[b.requirement] ?? 0)
        ? a
        : b
    );
    resolvedRequired = [strictest];
  }

  return [...keptNonRequired, ...childNonRequired, ...resolvedRequired];
}
