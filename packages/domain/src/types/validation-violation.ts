/**
 * Validation Violation Types
 *
 * TODO: Determine if this location in the code base makes sense, and if the file
 * should keep the name 'validation-violation.ts'
 *
 * Defines the minimal and enriched violation types for validation errors.
 * Validators return RawViolation (minimal data), infrastructure enriches
 * to FieldViolation (full metadata for routing and reporting).
 *
 * DESIGN DECISION: Uses Effect's Schema.TaggedClass for true class inheritance:
 * 1. TRUE INHERITANCE - Base class with common fields, extended for specific violation types
 * 2. TYPE-SAFE pattern matching - Use switch on _tag for exhaustive case handling
 * 3. TYPE GUARDS - Use provided helper functions (isRangeViolation, etc.) for filtering violations by type
 * 4. Two-tier design pattern:
 *    - RawViolation: Minimal data returned by validators (lightweight, fast)
 *    - FieldViolation: Enriched with metadata for routing/reporting (complete)
 * 5. Internal contracts - These define how validators communicate with the validation infrastructure
 * 6. Schema validation - Provides runtime validation ensuring data integrity when violations are created
 *
 * This separation allows validators to return minimal data while the validation
 * infrastructure handles metadata enrichment (field names, enforcement mapping,
 * severity calculation, error messages, etc.).
 *
 * Validators return RawViolation; infrastructure enriches to FieldViolation.
 */

import { Schema } from "effect";
import type { ErrorSeverity } from "../errors/severity.ts";
import type { EnforcementLevel } from "../specs/validators.ts";

/**
 * Base field schemas shared by all field (row-level) validation violations
 *
 * These are the common field schemas that all specific violation types include.
 * For schema-level violations (structural issues), see SchemaViolationBase in schema-violation.ts.
 *
 * DESIGN DECISION: Uses Schema.TaggedClass with shared field schemas:
 * 1. Each violation type has its own unique _tag for discriminated unions
 * 2. Provides runtime schema validation ensuring data integrity
 * 3. Shared field schemas eliminate repetition while preserving unique tags
 * 4. Type-safe pattern matching via _tag property
 * 5. Follows Effect's recommended patterns for tagged classes
 *
 * Note: This is a const object of schemas, not a class. Each violation type
 * creates its own Schema.TaggedClass with these base fields plus its specific fields.
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
export class RangeViolation extends Schema.TaggedClass<RangeViolation>()(
  "RangeViolation",
  {
    ...baseViolationFields,
    params: Schema.optional(
      Schema.Struct({
        min: Schema.optional(Schema.Number),
        max: Schema.optional(Schema.Number),
      }),
    ),
  },
) {}

/**
 * Vocabulary validation violation (controlled vocabulary constraints)
 */
export class VocabularyViolation extends Schema.TaggedClass<VocabularyViolation>()(
  "VocabularyViolation",
  {
    ...baseViolationFields,
    suggestedValues: Schema.optional(Schema.Array(Schema.String)),
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  },
) {}

/**
 * Uniqueness validation violation (duplicate identifier constraints)
 */
export class UniquenessViolation extends Schema.TaggedClass<UniquenessViolation>()(
  "UniquenessViolation",
  {
    ...baseViolationFields,
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  },
) {}

/**
 * Temporal validation violation (date/time consistency constraints)
 */
export class TemporalViolation extends Schema.TaggedClass<TemporalViolation>()(
  "TemporalViolation",
  {
    ...baseViolationFields,
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  },
) {}

/**
 * Cross-dataset validation violation (foreign key/referential integrity)
 */
export class CrossDatasetViolation extends Schema.TaggedClass<CrossDatasetViolation>()(
  "CrossDatasetViolation",
  {
    ...baseViolationFields,
    params: Schema.optional(
      Schema.Struct({
        sourceDataset: Schema.optional(Schema.String),
        targetDataset: Schema.optional(Schema.String),
        targetField: Schema.optional(Schema.String),
      }),
    ),
  },
) {}

/**
 * Primary key constraint violation (duplicate or null primary key)
 */
export class PrimaryKeyViolation extends Schema.TaggedClass<PrimaryKeyViolation>()(
  "PrimaryKeyViolation",
  {
    ...baseViolationFields,
    constraintType: Schema.Union(Schema.Literal("duplicate"), Schema.Literal("null")),
    duplicateCount: Schema.optional(Schema.Number),
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  },
) {}

/**
 * Not null constraint violation (required field is null)
 */
export class NotNullViolation extends Schema.TaggedClass<NotNullViolation>()(
  "NotNullViolation",
  {
    ...baseViolationFields,
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  },
) {}

/**
 * Enum constraint violation (value not in controlled vocabulary)
 */
export class EnumViolation extends Schema.TaggedClass<EnumViolation>()(
  "EnumViolation",
  {
    ...baseViolationFields,
    enumType: Schema.String,
    allowedValues: Schema.Array(Schema.String),
    suggestedValue: Schema.optional(Schema.String),
    params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  },
) {}

/**
 * Foreign key constraint violation (referenced value doesn't exist)
 */
export class ForeignKeyViolation extends Schema.TaggedClass<ForeignKeyViolation>()(
  "ForeignKeyViolation",
  {
    ...baseViolationFields,
    referencedTable: Schema.String,
    referencedField: Schema.String,
    params: Schema.optional(
      Schema.Struct({
        targetDataset: Schema.optional(Schema.String),
        targetField: Schema.optional(Schema.String),
      }),
    ),
  },
) {}

