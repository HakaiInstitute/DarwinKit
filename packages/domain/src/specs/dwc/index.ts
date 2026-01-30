/**
 * Darwin Core specifications - Barrel exports
 *
 * Central export point for all Darwin Core field definitions,
 * vocabularies, validators, and utility functions.
 */

// Base types and interfaces
export type { ValidatorConfig, ValidatorParams } from "../validators.ts";

// Vocabulary types and configurations
export type { VocabularyConfig } from "../vocabularies/config.ts";
export type { VocabularyKey, VocabularyValues } from "../vocabularies/registry.ts";

// Validators and enforcement
export {
  EnforcementLevel,
  hasControlledVocabulary,
  ValidatorType,
  vocabularyEnforcementToStandard,
} from "../validators.ts";

// Controlled vocabularies
export { VocabularyEnforcement } from "../vocabularies/config.ts";
export {
  getVocabularyValues,
  isValidVocabularyValue,
  VOCABULARIES,
} from "../vocabularies/registry.ts";
