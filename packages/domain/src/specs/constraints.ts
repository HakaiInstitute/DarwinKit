import * as Data from "effect/Data";
import * as Match from "effect/Match";
import * as S from "effect/Schema";
import * as SchemaTransformation from "effect/SchemaTransformation";

export const RequirementLevel = S.Literals([
  "required",
  "recommended",
  "optional",
]);

export type RequirementLevel = typeof RequirementLevel.Type;

export const REQUIREMENT_STRICTNESS = {
  required: 2,
  recommended: 1,
  optional: 0,
} satisfies Record<RequirementLevel, number>;

export const FieldDataType = S.Literals([
  "string",
  "number",
  "integer",
  "date",
  "boolean",
  "uri",
  "identifier",
  "coordinate",
]);

export type FieldDataType = typeof FieldDataType.Type;

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

export const ConstraintFormat = S.Literals([
  "email",
  "url",
  "uuid",
  "iso8601",
  "decimal-degrees",
  "integer",
]);

export type ConstraintFormat = typeof ConstraintFormat.Type;

export class FormatConstraint extends Data.TaggedClass("format")<{
  readonly format: ConstraintFormat;
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
 * Cross-field check: a RangeConstraint must declare at least one bound, and
 * `min` must not exceed `max`. Returns `true` on pass, a message string on fail.
 */
const rangeBoundsCheck = S.makeFilter<{
  readonly type: "range";
  readonly min?: number;
  readonly max?: number;
  readonly inclusive?: boolean;
  readonly message?: string;
}>((from) => {
  if (from.min === undefined && from.max === undefined) {
    return "RangeConstraint requires at least one of 'min' or 'max'";
  }
  if (from.min !== undefined && from.max !== undefined && from.min > from.max) {
    return `RangeConstraint 'min' (${from.min}) must not exceed 'max' (${from.max})`;
  }
  return true;
});

/**
 * Cross-field check: a PatternConstraint's `pattern`/`flags` must compile to a
 * valid RegExp. Returns `true` on pass, a message string on fail.
 */
const patternRegexCheck = S.makeFilter<{
  readonly type: "pattern";
  readonly pattern: string;
  readonly flags?: string;
  readonly message?: string;
}>((from) => {
  try {
    new RegExp(from.pattern, from.flags);
  } catch {
    return `PatternConstraint has invalid regex "/${from.pattern}/${from.flags ?? ""}"`;
  }
  return true;
});

/**
 * Cross-field check: a LengthConstraint must declare at least one bound, and
 * `minLength` must not exceed `maxLength`. Returns `true` on pass, a message
 * string on fail.
 */
const lengthBoundsCheck = S.makeFilter<{
  readonly type: "length";
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly message?: string;
}>((from) => {
  if (from.minLength === undefined && from.maxLength === undefined) {
    return "LengthConstraint requires at least one of 'minLength' or 'maxLength'";
  }
  if (
    from.minLength !== undefined && from.maxLength !== undefined &&
    from.minLength > from.maxLength
  ) {
    return `LengthConstraint 'minLength' (${from.minLength}) must not exceed 'maxLength' (${from.maxLength})`;
  }
  return true;
});

/**
 * Build a bidirectional codec from a discriminated "from" struct (whose `type`
 * field is an `S.tag(tag)`) to a `Data.TaggedClass` constraint instance.
 *
 * Decode: strips the `type` discriminator and hands the remaining fields to
 * `make` (which constructs the class, setting `_tag`). Encode: strips the
 * class's `_tag` and re-keys it back to the `type` discriminator literal.
 */
function constraintCodec<
  Fields extends S.Struct.Fields,
  A extends { readonly _tag: string },
>(
  tag: string,
  fromStruct: S.Struct<Fields>,
  classSchema: S.instanceOf<A>,
  make: (rest: Record<string, unknown>) => A,
): S.decodeTo<S.toType<S.instanceOf<A>>, S.Struct<Fields>> {
  return fromStruct.pipe(
    S.decodeTo(
      S.toType(classSchema),
      SchemaTransformation.transform({
        decode: (from) => {
          const { type: _t, ...rest } = from as Record<string, unknown>;
          return make(rest);
        },
        encode: (to) => {
          const { _tag: _d, ...rest } = to as unknown as Record<string, unknown>;
          return { type: tag, ...rest } as S.Struct<Fields>["Type"];
        },
      }),
    ),
  );
}

const RangeConstraintSchema = constraintCodec(
  "range",
  S.Struct({
    type: S.tag("range"),
    min: S.optional(S.Number),
    max: S.optional(S.Number),
    inclusive: S.optional(S.Boolean),
    message: S.optional(S.String),
  }).check(rangeBoundsCheck),
  S.instanceOf(RangeConstraint),
  (rest) => new RangeConstraint({ inclusive: true, ...rest }),
);

const UniqueConstraintSchema = constraintCodec(
  "unique",
  S.Struct({
    type: S.tag("unique"),
    message: S.optional(S.String),
  }),
  S.instanceOf(UniqueConstraint),
  (rest) => new UniqueConstraint(rest),
);

const PatternConstraintSchema = constraintCodec(
  "pattern",
  S.Struct({
    type: S.tag("pattern"),
    pattern: S.String,
    flags: S.optional(S.String),
    message: S.optional(S.String),
  }).check(patternRegexCheck),
  S.instanceOf(PatternConstraint),
  (rest) => new PatternConstraint(rest as { pattern: string; flags?: string; message?: string }),
);

const LengthConstraintSchema = constraintCodec(
  "length",
  S.Struct({
    type: S.tag("length"),
    minLength: S.optional(S.Number),
    maxLength: S.optional(S.Number),
    message: S.optional(S.String),
  }).check(lengthBoundsCheck),
  S.instanceOf(LengthConstraint),
  (rest) => new LengthConstraint(rest),
);

const FormatConstraintSchema = constraintCodec(
  "format",
  S.Struct({
    type: S.tag("format"),
    format: ConstraintFormat,
    message: S.optional(S.String),
  }),
  S.instanceOf(FormatConstraint),
  (rest) =>
    new FormatConstraint(
      rest as {
        format: ConstraintFormat;
        message?: string;
      },
    ),
);

const RequiredConstraintSchema = constraintCodec(
  "required",
  S.Struct({
    type: S.tag("required"),
    level: S.optional(RequirementLevel),
    allowEmpty: S.optional(S.Boolean),
    allowWhitespace: S.optional(S.Boolean),
    message: S.optional(S.String),
  }),
  S.instanceOf(RequiredConstraint),
  (rest) =>
    new RequiredConstraint({
      level: "required",
      allowEmpty: false,
      allowWhitespace: false,
      ...(rest as {
        level?: RequirementLevel;
        allowEmpty?: boolean;
        allowWhitespace?: boolean;
        message?: string;
      }),
    }),
);

export const ConstraintSchema = S.Union([
  RangeConstraintSchema,
  RequiredConstraintSchema,
  UniqueConstraintSchema,
  PatternConstraintSchema,
  LengthConstraintSchema,
  FormatConstraintSchema,
]);

export const Obligation = S.Literals([
  "required",
  "strongly recommended",
  "recommended",
  "optional",
  "required (if exists)",
  "optional (required for imaging data)",
]);

export type Obligation = typeof Obligation.Type;

export const ObligationsMap = S.Struct({
  obis: S.optional(Obligation),
  gbif: S.optional(Obligation),
});

export type ObligationsMap = typeof ObligationsMap.Type;

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
  return Match.value(obligation).pipe(
    Match.when("required", () => "required" as const),
    Match.when("strongly recommended", () => "recommended" as const),
    Match.when("recommended", () => "optional" as const),
    Match.whenOr(
      "optional",
      "optional (required for imaging data)",
      "required (if exists)",
      () => undefined,
    ),
    Match.exhaustive,
  );
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
