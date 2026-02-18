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
import { ErrorSeverity } from "../errors/severity.ts";
import type { EnforcementLevel } from "../specs/constraints.ts";

/**
 * Partitioned violations by severity level
 *
 * Generic interface for grouping violations into errors, warnings, and info
 * based on their enforcement level.
 */
export interface PartitionedViolations<T> {
  readonly errors: ReadonlyArray<T>; // enforcement: "required"
  readonly warnings: ReadonlyArray<T>; // enforcement: "recommended"
  readonly info: ReadonlyArray<T>; // enforcement: "optional"
}

/**
 * Base fields shared by all field violations
 *
 * These schema fields are used to construct all violation types.
 *
 * **enforcement** records the rule's strictness level as metadata (not configuration).
 * - For RequiredFieldViolation and VocabularyViolation, enforcement varies by constraint
 *   (e.g., "required", "recommended", or "optional" for presence checks;
 *   "strict" vs "recommended" mapped to enforcement for vocabulary checks).
 * - For value violations (Range, Format, Pattern, Length, Unique), enforcement is
 *   always "required" because value validity is unconditional — invalid values are
 *   always errors regardless of the field's requirement level.
 *
 * **severity** is derived from enforcement via `enforcementToSeverity()`:
 *   "required" → ERROR, "recommended" → WARNING, "optional" → INFO.
 */
const baseViolationFields = {
  enforcement: Schema.Union(
    Schema.Literal("required"),
    Schema.Literal("recommended"),
    Schema.Literal("optional"),
  ),
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
  validatorType: Schema.String,
};

/**
 * Range validation violation (numeric/date range constraints)
 */
export class RangeViolation extends Schema.TaggedClass<RangeViolation>()("RangeViolation", {
  ...baseViolationFields,
  params: Schema.optional(
    Schema.Struct({
      min: Schema.optional(Schema.Number),
      max: Schema.optional(Schema.Number),
    }),
  ),
}) {}

/**
 * Vocabulary validation violation (controlled vocabulary constraints)
 */
export class VocabularyViolation
  extends Schema.TaggedClass<VocabularyViolation>()("VocabularyViolation", {
    ...baseViolationFields,
    suggestedValues: Schema.optional(Schema.Array(Schema.String)),
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  }) {}

/**
 * Uniqueness validation violation (duplicate identifier constraints)
 */
export class UniquenessViolation
  extends Schema.TaggedClass<UniquenessViolation>()("UniquenessViolation", {
    ...baseViolationFields,
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  }) {}

/**
 * Cross-dataset validation violation (foreign key/referential integrity)
 */
export class CrossDatasetViolation
  extends Schema.TaggedClass<CrossDatasetViolation>()("CrossDatasetViolation", {
    ...baseViolationFields,
    params: Schema.optional(
      Schema.Struct({
        sourceDataset: Schema.optional(Schema.String),
        targetDataset: Schema.optional(Schema.String),
        targetField: Schema.optional(Schema.String),
      }),
    ),
  }) {}

/**
 * Primary key constraint violation (duplicate or null primary key)
 */
export class PrimaryKeyViolation
  extends Schema.TaggedClass<PrimaryKeyViolation>()("PrimaryKeyViolation", {
    ...baseViolationFields,
    constraintType: Schema.Union(Schema.Literal("duplicate"), Schema.Literal("null")),
    duplicateCount: Schema.optional(Schema.Number),
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  }) {}

/**
 * Not null constraint violation (required field is null)
 */