/**
 * Discriminated union of all validation violation types
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
  | TemporalViolation
  | CrossDatasetViolation
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
 * Type guard helper for VocabularyViolation
 *
 * @example
 * ```typescript
 * const vocabErrors = violations.filter(isVocabularyViolation);
 * // TypeScript knows vocabErrors is VocabularyViolation[]
 * ```
 */
export function isVocabularyViolation(v: FieldViolation): v is VocabularyViolation {
  return v._tag === "VocabularyViolation";
}

/**
 * Type guard helper for UniquenessViolation
 *
 * @example
 * ```typescript
 * const uniquenessErrors = violations.filter(isUniquenessViolation);
 * // TypeScript knows uniqueErrors is UniquenessViolation[]
 * ```
 */
export function isUniquenessViolation(v: FieldViolation): v is UniquenessViolation {
  return v._tag === "UniquenessViolation";
}

/**
 * Type guard helper for TemporalViolation
 *
 * @example
 * ```typescript
 * const temporalErrors = violations.filter(isTemporalViolation);
 * // TypeScript knows temporalErrors is TemporalViolation[]
 * ```
 */
export function isTemporalViolation(v: FieldViolation): v is TemporalViolation {
  return v._tag === "TemporalViolation";
}

/**
 * Type guard helper for CrossDatasetViolation
 *
 * @example
 * ```typescript
 * const crossErrors = violations.filter(isCrossDatasetViolation);
 * // TypeScript knows crossErrors is CrossDatasetViolation[]
 * ```
 */
export function isCrossDatasetViolation(v: FieldViolation): v is CrossDatasetViolation {
  return v._tag === "CrossDatasetViolation";
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
 * Type guard helper for NotNullViolation
 *
 * @example
 * ```typescript
 * const notNullErrors = violations.filter(isNotNullViolation);
 * // TypeScript knows notNullErrors is NotNullViolation[]
 * ```
 */
export function isNotNullViolation(v: FieldViolation): v is NotNullViolation {
  return v._tag === "NotNullViolation";
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
 * Type guard helper for ForeignKeyViolation
 *
 * @example
 * ```typescript
 * const fkErrors = violations.filter(isForeignKeyViolation);
 * // TypeScript knows fkErrors is ForeignKeyViolation[]
 * ```
 */
export function isForeignKeyViolation(v: FieldViolation): v is ForeignKeyViolation {
  return v._tag === "ForeignKeyViolation";
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
      return "error";
    case "recommended":
      return "warning";
    case "optional":
      return "info";
  }
}

/**
 * Enrich a cross-dataset RawViolation with metadata
 *
 * Similar to enrichViolation but for cross-dataset relationships.
 * Since cross-dataset rules don't have field definitions, we use
 * rule metadata directly.
 *
 * @param raw - Minimal violation data
 * @param rule - Cross-dataset rule configuration
 * @returns Enriched violation with cross-dataset metadata
 *
 * @example
 * ```typescript
 * const raw: RawViolation = {
 *   rowNumber: 5,
 *   value: "E2",
 * };
 *
 * const rule = {
 *   ruleType: "foreignKey",
 *   sourceDataset: "occurrences",
 *   sourceField: "eventID",
 *   targetDataset: "events",
 *   targetField: "eventID",
 *   enforcement: "required",
 * };
 *
 * const enriched = enrichCrossDatasetViolation(raw, rule);
 * // => {
 * //   enforcement: "required",
 * //   severity: ErrorSeverity.ERROR,
 * //   fieldName: "eventID",
 * //   targetName: "eventID",
 * //   rowNumber: 5,
 * //   violationType: "cross-dataset",
 * //   value: "E2",
 * //   errorMessage: "Value 'E2' in occurrences.eventID does not exist in events.eventID",
 * //   ...
 * // }
 * ```
 */

/**
 * Generic partitioned violations structure
 *
 * Partitions violations into errors, warnings, and info based on enforcement level.
 * Works with any violation type (FieldViolation, SchemaViolation, etc.)
 *
 * @template T - The violation type to partition
 *
 * @example
 * ```typescript
 * const fieldViolations: PartitionedViolations<FieldViolation> = {
 *   errors: [...],
 *   warnings: [...],
 *   info: [...]
 * };
 *
 * const schemaViolations: PartitionedViolations<SchemaViolation> = {
 *   errors: [...],
 *   warnings: [...],
 *   info: [...]
 * };
 * ```
 */
export interface PartitionedViolations<T> {
  readonly errors: ReadonlyArray<T>;
  readonly warnings: ReadonlyArray<T>;
  readonly info: ReadonlyArray<T>;
}

/**
 * Partition field violations by enforcement level
 *
 * @param violations - Array of field violations to partition
 * @returns Object with errors, warnings, and info arrays
 *
 * @example
 * ```typescript
 * const partitioned = partitionFieldViolations(allViolations);
 * console.log(`${partitioned.errors.length} data errors`);
 * console.log(`${partitioned.warnings.length} data warnings`);
 * ```
 */
export function partitionFieldViolations(
  violations: ReadonlyArray<FieldViolation>,
): PartitionedViolations<FieldViolation> {
  const errors: FieldViolation[] = [];
  const warnings: FieldViolation[] = [];
  const info: FieldViolation[] = [];

  for (const v of violations) {
    switch (v.severity) {
      case "error":
        errors.push(v);
        break;
      case "warning":
        warnings.push(v);
        break;
      case "info":
        info.push(v);
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
