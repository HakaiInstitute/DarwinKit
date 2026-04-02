/**
 * Field Violation Types
 *
 * Defines typed data classes for field-level validation violations.
 *
 * DESIGN DECISION: FieldViolation uses Effect's Schema.TaggedClass for:
 * 1. TYPE-SAFE pattern matching - Use switch on _tag for exhaustive case handling
 * 2. SERIALIZATION - Schema.TaggedClass provides encode/decode for persistence
 * 3. TYPE GUARDS - Use provided helper functions (isRangeViolation, etc.) for filtering
 *
 * ERROR CHANNEL PATTERN:
 * Field validators use Effect's error channel for violations:
 * - Validators return Effect<ValidField, FieldViolation[]>
 * - Success (Right): Field passed validation
 * - Failure (Left): Field has violations
 *
 * This enables idiomatic Effect composition:
 * - Effect.all({ mode: "either" }) for concurrent validation with aggregation
 * - Type-safe error handling at call sites
 * - Clear separation between "valid" and "has violations"
 *
 * The orchestrator (WorkspaceValidator) catches violations via Effect.catchAll
 * and aggregates them into the final WorkspaceValidationResult data structure.
 */

import { Schema } from "effect";
import type { RequirementLevel } from "../specs/constraints.ts";

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
 * Base fields shared by all field violations
 *
 * These schema fields are used to construct all violation types.
 *
 * **severity** is the sole behavioral field — it determines how the violation
 * is reported (error, warning, or info). Derived from requirement level via
 * `requirementToSeverity()`: "required" → ERROR, "recommended" → WARNING,
 * "optional" → INFO.
 */
const baseViolationFields = {
  severity: Schema.Union(
    Schema.Literal("error"),
    Schema.Literal("warning"),
    Schema.Literal("info"),
  ),
  fieldName: Schema.String,
  targetName: Schema.String,
  rowNumber: Schema.Number,
  value: Schema.String,
  csvValue: Schema.optional(Schema.String),
  transformedValue: Schema.optional(Schema.Unknown),
  errorMessage: Schema.String,
};

export class RangeViolation extends Schema.TaggedClass<RangeViolation>()("RangeViolation", {
  ...baseViolationFields,
  params: Schema.optional(
    Schema.Struct({
      min: Schema.optional(Schema.Number),
      max: Schema.optional(Schema.Number),
    }),
  ),
}) {}

export class UniquenessViolation
  extends Schema.TaggedClass<UniquenessViolation>()("UniquenessViolation", {
    ...baseViolationFields,
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  }) {}

export class PrimaryKeyViolation
  extends Schema.TaggedClass<PrimaryKeyViolation>()("PrimaryKeyViolation", {
    ...baseViolationFields,
    constraintType: Schema.Union(Schema.Literal("duplicate"), Schema.Literal("null")),
    duplicateCount: Schema.optional(Schema.Number),
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  }) {}

export class NotNullViolation extends Schema.TaggedClass<NotNullViolation>()("NotNullViolation", {
  ...baseViolationFields,
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

export class EnumViolation extends Schema.TaggedClass<EnumViolation>()("EnumViolation", {
  ...baseViolationFields,
  enumType: Schema.String,
  allowedValues: Schema.Array(Schema.String),
  suggestedValue: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

export class FormatViolation extends Schema.TaggedClass<FormatViolation>()("FormatViolation", {
  ...baseViolationFields,
  format: Schema.String,
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

export class PatternViolation extends Schema.TaggedClass<PatternViolation>()("PatternViolation", {
  ...baseViolationFields,
  pattern: Schema.String,
  flags: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

export class LengthViolation extends Schema.TaggedClass<LengthViolation>()("LengthViolation", {
  ...baseViolationFields,
  params: Schema.optional(
    Schema.Struct({
      minLength: Schema.optional(Schema.Number),
      maxLength: Schema.optional(Schema.Number),
      actualLength: Schema.optional(Schema.Number),
    }),
  ),
}) {}

export class RequiredFieldViolation
  extends Schema.TaggedClass<RequiredFieldViolation>()("RequiredFieldViolation", {
    ...baseViolationFields,
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  }) {}

export class DependencyViolation
  extends Schema.TaggedClass<DependencyViolation>()("DependencyViolation", {
    ...baseViolationFields,
  }) {}

export class ForeignKeyViolation
  extends Schema.TaggedClass<ForeignKeyViolation>()("ForeignKeyViolation", {
    ...baseViolationFields,
    referencedTable: Schema.String,
    referencedField: Schema.String,
    params: Schema.optional(
      Schema.Struct({
        targetDataset: Schema.optional(Schema.String),
        targetField: Schema.optional(Schema.String),
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
  | NotNullViolation
  | EnumViolation
  | ForeignKeyViolation
  | FormatViolation
  | PatternViolation
  | LengthViolation
  | RequiredFieldViolation
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

export function isUniquenessViolation(v: FieldViolation): v is UniquenessViolation {
  return v._tag === "UniquenessViolation";
}

export function isNotNullViolation(v: FieldViolation): v is NotNullViolation {
  return v._tag === "NotNullViolation";
}

export function isForeignKeyViolation(v: FieldViolation): v is ForeignKeyViolation {
  return v._tag === "ForeignKeyViolation";
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

export function isDependencyViolation(v: FieldViolation): v is DependencyViolation {
  return v._tag === "DependencyViolation";
}

export function requirementToSeverity(requirement: RequirementLevel): "error" | "warning" | "info" {
  switch (requirement) {
    case "required":
      return "error";
    case "recommended":
      return "warning";
    case "optional":
      return "info";
  }
}

export function partitionFieldViolations(
  violations: ReadonlyArray<FieldViolation>,
): PartitionedViolations<FieldViolation> {
  const errors: FieldViolation[] = [];
  const warnings: FieldViolation[] = [];
  const info: FieldViolation[] = [];

  for (const violation of violations) {
    switch (violation.severity) {
      case "error":
        errors.push(violation);
        break;
      case "warning":
        warnings.push(violation);
        break;
      case "info":
        info.push(violation);
        break;
    }
  }

  return { errors, warnings, info };
}
