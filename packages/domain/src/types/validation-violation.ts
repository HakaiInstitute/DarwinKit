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
import type { EnforcementLevel } from "../specs/validators.ts";

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
 * Note: CrossDatasetViolation is NOT part of this union - it's a standalone type
 * used separately in CrossDatasetValidationResult because cross-dataset validation
 * operates at a different level (between datasets, not within a single field).
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
  | PrimaryKeyViolation
  | NotNullViolation
  | EnumViolation
  | ForeignKeyViolation;

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
 *
 * Note: CrossDatasetViolation is NOT part of the FieldViolation union
 * because it operates at a different level (between datasets, not within fields).
 * This guard works on unknown values for flexibility.
 *
 * @example
 * ```typescript
 * const crossDatasetErrors = violations.filter(isCrossDatasetViolation);
 * // TypeScript knows crossDatasetErrors is CrossDatasetViolation[]
 * ```
 */
export function isCrossDatasetViolation(v: unknown): v is CrossDatasetViolation {
  return v !== null &&
    typeof v === "object" &&
    "_tag" in v &&
    v._tag === "CrossDatasetViolation";
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
 * Partition field violations by enforcement level
 *
 * Groups violations into errors (required), warnings (recommended),
 * and info (optional) based on their enforcement level.
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
    switch (violation.enforcement) {
      case "required":
        errors.push(violation);
        break;
      case "recommended":
        warnings.push(violation);
        break;
      case "optional":
        info.push(violation);
        break;
    }
  }

  return { errors, warnings, info };
}
