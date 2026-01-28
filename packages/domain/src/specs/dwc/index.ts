/**
 * Darwin Core specifications - Barrel exports
 *
 * Central export point for all Darwin Core field definitions,
 * vocabularies, validators, and utility functions.
 */

// Base types and interfaces
export type { DataSpecification, SpecificationError } from "../base.ts";
export type { ValidatorConfig, ValidatorParams } from "../validators.ts";

// Vocabulary types and configurations
export type { VocabularyConfig, VocabularyValidationResult } from "../vocabularies/config.ts";
export type { VocabularyKey, VocabularyValues } from "../vocabularies/registry.ts";

// Validators and enforcement
export {
  DARWIN_CORE_VALIDATORS,
  EnforcementLevel,
  hasControlledVocabulary,
  ValidatorType,
} from "../validators.ts";

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
