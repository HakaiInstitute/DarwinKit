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
// Enforcement Level (shared infrastructure, moved from validators.ts)
// =============================================================================

/**
 * Enforcement levels determine how strictly constraints are applied
 */
export const EnforcementLevel: S.Literal<[
  "required",
  "recommended",
  "optional",
]> = S.Literal(
  "required",
  "recommended",
  "optional",
);

export type EnforcementLevel = S.Schema.Type<typeof EnforcementLevel>;

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
  enforcement: EnforcementLevel,
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
  enforcement: EnforcementLevel,
  message: S.optional(S.String),
});

export type RequiredConstraint = S.Schema.Type<typeof RequiredConstraint>;

/**
 * Unique constraint - field value must be unique within the dataset
 */
export const UniqueConstraint = S.Struct({
  type: S.Literal("unique"),
  enforcement: EnforcementLevel,
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
  enforcement: EnforcementLevel,
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
  enforcement: EnforcementLevel,
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
  enforcement: EnforcementLevel,
  message: S.optional(S.String),
});

export type FormatConstraint = S.Schema.Type<typeof FormatConstraint>;

/**
 * Vocabulary constraint - validates against a controlled vocabulary
 *
 * Replaces the separate vocabulary property on FieldDefinition.
 */
export const VocabularyConstraint = S.Struct({
  type: S.Literal("vocabulary"),
  vocabularyKey: S.String,
  caseSensitive: S.optionalWith(S.Boolean, { default: () => false }),
  enforcement: EnforcementLevel,
  message: S.optional(S.String),
});

export type VocabularyConstraint = S.Schema.Type<typeof VocabularyConstraint>;

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
  VocabularyConstraint,
);

export type Constraint = S.Schema.Type<typeof Constraint>;

// =============================================================================
// Merge & Utility Functions
// =============================================================================

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
