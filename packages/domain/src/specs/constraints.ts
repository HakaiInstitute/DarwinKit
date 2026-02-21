/**
 * Typed Constraint System
 *
 * Defines a discriminated union of constraint types for field validation.
 * Each constraint type uses Data.TaggedClass for structural equality and
 * immutability. The `_tag` field is the discriminator.
 *
 * "Constraint" is the config data (what to check), "validator" is the
 * runtime function (how to check it). This file defines the constraint
 * classes, types, and merge logic.
 *
 * @module specs/constraints
 */

import * as Data from "effect/Data";
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
// Constraint Classes (Data.TaggedClass)
// =============================================================================

/**
 * Range constraint - validates numeric values within min/max bounds
 */
export class RangeConstraint extends Data.TaggedClass("range")<{
  readonly min?: number;
  readonly max?: number;
  readonly inclusive?: boolean;
  readonly message?: string;
}> {}

/**
 * Required constraint - field must have a non-null/non-empty value
 */
export class RequiredConstraint extends Data.TaggedClass("required")<{
  readonly level: RequirementLevel;
  readonly allowEmpty?: boolean;
  readonly allowWhitespace?: boolean;
  readonly message?: string;
}> {}

/**
 * Unique constraint - field value must be unique within the dataset
 */
export class UniqueConstraint extends Data.TaggedClass("unique")<{
  readonly message?: string;
}> {}

/**
 * Pattern constraint - field value must match a regular expression
 */
export class PatternConstraint extends Data.TaggedClass("pattern")<{
  readonly pattern: string;
  readonly flags?: string;
  readonly message?: string;
}> {}

/**
 * Length constraint - string field must meet length requirements
 */
export class LengthConstraint extends Data.TaggedClass("length")<{
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly message?: string;
}> {}

/**
 * Format constraint - field must conform to a specific format
 */
export class FormatConstraint extends Data.TaggedClass("format")<{
  readonly format:
    | "email"
    | "url"
    | "uuid"
    | "iso8601"
    | "decimal-degrees"
    | "integer";
  readonly message?: string;
}> {}

// =============================================================================
// Discriminated Union
// =============================================================================

/**
 * The discriminated union of all constraint types.
 * Discriminated by the `_tag` field.
 */
export type Constraint =
  | RangeConstraint
  | RequiredConstraint
  | UniqueConstraint
  | PatternConstraint
  | LengthConstraint
  | FormatConstraint;

// =============================================================================
// Effect Schema for Constraint (decode/encode from YAML/JSON)
// =============================================================================

/**
 * Effect Schema that decodes YAML/JSON `{ type: "range", ... }` into
 * Data.TaggedClass instances. Maps `type` → `_tag` and `requirement` → `level`
 * at the parsing boundary.
 */
const RangeConstraintSchema = S.transform(
  S.Struct({
    type: S.Literal("range"),
    min: S.optional(S.Number),
    max: S.optional(S.Number),
    inclusive: S.optional(S.Boolean),
    message: S.optional(S.String),
  }),
  S.typeSchema(S.instanceOf(RangeConstraint)),
  {
    strict: true,
    decode: (from) =>
      new RangeConstraint({
        min: from.min,
        max: from.max,
        inclusive: from.inclusive ?? true,
        message: from.message,
      }),
    encode: (to) => ({
      type: "range" as const,
      min: to.min,
      max: to.max,
      inclusive: to.inclusive,
      message: to.message,
    }),
  },
);

const RequiredConstraintSchema = S.transform(
  S.Struct({
    type: S.Literal("required"),
    requirement: S.optional(RequirementLevel),
    level: S.optional(RequirementLevel),
    allowEmpty: S.optional(S.Boolean),
    allowWhitespace: S.optional(S.Boolean),
    message: S.optional(S.String),
  }),
  S.typeSchema(S.instanceOf(RequiredConstraint)),
  {
    strict: true,
    decode: (from) =>
      new RequiredConstraint({
        level: from.level ?? from.requirement ?? "required",
        allowEmpty: from.allowEmpty ?? false,
        allowWhitespace: from.allowWhitespace ?? false,
        message: from.message,
      }),
    encode: (to) => ({
      type: "required" as const,
      requirement: to.level,
      level: to.level,
      allowEmpty: to.allowEmpty,
      allowWhitespace: to.allowWhitespace,
      message: to.message,
    }),
  },
);