export class NotNullViolation extends Schema.TaggedClass<NotNullViolation>()("NotNullViolation", {
  ...baseViolationFields,
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

/**
 * Enum constraint violation (value not in controlled vocabulary)
 */
export class EnumViolation extends Schema.TaggedClass<EnumViolation>()("EnumViolation", {
  ...baseViolationFields,
  enumType: Schema.String,
  allowedValues: Schema.Array(Schema.String),
  suggestedValue: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

/**
 * Format validation violation (field doesn't match expected format like ISO 8601, URL, UUID)
 */
export class FormatViolation extends Schema.TaggedClass<FormatViolation>()("FormatViolation", {
  ...baseViolationFields,
  format: Schema.String,
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

/**
 * Pattern validation violation (field doesn't match regex pattern)
 */
export class PatternViolation extends Schema.TaggedClass<PatternViolation>()("PatternViolation", {
  ...baseViolationFields,
  pattern: Schema.String,
  flags: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {}

/**
 * Length validation violation (string too short or too long)
 */
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

/**
 * Required field violation (field is null, empty, or whitespace-only)
 */
export class RequiredFieldViolation
  extends Schema.TaggedClass<RequiredFieldViolation>()("RequiredFieldViolation", {
    ...baseViolationFields,
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  }) {}

/**
 * Foreign key constraint violation (referenced value doesn't exist)
 */
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

/**
 * Represents a field that passed validation
 *
 * Used as the success type when validators find no violations.
 */
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
 * const vocabErrors = violations.filter(isVocabularyViolation);
 * ```
 */
export type FieldViolation =
  | RangeViolation
  | VocabularyViolation
  | UniquenessViolation
  | CrossDatasetViolation
  | PrimaryKeyViolation
  | NotNullViolation
  | EnumViolation
  | ForeignKeyViolation
  | FormatViolation
  | PatternViolation
  | LengthViolation
  | RequiredFieldViolation;

/**
 * Type guard helper for RangeViolation
 *
 * @example
 * ```typescript
 * const rangeErrors = violations.filter(isRangeViolation);
 * // TypeScript knows rangeErrors is RangeViolation[]
 * ```
 */
export function isRangeViolation(v: FieldViolation): v is RangeViolation {
  return v._tag === "RangeViolation";
}

/**
 * Type guard helper for PrimaryKeyViolation
 *
 * @example
 * ```typescript
 * const pkErrors = violations.filter(isPrimaryKeyViolation);
 * // TypeScript knows pkErrors is PrimaryKeyViolation[]
 * ```
 */
export function isPrimaryKeyViolation(v: FieldViolation): v is PrimaryKeyViolation {
  return v._tag === "PrimaryKeyViolation";
}

/**
 * Type guard helper for EnumViolation
 *
 * @example
 * ```typescript
 * const enumErrors = violations.filter(isEnumViolation);
 * // TypeScript knows enumErrors is EnumViolation[]
 * ```
 */
export function isEnumViolation(v: FieldViolation): v is EnumViolation {
  return v._tag === "EnumViolation";
}

/**
 * Type guard helper for VocabularyViolation
 */
export function isVocabularyViolation(v: FieldViolation): v is VocabularyViolation {
  return v._tag === "VocabularyViolation";
}

/**
 * Type guard helper for UniquenessViolation
 */
export function isUniquenessViolation(v: FieldViolation): v is UniquenessViolation {
  return v._tag === "UniquenessViolation";
}

/**
 * Type guard helper for NotNullViolation
 */
export function isNotNullViolation(v: FieldViolation): v is NotNullViolation {
  return v._tag === "NotNullViolation";
}

/**
 * Type guard helper for ForeignKeyViolation
 */
export function isForeignKeyViolation(v: FieldViolation): v is ForeignKeyViolation {
  return v._tag === "ForeignKeyViolation";
}

/**
 * Type guard helper for CrossDatasetViolation
 */
export function isCrossDatasetViolation(v: FieldViolation): v is CrossDatasetViolation {
  return v._tag === "CrossDatasetViolation";
}

/**
 * Type guard helper for FormatViolation
 */
export function isFormatViolation(v: FieldViolation): v is FormatViolation {
  return v._tag === "FormatViolation";
}

/**
 * Type guard helper for PatternViolation
 */
export function isPatternViolation(v: FieldViolation): v is PatternViolation {
  return v._tag === "PatternViolation";
}

/**
 * Type guard helper for LengthViolation
 */
export function isLengthViolation(v: FieldViolation): v is LengthViolation {
  return v._tag === "LengthViolation";
}

/**
 * Type guard helper for RequiredFieldViolation
 */
export function isRequiredFieldViolation(v: FieldViolation): v is RequiredFieldViolation {
  return v._tag === "RequiredFieldViolation";
}

/**
 * Convert enforcement level to severity
 *
 * Maps validation domain enforcement levels to error severity
 * for consistent error handling across the system.
 *
 * @param enforcement - The enforcement level from validator config
 * @returns The corresponding error severity
 *
 * @example
 * ```typescript
 * enforcementToSeverity("required")    // => ErrorSeverity.ERROR
 * enforcementToSeverity("recommended") // => ErrorSeverity.WARNING
 * enforcementToSeverity("optional")    // => ErrorSeverity.INFO
 * ```
 */
export function enforcementToSeverity(enforcement: EnforcementLevel): ErrorSeverity {
  switch (enforcement) {
    case "required":
      return ErrorSeverity.ERROR;
    case "recommended":
      return ErrorSeverity.WARNING;
    case "optional":
      return ErrorSeverity.INFO;
  }
}

/**
 * Partition field violations by severity level
 *
 * Groups violations into errors, warnings, and info based on their
 * severity level. This is more semantically correct than partitioning
 * by enforcement since severity is the actual categorization used
 * for reporting.
 *
 * @param violations - Array of violations to partition
 * @returns Partitioned violations object
 */
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

/**
 * Create an empty partitioned field violations object
 */
export function emptyPartitionedFieldViolations(): PartitionedViolations<FieldViolation> {
  return { errors: [], warnings: [], info: [] };
}
