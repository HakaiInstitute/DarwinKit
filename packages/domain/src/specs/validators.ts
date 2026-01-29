/**
 * Parameterized validator system for specification compliance
 *
 * Validators are configured with parameters that default to
 * specification requirements (e.g., Darwin Core recommendations)
 * but can be customized per implementation needs.
 */

import * as S from "effect/Schema";
import type { Field } from "../schemas/validation-profile.ts";
import type { FieldDefinition } from "./field-definition.ts";

/**
 * Available validator types
 */
export const ValidatorType = S.Literal(
  "required", // Field must have a non-null/non-empty value
  "unique", // Field value must be unique within the dataset
  "pattern", // Field value must match a regular expression
  "range", // Numeric field must be within min/max bounds
  "length", // String field must meet length requirements
  "format", // Field must conform to specific format (email, URL, etc.)
);

export type ValidatorType = S.Schema.Type<typeof ValidatorType>;

/**
 * Enforcement levels determine how strictly validators are applied
 */
export const EnforcementLevel: S.Literal<[
  "required",
  "recommended",
  "optional",
]> = S.Literal(
  "required",
  "recommended",
  "optional",
);

export type EnforcementLevel = S.Schema.Type<typeof EnforcementLevel>;

/**
 * Validator configuration with parameterized behavior
 */
export interface ValidatorConfig {
  readonly type: ValidatorType;
  readonly enforcement: EnforcementLevel;
  readonly params?: ValidatorParams;
  readonly message?: string;
}

/**
 * Parameters for different validator types
 */
export interface ValidatorParams {
  // Range validator parameters
  readonly min?: number;
  readonly max?: number;
  readonly inclusive?: boolean;

  // Length validator parameters
  readonly minLength?: number;
  readonly maxLength?: number;

  // Pattern validator parameters
  readonly pattern?: string;
  readonly flags?: string;

  // Format validator parameters
  readonly format?: "email" | "url" | "uuid" | "iso8601" | "decimal-degrees" | "integer";

  // Required validator parameters
  readonly allowEmpty?: boolean;
  readonly allowWhitespace?: boolean;

  // Custom parameters for extensibility
  readonly custom?: Record<string, unknown>;
}

/**
 * Effect Schema for ValidatorConfig
 */
export const ValidatorConfigSchema = S.Struct({
  type: ValidatorType,
  enforcement: EnforcementLevel,
  params: S.optional(S.Struct({
    min: S.optional(S.Number),
    max: S.optional(S.Number),
    inclusive: S.optional(S.Boolean),
    minLength: S.optional(S.Number),
    maxLength: S.optional(S.Number),
    pattern: S.optional(S.String),
    flags: S.optional(S.String),
    format: S.optional(S.Literal("email", "url", "uuid", "iso8601", "decimal-degrees", "integer")),
    allowEmpty: S.optional(S.Boolean),
    allowWhitespace: S.optional(S.Boolean),
    custom: S.optional(S.Record({ key: S.String, value: S.Unknown })),
  })),
  message: S.optional(S.String),
});

/**
 * Check if a field uses controlled vocabulary
 *
 * Supports multiple field formats:
 * - NormalizedField: has 'vocabulary' property
 * - Raw JSON schema: has 'values' object (used before normalization)
 */
export function hasControlledVocabulary(
  field: FieldDefinition | Field,
): boolean {
  // NormalizedField format (has 'vocabulary' property)
  if ("vocabulary" in field && field.vocabulary) {
    return true;
  }

  // JSON schema format (has 'values' object - used before normalization)
  if ("values" in field && field.values) {
    return typeof field.values === "object" && Object.keys(field.values).length > 0;
  }

  return false;
}
