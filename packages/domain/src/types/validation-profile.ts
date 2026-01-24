/**
 * Validation Profile Types
 *
 * Defines validation profiles that layer additional requirements on top of
 * base Darwin Core specifications. Profiles represent target-specific needs
 * (e.g., OBIS, GBIF) or custom validation criteria.
 *
 * ## Dual-Purpose Field Storage
 *
 * ValidationProfile maintains two representations of field metadata:
 *
 * 1. **fields**: Raw field metadata from JSON schema
 *    - Used by transformation logic for SQL DDL generation
 *    - Contains: type, unique, values (controlled vocabularies)
 *    - Format matches Darwin Core JSON schema structure
 *
 * 2. **normalizedFields**: Processed field definitions
 *    - Used by validation logic for data quality checks
 *    - Contains: validators (structured), vocabulary (processed)
 *    - Provides consistent structure regardless of source format
 *
 * This separation allows transformation and validation to operate independently
 * while sharing the same profile definition.
 *
 * Merge Priority: field override > profile > base spec
 */

import type * as S from "effect/Schema";
import type {
  fieldOverrideSchema,
  validationProfileRegistrySchema,
  validationProfileSchema,
} from "../schemas/validation-profile.ts";

/**
 * Field requirement levels for validation profiles
 *
 * Defines the strength of a field requirement in a validation profile.
 *
 * Uses Effect's Schema.Enums for a consolidated pattern.
 */

/**
 * Field requirement level enum values
 *
 * @example
 * ```typescript
 * // Discoverable via autocomplete: FieldRequirementLevels.<ctrl+space>
 * requirement: FieldRequirementLevels.REQUIRED
 *
 * // Or use string literal directly (when type is known)
 * requirement: "required"
 * ```
 */
export const FieldRequirementLevels = {
  /** Field must be present and contain a non-null value (fails validation if missing/null) */
  REQUIRED: "required",
  /** Field should be present; generates warning if missing but doesn't fail validation */
  STRONGLY_RECOMMENDED: "strongly-recommended",
  /** Field is recommended but not critical; generates info message if missing */
  RECOMMENDED: "recommended",
  /** Field doesn't need to be present, but if it is, it must be valid */
  REQUIRED_IF_EXISTS: "required-if-exists",
  /** Field is completely optional; no validation requirements */
  OPTIONAL: "optional",
} as const;

export type FieldRequirementLevel =
  typeof FieldRequirementLevels[keyof typeof FieldRequirementLevels];

/**
 * Raw field definition from JSON schema
 *
 * Represents the raw structure of fields in the dwcSchema.json file.
 *
 * @internal This type is used internally for normalization and should not be used
 * directly in application code. Use NormalizedField instead for validation logic.
 *
 * Validators can be either strings (legacy format) or ValidatorConfig objects.
 * The lowercase naming indicates this is a raw format from JSON schema.
 */
export interface Field {
  readonly group: string;
  readonly name: string;
  readonly label: string;
  readonly namespace: string;
  readonly qualName: string;
  readonly "dc:relation": string;
  readonly "dc:description": string;
  readonly gbif_required: string;
  readonly type: string;
  readonly obis_required: string;
  readonly validators?: ReadonlyArray<string | Record<string, unknown>>;
  readonly values?: Record<string, unknown>;
  readonly comments?: string;
  readonly examples?: string;
  readonly unique?: string;
}

// Types derived from schemas
export type FieldOverride = S.Schema.Type<typeof fieldOverrideSchema>;
export type ValidationProfile = S.Schema.Type<typeof validationProfileSchema>;
export type ValidationProfileRegistry = S.Schema.Type<typeof validationProfileRegistrySchema>;
