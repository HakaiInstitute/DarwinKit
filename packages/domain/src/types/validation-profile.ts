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
 */
export enum FieldRequirementLevel {
  /** Field must be present and contain a non-null value (fails validation if missing/null) */
  Required = "required",

  /** Field should be present; generates warning if missing but doesn't fail validation */
  StronglyRecommended = "strongly-recommended",

  /** Field is recommended but not critical; generates info message if missing */
  Recommended = "recommended",

  /** Field doesn't need to be present, but if it is, it must be valid */
  RequiredIfExists = "required-if-exists",

  /** Field is completely optional; no validation requirements */
  Optional = "optional",
}

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
export interface field {
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
