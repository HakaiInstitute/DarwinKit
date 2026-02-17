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
import type { VocabularyEnforcement } from "./vocabularies/config.ts";

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
).annotations({
  title: "Validator Type",
  description: "Type of validation to apply: required, unique, pattern, range, length, or format.",
});

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
).annotations({
  title: "Enforcement Level",
  description:
    "How strictly a validator is enforced: required (error), recommended (warning), or optional (info).",
});

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
  params: S.optional(
    S.Struct({
      min: S.optional(S.Number.annotations({ description: "Minimum value for range validation." })),
      max: S.optional(S.Number.annotations({ description: "Maximum value for range validation." })),
      inclusive: S.optional(
        S.Boolean.annotations({ description: "Whether range bounds are inclusive." }),
      ),
      minLength: S.optional(S.Number.annotations({ description: "Minimum string length." })),
      maxLength: S.optional(S.Number.annotations({ description: "Maximum string length." })),
      pattern: S.optional(
        S.String.annotations({ description: "Regular expression pattern to match." }),
      ),
      flags: S.optional(S.String.annotations({ description: "Regular expression flags." })),
      format: S.optional(
        S.Literal("email", "url", "uuid", "iso8601", "decimal-degrees", "integer").annotations({
          description: "Expected value format.",
        }),
      ),
      allowEmpty: S.optional(
        S.Boolean.annotations({ description: "Allow empty string values." }),
      ),
      allowWhitespace: S.optional(
        S.Boolean.annotations({ description: "Allow whitespace-only values." }),
      ),
      custom: S.optional(S.Record({ key: S.String, value: S.Unknown })),
    }).annotations({
      title: "Validator Parameters",
      description: "Parameters for the validator, varying by validator type.",
    }),
  ),
  message: S.optional(
    S.String.annotations({ description: "Custom error message for validation failures." }),
  ),
}).annotations({
  title: "Validator Configuration",
  description:
    "Configuration for a field validator with type, enforcement level, and optional parameters.",
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

/**
 * Map VocabularyEnforcement to EnforcementLevel
 *
 * Converts vocabulary-specific enforcement to standard enforcement levels:
 * - strict → required (ERROR)
 * - recommended → recommended (WARNING)
 * - loose → optional (no violations generated - any value accepted)
 */
export function vocabularyEnforcementToStandard(
  vocabEnforcement: VocabularyEnforcement,
): EnforcementLevel {
  switch (vocabEnforcement) {
    case "strict":
      return "required";
    case "recommended":
      return "recommended";
    case "loose":
      return "optional";
  }
}
