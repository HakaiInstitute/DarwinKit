/**
 * Controlled vocabulary configuration types
 *
 * Defines how fields relate to controlled vocabularies and
 * how strictly vocabulary constraints are enforced.
 */

import * as S from "effect/Schema";
import type { VocabularyKey } from "./registry.ts";

/**
 * Vocabulary enforcement levels
 */
export const VocabularyEnforcement = S.Literal(
  "strict", // Only vocabulary values allowed, validation fails with errors
  "recommended", // Vocabulary values preferred, warnings for non-vocabulary values
  "loose", // Any value accepted, no violations generated
);

export type VocabularyEnforcement = S.Schema.Type<typeof VocabularyEnforcement>;

/**
 * Configuration for field's relationship to controlled vocabulary
 */
export interface VocabularyConfig {
  readonly vocabularyKey: VocabularyKey;
  readonly enforcement: VocabularyEnforcement;
  readonly allowCustomValues?: boolean; // Allow values not in vocabulary (overrides strict)
  readonly caseSensitive?: boolean; // Whether vocabulary matching is case sensitive
  readonly normalizeValues?: boolean; // Whether to normalize values (trim, lowercase, etc.)
  readonly suggestionThreshold?: number; // Similarity threshold for suggesting corrections (0-1)
}
