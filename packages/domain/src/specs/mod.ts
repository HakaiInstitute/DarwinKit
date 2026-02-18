/**
 * @dwkt/domain/specs - Darwin Core specifications, profiles, and vocabularies
 */

// Field normalization
export * from "./field-definition.ts";

// Constraints
export * from "./constraints.ts";

// Constraint Presets
export * from "./constraint-presets.ts";

// Validation Profiles
export { OBIS_EVENT_PROFILE } from "./profiles/obis-event.ts";
export { OBIS_BASE_PROFILE } from "./profiles/obis.ts";
export { getValidationProfile, VALIDATION_PROFILES } from "./profiles/registry.ts";
