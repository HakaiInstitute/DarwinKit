/**
 * Darwin Core specifications - Barrel exports
 *
 * Central export point for all Darwin Core field definitions,
 * vocabularies, validators, and utility functions.
 */

// Base types and interfaces
export type { DataSpecification, SpecificationError } from "../base.ts";
export type {
  IdentifierConfig,
  LocationConfig,
  MeasurementConfig,
  TaxonomyConfig,
  TemporalConfig,
} from "../field-config.ts";
export type { ValidatorConfig, ValidatorParams } from "../validators.ts";

// Vocabulary types and configurations
export type { VocabularyConfig, VocabularyValidationResult } from "../vocabularies/config.ts";
export type { VocabularyKey, VocabularyValues } from "../vocabularies/registry.ts";

// Semantic types and descriptions
export {
  isGeographic,
  isMeasurement,
  SEMANTIC_TYPE_DESCRIPTIONS,
  SemanticType,
  usesControlledVocabulary,
} from "../semantic-types.ts";

// Validators and enforcement
export { DARWIN_CORE_VALIDATORS, EnforcementLevel, ValidatorType } from "../validators.ts";

// Controlled vocabularies
export {
  createVocabularyConfig,
  DARWIN_CORE_VOCABULARY_CONFIGS,
  VocabularyEnforcement,
} from "../vocabularies/config.ts";
export {
  getVocabularyKeys,
  getVocabularyValues,
  isValidVocabularyValue,
  VOCABULARIES,
} from "../vocabularies/registry.ts";

// Field definition utilities
export { hasControlledVocabulary } from "../field-config.ts";
