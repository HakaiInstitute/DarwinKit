/**
 * Validation Profile Types
 *
 * Defines validation profiles that layer additional requirements on top of
 * base Darwin Core specifications. Profiles represent target-specific needs
 * (e.g., OBIS, GBIF) or custom validation criteria.
 *
 * Merge Priority: field override > profile > base spec
 */

import type { ValidatorConfig } from "../specs/validators.ts";

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
 * Field-level validation overrides
 *
 * Allows profiles to modify validation behavior for specific fields
 * without changing the base spec.
 */
export interface FieldOverride {
  /** Requirement level for this field in the profile */
  readonly requirement?: FieldRequirementLevel;

  /** Add or override validators */
  readonly validators?: readonly ValidatorConfig[];

  /** Override enforcement level for existing validators */
  readonly enforcement?: "required" | "recommended" | "optional";
}

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
  readonly validators: string[];
  readonly values?: string[];
}


/**
 * Validation Profile
 *
 * Defines a set of validation requirements for a specific target or purpose.
 * Profiles are layered on top of base Darwin Core specifications and can
 * extend other profiles to create a hierarchy.
 */
export interface ValidationProfile {
  /** Unique profile identifier (e.g., "obis-event", "gbif-occurrence") */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Description of profile purpose and requirements */
  readonly description: string;

  /** Target schema or system */
  readonly targetSchema: "obis" | "gbif" | "custom";

  /** Parent profile to inherit from (e.g., "obis" for "obis-event") */
  readonly extends?: string;

  /** Field-specific validation overrides and requirements */
  readonly fieldOverrides: Record<string, FieldOverride>;

  readonly fields?: Record<string, field>;
  /** External documentation URL */
  readonly documentationUrl?: string;

  /** Profile version */
  readonly version?: string;

  /** Profile metadata */
  readonly metadata?: {
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly author?: string;
  };
}

/**
 * Registry of available validation profiles
 */
export interface ValidationProfileRegistry {
  readonly [profileId: string]: ValidationProfile;
}
