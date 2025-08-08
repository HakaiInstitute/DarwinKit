/**
 * Core Type Definitions for DarwinKit Configurator
 *
 * Centralized type definitions used across validation, transformation,
 * and configuration systems to eliminate duplication and ensure consistency.
 */

// Primitive and utility types
export type SomePrimitive = string | number | boolean | Date | StringableObject | null | undefined;

export interface StringableObject
  extends Record<string, string | number | boolean | Date | null | undefined> {
  toString(): string;
}

// Vocabulary types - centralized to eliminate 4x duplication
export interface VocabularyTerm {
  term: string;
  synonyms: string[];
}

export interface MockVocabulary {
  name: string;
  strict: boolean;
  terms: VocabularyTerm[];
}

export interface VocabularyData {
  id: string;
  name: string;
  terms: {
    id: string;
    term: string;
    synonyms: string[];
  }[];
}

// Global parameters interface
export interface GlobalParameters {
  vocabularies?: Record<string, MockVocabulary>;
  [key: string]: SomePrimitive | Record<string, MockVocabulary> | undefined;
}

// Dataset context for validation
export interface DatasetValidationContext<TRow = Record<string, SomePrimitive>> {
  currentRow: TRow;
  dataset: TRow[];
  rowIndex: number;

  // Utility functions for dataset-aware validations
  getFieldValues: (fieldName: string) => SomePrimitive[];
  findDuplicates: (fieldName: string, value: SomePrimitive) => number[];
  findRelatedRows: (predicate: (row: TRow) => boolean) => TRow[];
  hasValue: (fieldName: string, value: SomePrimitive) => boolean;

  // Performance cache for repeated lookups
  cache: Map<string, unknown>;
}
