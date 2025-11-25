/**
 * Validation Profile Types
 *
 * Defines validation profiles that layer additional requirements on top of
 * base Darwin Core specifications. Profiles represent target-specific needs
 * (e.g., OBIS, GBIF) or custom validation criteria.
 *
 * Merge Priority: field override > profile > base spec
 */

import * as S from "effect/Schema";
import {
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

// Types derived from schemas
export type FieldOverride = S.Schema.Type<typeof fieldOverrideSchema>;
export type ValidationProfile = S.Schema.Type<typeof validationProfileSchema>;
export type ValidationProfileRegistry = S.Schema.Type<typeof validationProfileRegistrySchema>;
