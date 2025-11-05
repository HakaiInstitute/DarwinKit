/**
 * Parameterized validator system for specification compliance
 *
 * Validators are configured with parameters that default to
 * specification requirements (e.g., Darwin Core recommendations)
 * but can be customized per implementation needs.
 */

import * as S from "effect/Schema";

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
  readonly format?: "email" | "url" | "uuid" | "iso8601" | "decimal-degrees";

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
    format: S.optional(S.Literal("email", "url", "uuid", "iso8601", "decimal-degrees")),
    allowEmpty: S.optional(S.Boolean),
    allowWhitespace: S.optional(S.Boolean),
    custom: S.optional(S.Record({ key: S.String, value: S.Unknown })),
  })),
  message: S.optional(S.String),
});

/**
 * Pre-configured validators following Darwin Core recommendations
 */
export const DARWIN_CORE_VALIDATORS = {
  // Standard required field
  required: (): ValidatorConfig => ({
    type: "required",
    enforcement: "required",
    params: { allowEmpty: false, allowWhitespace: false },
  }),

  // Recommended field (generates warnings if missing)
  recommended: (): ValidatorConfig => ({
    type: "required",
    enforcement: "recommended",
    params: { allowEmpty: false, allowWhitespace: false },
  }),

  // Unique identifier (required and unique)
  uniqueIdentifier: (): ValidatorConfig => ({
    type: "unique",
    enforcement: "required",
    message: "Identifier must be unique within the dataset",
  }),

  // Decimal degree coordinates (-90 to +90 for latitude, -180 to +180 for longitude)
  latitude: (): ValidatorConfig => ({
    type: "range",
    enforcement: "required",
    params: { min: -90, max: 90, inclusive: true },
    message: "Latitude must be between -90 and +90 degrees",
  }),

  longitude: (): ValidatorConfig => ({
    type: "range",
    enforcement: "required",
    params: { min: -180, max: 180, inclusive: true },
    message: "Longitude must be between -180 and +180 degrees",
  }),

  // Depth measurements (positive values)
  depth: (): ValidatorConfig => ({
    type: "range",
    enforcement: "recommended",
    params: { min: 0, inclusive: true },
    message: "Depth should be a positive value in meters",
  }),

  // Year validation (reasonable range for biological specimens)
  year: (): ValidatorConfig => ({
    type: "range",
    enforcement: "recommended",
    params: { min: 1600, max: new Date().getFullYear(), inclusive: true },
    message: "Year should be within a reasonable historical range",
  }),

  // Month validation (1-12)
  month: (): ValidatorConfig => ({
    type: "range",
    enforcement: "required",
    params: { min: 1, max: 12, inclusive: true },
    message: "Month must be between 1 and 12",
  }),

  // Day validation (1-31, actual validation depends on month/year)
  day: (): ValidatorConfig => ({
    type: "range",
    enforcement: "required",
    params: { min: 1, max: 31, inclusive: true },
    message: "Day must be between 1 and 31",
  }),

  // ISO 8601 date format
  iso8601Date: (): ValidatorConfig => ({
    type: "format",
    enforcement: "recommended",
    params: { format: "iso8601" },
    message: "Date should follow ISO 8601 format (YYYY-MM-DD)",
  }),

  // UUID format for identifiers
  uuid: (): ValidatorConfig => ({
    type: "format",
    enforcement: "optional",
    params: { format: "uuid" },
    message: "Identifier should follow UUID format if using UUIDs",
  }),

  // URL format for web identifiers
  url: (): ValidatorConfig => ({
    type: "format",
    enforcement: "recommended",
    params: { format: "url" },
    message: "Web identifier should be a valid URL",
  }),
} as const;

/**
 * Type for pre-configured validator names
 */
export type DarwinCoreValidatorName = keyof typeof DARWIN_CORE_VALIDATORS;
