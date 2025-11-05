/**
 * Validation Violation Types
 *
 * Defines the minimal and enriched violation types for validation errors.
 * Validators return RawViolation (minimal data), infrastructure enriches
 * to ValidationViolation (full metadata for routing and reporting).
 */

import type { EnforcementLevel, ValidatorConfig } from "../specs/validators.ts";
import type { FieldDefinition } from "../specs/field-definition.ts";
import type { TransformationChain } from "./transformation.ts";
import { ErrorSeverity } from "../errors/severity.ts";

/**
 * Minimal violation data returned by validators
 *
 * Validators return this lightweight structure. Infrastructure
 * enriches it with metadata to create ValidationViolation.
 *
 * @example Simple validator (no conditional logic)
 * ```typescript
 * return rows.map((row) => ({
 *   rowNumber: Number(row.row_num),
 *   value: row.value,
 * }));
 * ```
 *
 * @example Conditional enforcement
 * ```typescript
 * return rows.map((row) => ({
 *   rowNumber: Number(row.row_num),
 *   value: row.value,
 *   enforcement: extremeOutOfRange ? "required" : "recommended",
 *   message: "Custom message",
 * }));
 * ```
 */
export interface RawViolation {
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
}

/**
 * Enriched validation violation with full metadata
 *
 * Created by infrastructure from RawViolation. Contains all
 * metadata needed for routing, formatting, and reporting.
 *
 * This is the internal representation used for partitioning
 * violations by enforcement level before transforming into
 * external API result types.
 */
export interface ValidationViolation {
  // Enforcement metadata (determines routing)
  readonly enforcement: EnforcementLevel;
  readonly severity: ErrorSeverity;

  // Location metadata
  readonly fieldName: string;
  readonly targetName: string;
  readonly rowNumber: number;

  // Violation details
  readonly violationType: "range" | "vocabulary" | "uniqueness" | "temporal" | "cross-dataset";
  readonly value: string;
  readonly csvValue?: string;
  readonly transformedValue?: unknown;
  readonly transformationChain?: TransformationChain;
  readonly errorMessage: string;
  readonly suggestedValues?: ReadonlyArray<string>;

  // Validator metadata
  readonly validatorType: string;
  readonly params?: Record<string, unknown>;
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
): ValidationViolation {
  // Use rule enforcement override if provided, otherwise default to "required"
  const enforcement = raw.enforcement ?? rule.enforcement ?? "required";

  const defaultMessage =
    `Value '${raw.value}' in ${rule.sourceDataset}.${rule.sourceField} does not exist in ${rule.targetDataset}.${rule.targetField}`;

  return {
    // Enforcement
    enforcement,
    severity: enforcementToSeverity(enforcement),

    // Location (use source field as both fieldName and targetName for cross-dataset)
    fieldName: rule.sourceField,
    targetName: rule.targetField,
    rowNumber: raw.rowNumber,

    // Violation details
    violationType: "cross-dataset",
    value: String(raw.value),
    csvValue: raw.csvValue,
    transformedValue: raw.transformedValue,
    transformationChain: raw.transformationChain,
    errorMessage: raw.message || defaultMessage,
    suggestedValues: raw.suggestedValues,

    // Validator metadata (use rule type as validator type)
    validatorType: rule.ruleType || "foreignKey",
    params: {
      sourceDataset: rule.sourceDataset,
      targetDataset: rule.targetDataset,
      targetField: rule.targetField,
    },
  };
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

  return {
    // Enforcement (use override or default)
    enforcement,
    severity: enforcementToSeverity(enforcement),

    // Location
    fieldName,
    targetName: specField.name,
    rowNumber: raw.rowNumber,

    // Violation details
    violationType: validator.type as ValidationViolation["violationType"],
    value: String(raw.value),
    csvValue: raw.csvValue,
    transformedValue: raw.transformedValue,
    transformationChain: raw.transformationChain,
    errorMessage: raw.message || validator.message || "Validation failed",
    suggestedValues: raw.suggestedValues,

    // Validator metadata
    validatorType: validator.type,
    params: validator.params as Record<string, unknown> | undefined,
  };
}
