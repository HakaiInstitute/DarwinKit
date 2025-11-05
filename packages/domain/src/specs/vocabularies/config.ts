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
  "strict", // Only vocabulary values allowed, validation fails otherwise
  "recommended", // Vocabulary values preferred, warnings for non-vocabulary values
  "loose", // Vocabulary values suggested, any value accepted
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

/**
 * Effect Schema for VocabularyConfig
 */
export const VocabularyConfigSchema: S.Struct<{
  vocabularyKey: typeof S.String; // Note: VocabularyKey is a string literal union
  enforcement: typeof VocabularyEnforcement;
  allowCustomValues: S.optional<typeof S.Boolean>;
  caseSensitive: S.optional<typeof S.Boolean>;
  normalizeValues: S.optional<typeof S.Boolean>;
  suggestionThreshold: S.optional<typeof S.Number>;
}> = S.Struct({
  vocabularyKey: S.String,
  enforcement: VocabularyEnforcement,
  allowCustomValues: S.optional(S.Boolean),
  caseSensitive: S.optional(S.Boolean),
  normalizeValues: S.optional(S.Boolean),
  suggestionThreshold: S.optional(S.Number),
});

/**
 * Vocabulary validation result
 */
export interface VocabularyValidationResult {
  readonly isValid: boolean;
  readonly originalValue: string;
  readonly normalizedValue?: string;
  readonly suggestedValues?: readonly string[];
  readonly enforcement: VocabularyEnforcement;
  readonly message?: string;
}

/**
 * Effect Schema for VocabularyValidationResult
 */
export const VocabularyValidationResultSchema = S.Struct({
  isValid: S.Boolean,
  originalValue: S.String,
  normalizedValue: S.optional(S.String),
  suggestedValues: S.optional(S.Array(S.String)),
  enforcement: VocabularyEnforcement,
  message: S.optional(S.String),
});

/**
 * Pre-configured vocabulary configurations for common Darwin Core patterns
 */
export const DARWIN_CORE_VOCABULARY_CONFIGS = {
  // Strict vocabularies - only predefined values allowed
  strictVocabulary: (vocabularyKey: VocabularyKey): VocabularyConfig => ({
    vocabularyKey,
    enforcement: "strict",
    allowCustomValues: false,
    caseSensitive: false,
    normalizeValues: true,
    suggestionThreshold: 0.8,
  }),

  // Recommended vocabularies - prefer predefined values but allow others
  recommendedVocabulary: (vocabularyKey: VocabularyKey): VocabularyConfig => ({
    vocabularyKey,
    enforcement: "recommended",
    allowCustomValues: true,
    caseSensitive: false,
    normalizeValues: true,
    suggestionThreshold: 0.7,
  }),

  // Loose vocabularies - suggest predefined values but accept any
  looseVocabulary: (vocabularyKey: VocabularyKey): VocabularyConfig => ({
    vocabularyKey,
    enforcement: "loose",
    allowCustomValues: true,
    caseSensitive: false,
    normalizeValues: true,
    suggestionThreshold: 0.6,
  }),

  // Case-sensitive strict vocabulary (for precise identifiers)
  caseSensitiveVocabulary: (vocabularyKey: VocabularyKey): VocabularyConfig => ({
    vocabularyKey,
    enforcement: "strict",
    allowCustomValues: false,
    caseSensitive: true,
    normalizeValues: false,
    suggestionThreshold: 1.0,
  }),
} as const;

/**
 * Helper function to create vocabulary configuration
 */
export function createVocabularyConfig(
  vocabularyKey: VocabularyKey,
  enforcement: VocabularyEnforcement = "recommended",
  options?: Partial<Omit<VocabularyConfig, "vocabularyKey" | "enforcement">>,
): VocabularyConfig {
  return {
    vocabularyKey,
    enforcement,
    allowCustomValues: options?.allowCustomValues ?? (enforcement !== "strict"),
    caseSensitive: options?.caseSensitive ?? false,
    normalizeValues: options?.normalizeValues ?? true,
    suggestionThreshold: options?.suggestionThreshold ?? 0.7,
    ...options,
  };
}