const UniqueConstraintSchema = S.transform(
  S.Struct({
    type: S.Literal("unique"),
    message: S.optional(S.String),
  }),
  S.typeSchema(S.instanceOf(UniqueConstraint)),
  {
    strict: true,
    decode: (from) => new UniqueConstraint({ message: from.message }),
    encode: (to) => ({ type: "unique" as const, message: to.message }),
  },
);

const PatternConstraintSchema = S.transform(
  S.Struct({
    type: S.Literal("pattern"),
    pattern: S.String,
    flags: S.optional(S.String),
    message: S.optional(S.String),
  }),
  S.typeSchema(S.instanceOf(PatternConstraint)),
  {
    strict: true,
    decode: (from) =>
      new PatternConstraint({
        pattern: from.pattern,
        flags: from.flags,
        message: from.message,
      }),
    encode: (to) => ({
      type: "pattern" as const,
      pattern: to.pattern,
      flags: to.flags,
      message: to.message,
    }),
  },
);

const LengthConstraintSchema = S.transform(
  S.Struct({
    type: S.Literal("length"),
    minLength: S.optional(S.Number),
    maxLength: S.optional(S.Number),
    message: S.optional(S.String),
  }),
  S.typeSchema(S.instanceOf(LengthConstraint)),
  {
    strict: true,
    decode: (from) =>
      new LengthConstraint({
        minLength: from.minLength,
        maxLength: from.maxLength,
        message: from.message,
      }),
    encode: (to) => ({
      type: "length" as const,
      minLength: to.minLength,
      maxLength: to.maxLength,
      message: to.message,
    }),
  },
);

const FormatConstraintSchema = S.transform(
  S.Struct({
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
  }),
  S.typeSchema(S.instanceOf(FormatConstraint)),
  {
    strict: true,
    decode: (from) =>
      new FormatConstraint({
        format: from.format,
        message: from.message,
      }),
    encode: (to) => ({
      type: "format" as const,
      format: to.format,
      message: to.message,
    }),
  },
);

/**
 * Effect Schema for the Constraint union.
 *
 * Decodes YAML/JSON with `type` discriminator into Data.TaggedClass instances.
 * Used at the config parsing boundary (workspace-config.ts, validation-profile.ts).
 */
export const ConstraintSchema = S.Union(
  RangeConstraintSchema,
  RequiredConstraintSchema,
  UniqueConstraintSchema,
  PatternConstraintSchema,
  LengthConstraintSchema,
  FormatConstraintSchema,
);

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
  const childTypes = new Set(child.map((c) => c._tag));

  // Keep parent constraints whose type is NOT overridden by child
  const kept = parent.filter((c) => !childTypes.has(c._tag));

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
  const childTypes = new Set(child.map((c) => c._tag));

  // Separate required constraints for strictest-wins handling
  const parentRequired = parent.filter(
    (c): c is RequiredConstraint => c._tag === "required",
  );
  const childRequired = child.filter(
    (c): c is RequiredConstraint => c._tag === "required",
  );

  // For non-required types: standard replacement semantics
  const keptNonRequired = parent.filter(
    (c) => c._tag !== "required" && !childTypes.has(c._tag),
  );
  const childNonRequired = child.filter((c) => c._tag !== "required");

  // For required type: pick strictest from either side
  let resolvedRequired: Constraint[] = [];
  if (childRequired.length > 0 || parentRequired.length > 0) {
    const allRequired = [...parentRequired, ...childRequired];
    const strictest = allRequired.reduce((a, b) =>
      (REQUIREMENT_STRICTNESS[a.level] ?? 0) >=
          (REQUIREMENT_STRICTNESS[b.level] ?? 0)
        ? a
        : b
    );
    resolvedRequired = [strictest];
  }

  return [...keptNonRequired, ...childNonRequired, ...resolvedRequired];
}
