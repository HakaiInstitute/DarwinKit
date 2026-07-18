/**
 * Field-level validation violations as Effect S.TaggedClass instances
 * (encode/decode for persistence; use the isXxx type guards for filtering).
 *
 * Validators return Effect<ValidField, FieldViolation[]>; violations travel in
 * the error channel and are aggregated by WorkspaceValidator into the result.
 */

import * as Match from "effect/Match";
import * as S from "effect/Schema";
import { ConstraintFormat, type RequirementLevel } from "../specs/constraints.ts";

/**
 * Severity of a violation — determines how it is reported.
 */
export const Severity = S.Literals(["error", "warning", "info"]);

export type Severity = typeof Severity.Type;

/**
 * Partitioned violations by severity level
 *
 * Generic interface for grouping violations into errors, warnings, and info
 * based on their severity.
 */
export interface PartitionedViolations<T> {
  readonly errors: ReadonlyArray<T>; // severity: "error"
  readonly warnings: ReadonlyArray<T>; // severity: "warning"
  readonly info: ReadonlyArray<T>; // severity: "info"
}

/**
 * Base fields shared by all field violations.
 *
 * **severity** is the sole behavioral field — it determines how the violation
 * is reported. Derived from requirement level via `requirementToSeverity()`:
 * "required" → ERROR, "recommended" → WARNING, "optional" → INFO.
 */
const baseViolationFields = {
  severity: Severity,
  fieldName: S.String,
  targetName: S.String,
  rowNumber: S.Number,
  value: S.String,
  errorMessage: S.String,
};

export class RangeViolation extends S.TaggedClass<RangeViolation>()("RangeViolation", {
  ...baseViolationFields,
  params: S.optional(
    S.Struct({
      min: S.optional(S.Number),
      max: S.optional(S.Number),
    }),
  ),
}) {}

export class UniquenessViolation
  extends S.TaggedClass<UniquenessViolation>()("UniquenessViolation", {
    ...baseViolationFields,
  }) {}

export class PrimaryKeyViolation
  extends S.TaggedClass<PrimaryKeyViolation>()("PrimaryKeyViolation", {
    ...baseViolationFields,
    constraintType: S.Literals(["duplicate", "null"]),
    duplicateCount: S.optional(S.Number),
  }) {}

export class EnumViolation extends S.TaggedClass<EnumViolation>()("EnumViolation", {
  ...baseViolationFields,
  enumType: S.String,
  allowedValues: S.Array(S.String),
  suggestedValue: S.optional(S.String),
}) {}

export class FormatViolation extends S.TaggedClass<FormatViolation>()("FormatViolation", {
  ...baseViolationFields,
  format: ConstraintFormat,
}) {}

export class PatternViolation extends S.TaggedClass<PatternViolation>()("PatternViolation", {
  ...baseViolationFields,
  pattern: S.String,
  flags: S.optional(S.String),
}) {}

export class LengthViolation extends S.TaggedClass<LengthViolation>()("LengthViolation", {
  ...baseViolationFields,
  params: S.optional(
    S.Struct({
      minLength: S.optional(S.Number),
      maxLength: S.optional(S.Number),
      actualLength: S.optional(S.Number),
    }),
  ),
}) {}

export class RequiredFieldViolation
  extends S.TaggedClass<RequiredFieldViolation>()("RequiredFieldViolation", {
    ...baseViolationFields,
  }) {}

export class TypeViolation extends S.TaggedClass<TypeViolation>()("TypeViolation", {
  ...baseViolationFields,
  expectedType: S.String,
}) {}

export class DependencyViolation
  extends S.TaggedClass<DependencyViolation>()("DependencyViolation", {
    ...baseViolationFields,
  }) {}

export class ForeignKeyViolation
  extends S.TaggedClass<ForeignKeyViolation>()("ForeignKeyViolation", {
    ...baseViolationFields,
    referencedTable: S.String,
    referencedField: S.String,
    params: S.optional(
      S.Struct({
        targetDataset: S.optional(S.String),
        targetField: S.optional(S.String),
      }),
    ),
  }) {}

export interface ValidField {
  readonly fieldName: string;
  readonly targetName: string;
  readonly status: "valid";
}

/**
 * Discriminated union of all field validation violation types
 *
 * FieldViolation represents data-level violations found during validation.
 * These are returned in the error channel using Effect.fail().
 *
 * Use the provided type guard helpers for filtering:
 *
 * @example Type guard filtering
 * ```typescript
 * const rangeErrors = violations.filter(isRangeViolation);
 * ```
 */
export type FieldViolation =
  | RangeViolation
  | UniquenessViolation
  | PrimaryKeyViolation
  | EnumViolation
  | ForeignKeyViolation
  | FormatViolation
  | PatternViolation
  | LengthViolation
  | RequiredFieldViolation
  | TypeViolation
  | DependencyViolation;

export function isRangeViolation(v: FieldViolation): v is RangeViolation {
  return v._tag === "RangeViolation";
}

export function isPrimaryKeyViolation(v: FieldViolation): v is PrimaryKeyViolation {
  return v._tag === "PrimaryKeyViolation";
}

export function isEnumViolation(v: FieldViolation): v is EnumViolation {
  return v._tag === "EnumViolation";
}

export function isFormatViolation(v: FieldViolation): v is FormatViolation {
  return v._tag === "FormatViolation";
}

export function isPatternViolation(v: FieldViolation): v is PatternViolation {
  return v._tag === "PatternViolation";
}

export function isLengthViolation(v: FieldViolation): v is LengthViolation {
  return v._tag === "LengthViolation";
}

export function isRequiredFieldViolation(v: FieldViolation): v is RequiredFieldViolation {
  return v._tag === "RequiredFieldViolation";
}

export function isTypeViolation(v: FieldViolation): v is TypeViolation {
  return v._tag === "TypeViolation";
}

export function isForeignKeyViolation(v: FieldViolation): v is ForeignKeyViolation {
  return v._tag === "ForeignKeyViolation";
}

export function requirementToSeverity(requirement: RequirementLevel): Severity {
  return Match.value(requirement).pipe(
    Match.when("required", () => "error" as const),
    Match.when("recommended", () => "warning" as const),
    Match.when("optional", () => "info" as const),
    Match.exhaustive,
  );
}

/**
 * Partition any severity-bearing violations into errors/warnings/info.
 * Shared by {@link partitionFieldViolations} and `partitionSchemaViolations`.
 */
export function partitionViolationsBySeverity<
  T extends { readonly severity: Severity },
>(violations: ReadonlyArray<T>): PartitionedViolations<T> {
  const errors: T[] = [];
  const warnings: T[] = [];
  const info: T[] = [];

  for (const violation of violations) {
    const bucket = Match.value(violation.severity).pipe(
      Match.when("error", () => errors),
      Match.when("warning", () => warnings),
      Match.when("info", () => info),
      Match.exhaustive,
    );
    bucket.push(violation);
  }

  return { errors, warnings, info };
}

export function partitionFieldViolations(
  violations: ReadonlyArray<FieldViolation>,
): PartitionedViolations<FieldViolation> {
  return partitionViolationsBySeverity(violations);
}
