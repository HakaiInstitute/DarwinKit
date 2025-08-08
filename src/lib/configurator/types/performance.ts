/**
 * Performance Optimizations for DarwinKit Type System
 *
 * Addresses common performance bottlenecks in type checking and validation.
 */

import type { SomePrimitive, VocabularyTerm, MockVocabulary } from "./core";

// Efficient vocabulary lookup using Map instead of array iteration
export class OptimizedVocabulary {
  private readonly termMap: ReadonlyMap<string, boolean>;
  private readonly synonymMap: ReadonlyMap<string, string>;

  constructor(
    public readonly name: string,
    public readonly strict: boolean,
    terms: readonly VocabularyTerm[]
  ) {
    const termEntries: [string, boolean][] = [];
    const synonymEntries: [string, string][] = [];

    for (const termData of terms) {
      termEntries.push([termData.term.toLowerCase(), true]);

      for (const synonym of termData.synonyms) {
        synonymEntries.push([synonym.toLowerCase(), termData.term]);
      }
    }

    this.termMap = new Map(termEntries);
    this.synonymMap = new Map(synonymEntries);
  }

  hasValue(value: string): boolean {
    const searchValue = value.toLowerCase();
    return this.termMap.has(searchValue) || this.synonymMap.has(searchValue);
  }

  normalizeValue(value: string): string | null {
    const searchValue = value.toLowerCase();

    if (this.termMap.has(searchValue)) {
      return value; // Return original casing if exact term
    }

    const synonymMatch = this.synonymMap.get(searchValue);
    if (synonymMatch) {
      return synonymMatch;
    }

    return null;
  }

  static fromMockVocabulary(mock: MockVocabulary): OptimizedVocabulary {
    return new OptimizedVocabulary(mock.name, mock.strict, mock.terms);
  }
}

// Vocabulary cache for reused lookups
export class VocabularyCache {
  private readonly cache = new Map<string, OptimizedVocabulary>();

  get(name: string, vocabularies: Record<string, MockVocabulary>): OptimizedVocabulary | null {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    const mockVocab = vocabularies[name];
    if (!mockVocab) {
      return null;
    }

    const optimized = OptimizedVocabulary.fromMockVocabulary(mockVocab);
    this.cache.set(name, optimized);
    return optimized;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Global vocabulary cache instance
export const vocabularyCache = new VocabularyCache();

// Efficient type checking utilities
export const isPrimitive = (value: unknown): value is SomePrimitive => {
  const type = typeof value;
  return (
    value === null ||
    value === undefined ||
    type === "string" ||
    type === "number" ||
    type === "boolean" ||
    value instanceof Date ||
    (type === "object" && value !== null && "toString" in value)
  );
};

export const isNonEmptyString = (value: SomePrimitive): value is string => {
  return typeof value === "string" && value.trim().length > 0;
};

export const isNumeric = (value: SomePrimitive): value is number | string => {
  if (typeof value === "number") {
    return !isNaN(value) && isFinite(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 && !isNaN(Number(trimmed));
  }

  return false;
};

// Memory-efficient result accumulator
export class ResultAccumulator<T> {
  private readonly results: T[] = [];
  private errorCount = 0;
  private warningCount = 0;

  add(result: T & { success?: boolean; errors?: string[]; warnings?: string[] }): void {
    this.results.push(result);

    if (result.errors) {
      this.errorCount += result.errors.length;
    }

    if (result.warnings) {
      this.warningCount += result.warnings.length;
    }
  }

  getResults(): readonly T[] {
    return this.results;
  }

  getStats() {
    return {
      total: this.results.length,
      errorCount: this.errorCount,
      warningCount: this.warningCount,
      successCount: this.results.length - this.errorCount,
    };
  }

  clear(): void {
    this.results.length = 0;
    this.errorCount = 0;
    this.warningCount = 0;
  }
}

// Efficient string interning for repeated field names
export class StringInterner {
  private readonly internedStrings = new Map<string, string>();

  intern(str: string): string {
    const existing = this.internedStrings.get(str);
    if (existing !== undefined) {
      return existing;
    }

    this.internedStrings.set(str, str);
    return str;
  }

  size(): number {
    return this.internedStrings.size;
  }

  clear(): void {
    this.internedStrings.clear();
  }
}

// Global string interner for field names
export const fieldNameInterner = new StringInterner();

// Batch processing utilities
export const processBatch = async <T, R>(
  items: readonly T[],
  processor: (item: T, index: number) => Promise<R> | R,
  batchSize = 100
): Promise<R[]> => {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchPromises = batch.map((item, batchIndex) => processor(item, i + batchIndex));

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }

  return results;
};

// Efficient object property access
export const getProperty = (obj: Record<string, SomePrimitive>, key: string): SomePrimitive => {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
};

// Type-safe property setter
export const setProperty = (
  obj: Record<string, SomePrimitive>,
  key: string,
  value: SomePrimitive
): void => {
  obj[key] = value;
};

// Memory usage tracking (for development/debugging)
export interface MemoryStats {
  readonly vocabularyCacheSize: number;
  readonly fieldNameCacheSize: number;
  readonly estimatedMemoryUsage: number; // in bytes
}

export const getMemoryStats = (): MemoryStats => {
  return {
    vocabularyCacheSize: vocabularyCache.size(),
    fieldNameCacheSize: fieldNameInterner.size(),
    estimatedMemoryUsage: vocabularyCache.size() * 1000 + fieldNameInterner.size() * 50, // rough estimate
  };
};

// Cleanup utilities
export const clearAllCaches = (): void => {
  vocabularyCache.clear();
  fieldNameInterner.clear();
};
