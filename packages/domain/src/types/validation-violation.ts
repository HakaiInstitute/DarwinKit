/**
 * Validation Violation Types
 *
 * Defines the minimal and enriched violation types for validation errors.
 * Validators return RawViolation (minimal data), infrastructure enriches
 * to ValidationViolation (full metadata for routing and reporting).
 *
 * DESIGN DECISION: ValidationViolation uses Effect's Data.TaggedClass for discriminated unions:
 * 1. TYPE-SAFE pattern matching - Use switch on _tag for exhaustive case handling
 * 2. TYPE GUARDS - Use provided helper functions (isRangeViolation, etc.) for filtering violations by type
 * 3. Two-tier design pattern:
 *    - RawViolation: Minimal data returned by validators (lightweight, fast)
 *    - ValidationViolation: Enriched with metadata for routing/reporting (complete)
 * 4. Internal contracts - These define how validators communicate with the validation infrastructure
 * 5. No runtime validation needed - These types are constructed by trusted internal code
 *
 * This separation allows validators to return minimal data while the validation
 * infrastructure handles metadata enrichment (field names, enforcement mapping,
 * severity calculation, error messages, etc.).
 *
 * Validators return RawViolation; infrastructure enriches to ValidationViolation.
 */

import { Data } from "effect";
import type { EnforcementLevel } from "../specs/validators.ts";
import type { TransformationChain } from "./transformation.ts";
import { ErrorSeverity } from "../errors/severity.ts";

/**
 * Common fields shared by all validation violations
 *
 * DESIGN DECISION: Kept as plain TypeScript interface rather than Effect Schema because:
 * 1. Internal-only type - Used as base for Data.TaggedClass violations, not for parsing
 * 2. OUTPUT-ONLY - These violations are constructed internally, never parsed from external input
 * 3. TransformationChain dependency - Would require creating schemas for complex nested types
 * 4. Performance - No runtime validation overhead for internally-constructed objects
 */
interface ViolationBase {
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
  ViolationBase & {
    readonly params?: { min?: number; max?: number };
  }
> {}

/**
 * Vocabulary validation violation (controlled vocabulary constraints)
 */
export class VocabularyViolation extends Data.TaggedClass("VocabularyViolation")<
  ViolationBase & {
    readonly suggestedValues?: ReadonlyArray<string>;
    readonly params?: Record<string, unknown>;
  }
> {}

/**
 * Uniqueness validation violation (duplicate identifier constraints)
 */
export class UniquenessViolation extends Data.TaggedClass("UniquenessViolation")<
  ViolationBase & {
    readonly params?: Record<string, unknown>;
  }
> {}

/**
 * Temporal validation violation (date/time consistency constraints)
 */
export class TemporalViolation extends Data.TaggedClass("TemporalViolation")<
  ViolationBase & {
    readonly params?: Record<string, unknown>;
  }
> {}

/**
 * Cross-dataset validation violation (foreign key/referential integrity)
 */
export class CrossDatasetViolation extends Data.TaggedClass("CrossDatasetViolation")<
  ViolationBase & {
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
  ViolationBase & {
    readonly constraintType: "duplicate" | "null";
    readonly duplicateCount?: number;
    readonly params?: Record<string, unknown>;
  }
> {}

/**
 * Not null constraint violation (required field is null)
 */
export class NotNullViolation extends Data.TaggedClass("NotNullViolation")<
  ViolationBase & {
    readonly params?: Record<string, unknown>;
  }
> {}

/**
 * Enum constraint violation (value not in controlled vocabulary)
 */
export class EnumViolation extends Data.TaggedClass("EnumViolation")<
  ViolationBase & {
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
  ViolationBase & {
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
export type ValidationViolation =
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
export function isRangeViolation(v: ValidationViolation): v is RangeViolation {
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
export function isVocabularyViolation(v: ValidationViolation): v is VocabularyViolation {
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
export function isUniquenessViolation(v: ValidationViolation): v is UniquenessViolation {
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
export function isTemporalViolation(v: ValidationViolation): v is TemporalViolation {
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
export function isCrossDatasetViolation(v: ValidationViolation): v is CrossDatasetViolation {
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
export function isPrimaryKeyViolation(v: ValidationViolation): v is PrimaryKeyViolation {
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
export function isNotNullViolation(v: ValidationViolation): v is NotNullViolation {
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
export function isEnumViolation(v: ValidationViolation): v is EnumViolation {
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
export function isForeignKeyViolation(v: ValidationViolation): v is ForeignKeyViolation {
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
