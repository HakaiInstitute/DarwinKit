/**
 * Field Violation Types
 *
 * Defines typed data classes for field-level validation violations.
 *
 * DESIGN DECISION: FieldViolation uses Effect's S.TaggedClass for:
 * 1. TYPE-SAFE pattern matching - Use switch on _tag for exhaustive case handling
 * 2. SERIALIZATION - S.TaggedClass provides encode/decode for persistence
 * 3. TYPE GUARDS - Use provided helper functions (isRangeViolation, etc.) for filtering
 *
 * ERROR CHANNEL PATTERN:
 * Field validators use Effect's error channel for violations:
 * - Validators return Effect<ValidField, FieldViolation[]>
 * - Success: Field passed validation
 * - Failure: Field has violations (carried in the Effect error channel)
 *
 * This enables idiomatic Effect composition:
 * - Effect.all({ mode: "result" }) for concurrent validation with aggregation
 * - Type-safe error handling at call sites
 * - Clear separation between "valid" and "has violations"
 *
 * The orchestrator (WorkspaceValidator) catches violations via Effect.catch
 * and aggregates them into the final WorkspaceValidationResult data structure.
 */

import * as S from "effect/Schema";
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
  severity: S.Literals(["error", "warning", "info"]),
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

export class NotNullViolation extends S.TaggedClass<NotNullViolation>()("NotNullViolation", {
  ...baseViolationFields,
}) {}

export class EnumViolation extends S.TaggedClass<EnumViolation>()("EnumViolation", {
  ...baseViolationFields,
  enumType: S.String,
  allowedValues: S.Array(S.String),
  suggestedValue: S.optional(S.String),
}) {}

export class FormatViolation extends S.TaggedClass<FormatViolation>()("FormatViolation", {
  ...baseViolationFields,
  format: S.String,
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

/**
 * Partition any severity-bearing violations into errors/warnings/info.
 * Shared by {@link partitionFieldViolations} and `partitionSchemaViolations`.
 */
export function partitionViolationsBySeverity<
  T extends { readonly severity: "error" | "warning" | "info" },
>(violations: ReadonlyArray<T>): PartitionedViolations<T> {
  const errors: T[] = [];
  const warnings: T[] = [];
  const info: T[] = [];

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

export function partitionFieldViolations(
  violations: ReadonlyArray<FieldViolation>,
): PartitionedViolations<FieldViolation> {
  return partitionViolationsBySeverity(violations);
}
