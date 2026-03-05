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

export const REQUIREMENT_STRICTNESS = {
  required: 2,
  recommended: 1,
  optional: 0,
} satisfies Record<RequirementLevel, number>;

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
}> {
  constructor(props: { min?: number; max?: number; inclusive?: boolean; message?: string }) {
    super({ inclusive: true, ...props });
  }
}

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

const RangeConstraintSchema = S.transform(
  S.Struct({
    type: S.Literal("range"),
    min: S.optional(S.Number),
    max: S.optional(S.Number),
    inclusive: S.optional(S.Boolean),
    message: S.optional(S.String),
  }).pipe(S.filter((from) => {
    if (from.min === undefined && from.max === undefined) {
      return { message: "RangeConstraint requires at least one of 'min' or 'max'", path: [] };
    }
    if (from.min !== undefined && from.max !== undefined && from.min > from.max) {
      return {
        message: `RangeConstraint 'min' (${from.min}) must not exceed 'max' (${from.max})`,
        path: [],
      };
    }
    return undefined;
  })),
  S.typeSchema(S.instanceOf(RangeConstraint)),
  {
    strict: true,
    decode: ({ type: _, ...rest }) => new RangeConstraint({ inclusive: true, ...rest }),
    encode: (to) => ({ type: "range" as const, ...to }),
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
    decode: ({ type: _, ...rest }) => new UniqueConstraint(rest),
    encode: (to) => ({ type: "unique" as const, ...to }),
  },
);

const PatternConstraintSchema = S.transform(
  S.Struct({
    type: S.Literal("pattern"),
    pattern: S.String,
    flags: S.optional(S.String),
    message: S.optional(S.String),
  }).pipe(S.filter((from) => {
    try {
      new RegExp(from.pattern, from.flags);
    } catch {
      return {
        message: `PatternConstraint has invalid regex "/${from.pattern}/${from.flags ?? ""}"`,
        path: [],
      };
    }
    return undefined;
  })),
  S.typeSchema(S.instanceOf(PatternConstraint)),
  {
    strict: true,
    decode: ({ type: _, ...rest }) => new PatternConstraint(rest),
    encode: (to) => ({ type: "pattern" as const, ...to }),
  },
);

const LengthConstraintSchema = S.transform(
  S.Struct({
    type: S.Literal("length"),
    minLength: S.optional(S.Number),
    maxLength: S.optional(S.Number),
    message: S.optional(S.String),
  }).pipe(S.filter((from) => {
    if (from.minLength === undefined && from.maxLength === undefined) {
      return {
        message: "LengthConstraint requires at least one of 'minLength' or 'maxLength'",
        path: [],
      };
    }
    if (
      from.minLength !== undefined && from.maxLength !== undefined &&
      from.minLength > from.maxLength
    ) {
      return {
        message:
          `LengthConstraint 'minLength' (${from.minLength}) must not exceed 'maxLength' (${from.maxLength})`,
        path: [],
      };
    }
    return undefined;
  })),
  S.typeSchema(S.instanceOf(LengthConstraint)),
  {
    strict: true,
    decode: ({ type: _, ...rest }) => new LengthConstraint(rest),
    encode: (to) => ({ type: "length" as const, ...to }),
  },
);

const FormatConstraintSchema = S.transform(
  S.Struct({
    type: S.Literal("format"),
    format: S.Literal("email", "url", "uuid", "iso8601", "decimal-degrees", "integer"),
    message: S.optional(S.String),
  }),
  S.typeSchema(S.instanceOf(FormatConstraint)),
  {
    strict: true,
    decode: ({ type: _, ...rest }) => new FormatConstraint(rest),
    encode: (to) => ({ type: "format" as const, ...to }),
  },
);

const RequiredConstraintSchema = S.transform(
  S.Struct({
    type: S.Literal("required"),
    level: S.optional(RequirementLevel),
    allowEmpty: S.optional(S.Boolean),
    allowWhitespace: S.optional(S.Boolean),
    message: S.optional(S.String),
  }),
  S.typeSchema(S.instanceOf(RequiredConstraint)),
  {
    strict: true,
    decode: ({ type: _, ...rest }) =>
      new RequiredConstraint({
        level: "required",
        allowEmpty: false,
        allowWhitespace: false,
        ...rest,
      }),
    encode: (to) => ({ type: "required" as const, ...to }),
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
 * Note: "required (if exists)" is handled separately in resolveSpecFields() (field-resolution.ts)
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
 * Override base constraints with overrides by `_tag`.
 *
 * For each constraint type present in `overrides`, ALL override constraints of
 * that type replace ALL base constraints of that type.
 * Non-overlapping types from both arrays are preserved.
 */
export function overrideConstraints(
  base: readonly Constraint[],
  overrides: readonly Constraint[],
): Constraint[] {
  const overrideTypes = new Set(overrides.map((c) => c._tag));
  const kept = base.filter((c) => !overrideTypes.has(c._tag));
  return [...kept, ...overrides];
}

/**
 * Merge constraints for profile overrides (Tier 2).
 *
 * For RequiredConstraints: uses strictest-wins semantics — a profile
 * cannot weaken a spec's requirement level.
 * For all other constraint types: uses replacement semantics (same as overrideConstraints).
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
