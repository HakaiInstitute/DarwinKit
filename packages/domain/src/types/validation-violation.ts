/**
 * Validation Violation Types
 *
 * Defines the minimal and enriched violation types for validation errors.
 * Validators return RawViolation (minimal data), infrastructure enriches
 * to ValidationViolation (full metadata for routing and reporting).
 *
 * DESIGN DECISION: ValidationViolation uses Effect's Data.TaggedClass for discriminated unions:
 * 1. TYPE-SAFE pattern matching - Use $match for exhaustive case handling
 * 2. TYPE GUARDS - Use $is for filtering violations by type
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
import type { EnforcementLevel, ValidatorConfig } from "../specs/validators.ts";
import type { FieldDefinition } from "../specs/field-definition.ts";
import type { TransformationChain } from "./transformation.ts";
import { ErrorSeverity } from "../errors/severity.ts";

/**
 * Minimal violation data returned by validators
 *
 * Validators use the RawViolation constructor to create type-safe violation objects.
 * Infrastructure enriches them with metadata to create ValidationViolation.
 *
 * Using Data.Class provides:
 * - Type-safe construction with compile-time checks
 * - Immutability guarantees
 * - Structural equality for testing
 * - Single source of truth for the type
 *
 * @example Simple validator (no conditional logic)
 * ```typescript
 * return rows.map((row) => RawViolation({
 *   rowNumber: Number(row.row_num),
 *   value: row.value,
 * }));
 * ```
 *
 * @example Conditional enforcement
 * ```typescript
 * return rows.map((row) => RawViolation({
 *   rowNumber: Number(row.row_num),
 *   value: row.value,
 *   enforcement: extremeOutOfRange ? "required" : "recommended",
 *   message: "Custom message",
 * }));
 * ```
 */
export class RawViolation extends Data.Class<{
  /** Row number where violation occurred (required) */
  readonly rowNumber: number;

  /** Value that violated the constraint (required) */
  readonly value: unknown;

  /** Optional override of validator's enforcement level (for conditional severity) */
  readonly enforcement?: EnforcementLevel;

  /** Optional custom message (overrides validator's default message) */
  readonly message?: string;

  /** Original CSV value (before transformations) */
  readonly csvValue?: string;

  /** Value after transformations */
  readonly transformedValue?: unknown;

  /** Full transformation history */
  readonly transformationChain?: TransformationChain;

  /** Suggested valid values (for vocabulary violations) */
  readonly suggestedValues?: ReadonlyArray<string>;
}> {}

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
 * Discriminated union of all validation violation types
 *
 * Use type guard checking with _tag:
 *
 * @example Type guard filtering
 * ```typescript
 * const rangeErrors = violations.filter((v): v is RangeViolation => v._tag === "RangeViolation");
 * const vocabErrors = violations.filter((v): v is VocabularyViolation => v._tag === "VocabularyViolation");
 * ```
 */
export type ValidationViolation =
  | RangeViolation
  | VocabularyViolation
  | UniquenessViolation
  | TemporalViolation
  | CrossDatasetViolation;

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
 * Since cross-dataset rules don't have FieldDefinitions, we use
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
export function enrichCrossDatasetViolation(
  raw: RawViolation,
  rule: {
    readonly sourceDataset: string;
    readonly sourceField: string;
    readonly targetDataset: string;
    readonly targetField: string;
    readonly enforcement?: EnforcementLevel;
    readonly ruleType?: string;
  },
): CrossDatasetViolation {
  // Use rule enforcement override if provided, otherwise default to "required"
  const enforcement = raw.enforcement ?? rule.enforcement ?? "required";

  const defaultMessage =
    `Value '${raw.value}' in ${rule.sourceDataset}.${rule.sourceField} does not exist in ${rule.targetDataset}.${rule.targetField}`;

  return new CrossDatasetViolation({
    // Enforcement
    enforcement,
    severity: enforcementToSeverity(enforcement),

    // Location (use source field as both fieldName and targetName for cross-dataset)
    fieldName: rule.sourceField,
    targetName: rule.targetField,
    rowNumber: raw.rowNumber,

    // Violation details
    value: String(raw.value),
    csvValue: raw.csvValue,
    transformedValue: raw.transformedValue,
    transformationChain: raw.transformationChain,
    errorMessage: raw.message || defaultMessage,

    // Validator metadata (use rule type as validator type)
    validatorType: rule.ruleType || "foreignKey",
    params: {
      sourceDataset: rule.sourceDataset,
      targetDataset: rule.targetDataset,
      targetField: rule.targetField,
    },
  });
}

