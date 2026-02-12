/**
 * @dwkt/domain/specs - Darwin Core specifications, profiles, and vocabularies
 */

// Darwin Core field definitions and barrel exports
export * from "./dwc/mod.ts";

// Field normalization
export * from "./field-definition.ts";

// Constraints
export * from "./constraints.ts";

// Constraint Presets
export * from "./constraint-presets.ts";

// Semantic Types
export * from "./semantic-type.ts";

// Validator utilities
export * from "./validators.ts";

// Validation Profiles
export { OBIS_EVENT_PROFILE } from "./profiles/obis-event.ts";
export { OBIS_BASE_PROFILE } from "./profiles/obis.ts";
export { getValidationProfile, VALIDATION_PROFILES } from "./profiles/registry.ts";

// Vocabularies
export * from "./vocabularies/config.ts";
export * from "./vocabularies/registry.ts";
