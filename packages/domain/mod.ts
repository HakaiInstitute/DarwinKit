/**
 * @dwkt/domain - Domain layer: types, schemas, and business rules
 */

// Types
export * from "./src/types/common.ts";
export * from "./src/types/schema.ts";
export * from "./src/types/workspace.ts";
export * from "./src/types/workspace-config.ts";
export * from "./src/types/workspace-validation.ts";
export * from "./src/types/field-mapping.ts";
export * from "./src/types/validation-profile.ts";
export * from "./src/types/validation-violation.ts";
export * from "./src/types/transformation.ts";
export * from "./src/types/semantic-values.ts";
export { FieldRequirementLevel } from "./src/types/validation-profile.ts";

// Note: enrichCrossDatasetViolation is exported via validation-violation.ts wildcard export above

// Schemas
export * from "./src/schemas/schema.ts";
export * from "./src/schemas/workspace.ts";
export * from "./src/schemas/workspace-config.ts";
export * from "./src/schemas/validation-profile.ts";
export * from "./src/schemas/field-mapping.ts";
// Export validation schemas with renamed ValidationError to avoid conflict
export {
  type CoordinateWarning,
  coordinateWarningSchema,
  type DarwinCoreValidationResult,
  darwinCoreValidationResultSchema,
  type DateError,
  dateErrorSchema,
  type FieldError,
  fieldErrorSchema,
  type FileValidationContext,
  fileValidationContextSchema,
  type NullConversion,
  nullConversionSchema,
  type ParseValidationResult,
  parseValidationResultSchema,
  type RepositoryValidationResults,
  repositoryValidationResultsSchema,
  type TypeFailure,
  typeFailureSchema,
  type ValidationError as SchemaValidationError,
  type ValidationSummary,
  validationSummarySchema,
  type VocabularyError,
  vocabularyErrorSchema,
} from "./src/schemas/validation.ts";

// Error handling
export * from "./src/errors/codes.ts";
export * from "./src/errors/types.ts";
export * from "./src/errors/severity.ts";
export * from "./src/errors/presenter.ts";

// Error examples (for documentation and migration)
export * from "./src/errors/examples.ts";

// Utilities
export * from "./src/utils/cause-formatter.ts";

// Constants
export * from "./src/constants/darwin-core.ts";

// Darwin Core Specifications
export * from "./src/specs/dwc/index.ts";

// Validation Profiles
export * from "./src/specs/profiles/registry.ts";
export * from "./src/specs/profiles/obis.ts";
export * from "./src/specs/profiles/obis-event.ts";

// Note: Semantic validation (semantic-validator-effect.ts) is not yet exported
// It will be exported when it's fully tested and ready for use
