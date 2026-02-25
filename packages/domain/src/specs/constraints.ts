import * as Data from "effect/Data";
import * as S from "effect/Schema";

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

export const REQUIREMENT_STRICTNESS: Record<RequirementLevel, number> = {
  required: 2,
  recommended: 1,
  optional: 0,
};

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

export class RangeConstraint extends Data.TaggedClass("range")<{
  readonly min?: number;
  readonly max?: number;
  readonly inclusive?: boolean;
  readonly message?: string;
}> {}

export class RequiredConstraint extends Data.TaggedClass("required")<{
  readonly level: RequirementLevel;
  readonly allowEmpty?: boolean;
  readonly allowWhitespace?: boolean;
  readonly message?: string;
}> {}

export class UniqueConstraint extends Data.TaggedClass("unique")<{
  readonly message?: string;
}> {}

export class PatternConstraint extends Data.TaggedClass("pattern")<{
  readonly pattern: string;
  readonly flags?: string;
  readonly message?: string;
}> {}

export class LengthConstraint extends Data.TaggedClass("length")<{
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly message?: string;
}> {}

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

export type Constraint =
  | RangeConstraint
  | RequiredConstraint
  | UniqueConstraint
  | PatternConstraint
  | LengthConstraint
  | FormatConstraint;

/**
 * Build a decode-only Effect Schema that validates `{ type: tag, ...fields }`
 * and constructs a Data.TaggedClass instance. The `type` field on input is
 * mapped to `_tag` on the class. Encode is a no-op identity (never used).
 */
function constraintSchema<Tag extends string, C extends Constraint>(
  tag: Tag,
  // deno-lint-ignore no-explicit-any
  Cls: new (args: any) => C,
  fields: S.Struct.Fields,
  defaults?: Record<string, unknown>,
) {
  return S.transform(
    S.Struct({ type: S.Literal(tag), ...fields }),
    S.typeSchema(S.instanceOf(Cls)),
    {
      strict: true,
      decode: (from) => {
        const { type: _, ...rest } = from;
        return new Cls({ ...rest, ...defaults });
      },
      // deno-lint-ignore no-explicit-any
      encode: (to) => ({ type: tag, ...to } as any),
    },
  );
}

const RangeConstraintSchema = constraintSchema("range", RangeConstraint, {
  min: S.optional(S.Number),
  max: S.optional(S.Number),
  inclusive: S.optional(S.Boolean),
  message: S.optional(S.String),
}, { inclusive: true });

const UniqueConstraintSchema = constraintSchema("unique", UniqueConstraint, {
  message: S.optional(S.String),
});

const PatternConstraintSchema = constraintSchema("pattern", PatternConstraint, {
  pattern: S.String,
  flags: S.optional(S.String),
  message: S.optional(S.String),
});

const LengthConstraintSchema = constraintSchema("length", LengthConstraint, {
  minLength: S.optional(S.Number),
  maxLength: S.optional(S.Number),
  message: S.optional(S.String),
});

const FormatConstraintSchema = constraintSchema("format", FormatConstraint, {
  format: S.Literal("email", "url", "uuid", "iso8601", "decimal-degrees", "integer"),
  message: S.optional(S.String),
});

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
    // deno-lint-ignore no-explicit-any
    encode: (to) => ({ type: "required", ...to } as any),
  },
);

export const ConstraintSchema = S.Union(
  RangeConstraintSchema,
  RequiredConstraintSchema,
  UniqueConstraintSchema,
  PatternConstraintSchema,
  LengthConstraintSchema,
  FormatConstraintSchema,
);

export const Obligation = S.Literal(
  "required",
  "strongly recommended",
  "recommended",
  "optional",
  "required (if exists)",
  "optional (required for imaging data)",
);

export type Obligation = S.Schema.Type<typeof Obligation>;

export const ObligationsMap = S.Struct({
  obis: S.optional(Obligation),
  gbif: S.optional(Obligation),
});

export type ObligationsMap = S.Schema.Type<typeof ObligationsMap>;

export function strictestRequired(
  constraints: readonly RequiredConstraint[],
): RequiredConstraint | undefined {
  if (constraints.length === 0) return undefined;
  return constraints.reduce((a, b) =>
    (REQUIREMENT_STRICTNESS[a.level] ?? 0) >= (REQUIREMENT_STRICTNESS[b.level] ?? 0) ? a : b
  );
}

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
  const childTypes = new Set(child.map((c) => c._tag));
  const kept = parent.filter((c) => !childTypes.has(c._tag));
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

  const parentRequired = parent.filter(
    (c): c is RequiredConstraint => c._tag === "required",
  );
  const childRequired = child.filter(
    (c): c is RequiredConstraint => c._tag === "required",
  );

  const keptNonRequired = parent.filter(
    (c) => c._tag !== "required" && !childTypes.has(c._tag),
  );
  const childNonRequired = child.filter((c) => c._tag !== "required");

  const allRequired = [...parentRequired, ...childRequired];
  const winner = strictestRequired(allRequired);
  const resolvedRequired: Constraint[] = winner ? [winner] : [];

  return [...keptNonRequired, ...childNonRequired, ...resolvedRequired];
}
