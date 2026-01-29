/**
 * @dwkt/domain - Domain layer: types, schemas, and business rules
 */

// Types
export * from "./src/types/validation-violation.ts";
export * from "./src/types/workspace-validation.ts";

// Note: enrichCrossDatasetViolation is exported via validation-violation.ts wildcard export above

// Schemas
export * from "./src/schemas/primitives.ts";
export * from "./src/schemas/schema.ts";
export * from "./src/schemas/validation-profile.ts";
export * from "./src/schemas/workspace-config.ts";

// Error handling and utilities
export * from "./src/errors/index.ts";

// Darwin Core Specifications
export * from "./src/specs/dwc/index.ts";

// Field normalization
export * from "./src/specs/field-definition.ts";

// Validation Profiles
export * from "./src/specs/profiles/obis-event.ts";
export * from "./src/specs/profiles/obis.ts";
export * from "./src/specs/profiles/registry.ts";
