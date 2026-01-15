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
 * DESIGN DECISION: FieldViolation uses Effect's Data.TaggedClass for discriminated unions:
 * 1. TYPE-SAFE pattern matching - Use switch on _tag for exhaustive case handling
 * 2. TYPE GUARDS - Use provided helper functions (isRangeViolation, etc.) for filtering violations by type
 * 3. Two-tier design pattern:
 *    - RawViolation: Minimal data returned by validators (lightweight, fast)
 *    - FieldViolation: Enriched with metadata for routing/reporting (complete)
 * 4. Internal contracts - These define how validators communicate with the validation infrastructure
 * 5. No runtime validation needed - These types are constructed by trusted internal code
 *
 * This separation allows validators to return minimal data while the validation
 * infrastructure handles metadata enrichment (field names, enforcement mapping,
 * severity calculation, error messages, etc.).
 *
 * Validators return RawViolation; infrastructure enriches to FieldViolation.
 */

import { Data } from "effect";
import { ErrorSeverity } from "../errors/severity.ts";
import type { EnforcementLevel } from "../specs/validators.ts";
import type { TransformationChain } from "./transformation.ts";

/**
 * Common fields shared by all field (row-level) validation violations
 *
 * This is the base interface for FieldViolation types that represent
 * data validation failures at the row level. For schema-level violations
 * (structural issues), see SchemaViolationBase in schema-violation.ts.
 *
 * DESIGN DECISION: Kept as plain TypeScript interface rather than Effect Schema because:
 * 1. Internal-only type - Used as base for Data.TaggedClass violations, not for parsing
 * 2. OUTPUT-ONLY - These violations are constructed internally, never parsed from external input
 * 3. TransformationChain dependency - Would require creating schemas for complex nested types
 * 4. Performance - No runtime validation overhead for internally-constructed objects
 */
export interface FieldViolationBase {
  readonly enforcement: EnforcementLevel;
  readonly severity: ErrorSeverity;
  readonly fieldName: string;
  readonly targetName: string;
  readonly rowNumber: number;
  readonly value: string;
  readonly csvValue?: string;
  readonly transformedValue?: unknown;
  readonly transformationChain?: TransformationChain;
  readonly errorMessage: string;
  readonly validatorType: string;
}

/**
 * Range validation violation (numeric/date range constraints)
 */
export class RangeViolation extends Data.TaggedClass("RangeViolation")<
  FieldViolationBase & {
    readonly params?: { min?: number; max?: number };
  }
> {}

/**
 * Vocabulary validation violation (controlled vocabulary constraints)
 */
export class VocabularyViolation extends Data.TaggedClass("VocabularyViolation")<
  FieldViolationBase & {
    readonly suggestedValues?: ReadonlyArray<string>;
    readonly params?: Record<string, unknown>;
  }
> {}

/**
 * Uniqueness validation violation (duplicate identifier constraints)
 */
export class UniquenessViolation extends Data.TaggedClass("UniquenessViolation")<
  FieldViolationBase & {
    readonly params?: Record<string, unknown>;
  }
> {}

/**
 * Temporal validation violation (date/time consistency constraints)
 */
export class TemporalViolation extends Data.TaggedClass("TemporalViolation")<
  FieldViolationBase & {
    readonly params?: Record<string, unknown>;
  }
> {}

/**
 * Cross-dataset validation violation (foreign key/referential integrity)
 */
export class CrossDatasetViolation extends Data.TaggedClass("CrossDatasetViolation")<
  FieldViolationBase & {
    readonly params?: {
      sourceDataset?: string;
      targetDataset?: string;
      targetField?: string;
    };
  }
> {}

/**
 * Primary key constraint violation (duplicate or null primary key)
 */
export class PrimaryKeyViolation extends Data.TaggedClass("PrimaryKeyViolation")<
  FieldViolationBase & {
    readonly constraintType: "duplicate" | "null";
    readonly duplicateCount?: number;
    readonly params?: Record<string, unknown>;
  }
> {}

/**
 * Not null constraint violation (required field is null)
 */
export class NotNullViolation extends Data.TaggedClass("NotNullViolation")<
  FieldViolationBase & {
    readonly params?: Record<string, unknown>;
  }
> {}

/**
 * Enum constraint violation (value not in controlled vocabulary)
 */
export class EnumViolation extends Data.TaggedClass("EnumViolation")<
  FieldViolationBase & {
    readonly enumType: string;
    readonly allowedValues: ReadonlyArray<string>;
    readonly suggestedValue?: string;
    readonly params?: Record<string, unknown>;
  }
> {}

/**
 * Foreign key constraint violation (referenced value doesn't exist)
 */
export class ForeignKeyViolation extends Data.TaggedClass("ForeignKeyViolation")<
  FieldViolationBase & {
    readonly referencedTable: string;
    readonly referencedField: string;
    readonly params?: {
      targetDataset?: string;
      targetField?: string;
    };
  }
> {}

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
      return ErrorSeverity.ERROR;
    case "recommended":
      return ErrorSeverity.WARNING;
    case "optional":
      return ErrorSeverity.INFO;
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
    switch (v.enforcement) {
      case "required":
        errors.push(v);
        break;
      case "recommended":
        warnings.push(v);
        break;
      case "optional":
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