/**
 * Enrich a RawViolation with metadata
 *
 * Converts minimal validator output into full ValidationViolation
 * with all metadata needed for routing and reporting.
 *
 * This separation allows validators to return minimal data (just
 * rowNumber and value) while infrastructure handles all the
 * metadata (field names, types, enforcement mapping, etc.).
 *
 * @param raw - Minimal violation data from validator
 * @param validator - Validator config with enforcement and message
 * @param specField - Field definition with name and metadata
 * @param fieldName - Original field name in CSV
 * @returns Enriched violation with full metadata
 *
 * @example
 * ```typescript
 * const raw: RawViolation = {
 *   rowNumber: 5,
 *   value: 95.0,
 * };
 *
 * const validator: ValidatorConfig = {
 *   type: "range",
 *   enforcement: "required",
 *   params: { min: -90, max: 90 },
 *   message: "Latitude must be between -90 and 90",
 * };
 *
 * const enriched = enrichViolation(raw, validator, specField, "lat");
 * // => {
 * //   enforcement: "required",
 * //   severity: ErrorSeverity.ERROR,
 * //   fieldName: "lat",
 * //   targetName: "decimalLatitude",
 * //   rowNumber: 5,
 * //   violationType: "range",
 * //   value: "95.0",
 * //   errorMessage: "Latitude must be between -90 and 90",
 * //   ...
 * // }
 * ```
 */
export function enrichViolation(
  raw: RawViolation,
  validator: ValidatorConfig,
  specField: FieldDefinition,
  fieldName: string,
): ValidationViolation {
  // Use raw enforcement override if provided, otherwise use validator's default
  const enforcement = raw.enforcement ?? validator.enforcement;

  // Common properties for all violation types
  const baseProps = {
    enforcement,
    severity: enforcementToSeverity(enforcement),
    fieldName,
    targetName: specField.name,
    rowNumber: raw.rowNumber,
    value: String(raw.value),
    csvValue: raw.csvValue,
    transformedValue: raw.transformedValue,
    transformationChain: raw.transformationChain,
    errorMessage: raw.message || validator.message || "Validation failed",
    validatorType: validator.type,
  };

  // Return specific violation type based on validator type
  // Note: Some validators use custom type strings beyond the ValidatorType enum
  const validatorType = validator.type as string;

  if (validatorType === "range") {
    return new RangeViolation({
      ...baseProps,
      params: validator.params as { min?: number; max?: number } | undefined,
    });
  }

  if (validatorType === "pattern" && raw.suggestedValues) {
    // Pattern validators with suggested values are vocabulary-like
    return new VocabularyViolation({
      ...baseProps,
      suggestedValues: raw.suggestedValues,
      params: validator.params as Record<string, unknown> | undefined,
    });
  }

  if (validatorType === "unique") {
    return new UniquenessViolation({
      ...baseProps,
      params: validator.params as Record<string, unknown> | undefined,
    });
  }

  if (validatorType === "format" || validatorType === "pattern") {
    // Format/pattern validators can be temporal-like
    return new TemporalViolation({
      ...baseProps,
      params: validator.params as Record<string, unknown> | undefined,
    });
  }

  // Default fallback for any unknown types
  return new RangeViolation({
    ...baseProps,
    params: validator.params as Record<string, unknown> | undefined,
  });
}
