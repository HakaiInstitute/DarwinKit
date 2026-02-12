/**
 * Darwin Core specifications - Barrel exports
 *
 * Central export point for all Darwin Core field definitions,
 * vocabularies, validators, and utility functions.
 */

// Vocabulary types and configurations
export type { VocabularyConfig } from "../vocabularies/config.ts";
export type { VocabularyKey, VocabularyValues } from "../vocabularies/registry.ts";

// Controlled vocabularies
export { VocabularyEnforcement } from "../vocabularies/config.ts";
export {
  getVocabularyValues,
  isValidVocabularyValue,
  VOCABULARIES,
} from "../vocabularies/registry.ts";
