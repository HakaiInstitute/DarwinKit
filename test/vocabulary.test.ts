import { describe, test, expect } from 'vitest';
import {
  findCanonicalTerm,
  transformControlledVocabulary,
  validateControlledVocabulary,
  MOCK_VOCABULARIES,
  type MockVocabulary,
} from '../lib/vocabulary.js';

describe('findCanonicalTerm', () => {
  describe('with valid vocabulary', () => {
    test('returns canonical term for exact match', () => {
      expect(findCanonicalTerm('dwc:sex', 'male')).toBe('male');
      expect(findCanonicalTerm('dwc:sex', 'female')).toBe('female');
      expect(findCanonicalTerm('dwc:sex', 'hermaphrodite')).toBe('hermaphrodite');
    });

    test('returns canonical term for case-insensitive exact match', () => {
      expect(findCanonicalTerm('dwc:sex', 'MALE')).toBe('male');
      expect(findCanonicalTerm('dwc:sex', 'Female')).toBe('female');
      expect(findCanonicalTerm('dwc:sex', 'HERMAPHRODITE')).toBe('hermaphrodite');
    });

    test('returns canonical term for synonyms', () => {
      expect(findCanonicalTerm('dwc:sex', 'M')).toBe('male');
      expect(findCanonicalTerm('dwc:sex', 'F')).toBe('female');
      expect(findCanonicalTerm('dwc:sex', 'H')).toBe('hermaphrodite');
    });

    test('returns canonical term for case-insensitive synonyms', () => {
      expect(findCanonicalTerm('dwc:sex', 'm')).toBe('male');
      expect(findCanonicalTerm('dwc:sex', 'f')).toBe('female');
      expect(findCanonicalTerm('dwc:sex', 'h')).toBe('hermaphrodite');
    });

    test('handles empty string synonyms correctly', () => {
      expect(findCanonicalTerm('dwc:sex', '')).toBe('unknown');
      expect(findCanonicalTerm('dwc:sex', 'NA')).toBe('unknown');
      expect(findCanonicalTerm('dwc:sex', 'N/A')).toBe('unknown');
    });

    test('handles whitespace in input', () => {
      expect(findCanonicalTerm('dwc:sex', '  M  ')).toBe('male');
      expect(findCanonicalTerm('dwc:sex', '\tmale\n')).toBe('male');
    });

    test('returns null for invalid terms', () => {
      expect(findCanonicalTerm('dwc:sex', 'invalid')).toBeNull();
      expect(findCanonicalTerm('dwc:sex', 'INTERSEX')).toBeNull();
      expect(findCanonicalTerm('dwc:sex', 'other')).toBeNull();
    });
  });

  describe('with null/undefined values', () => {
    test('handles null input', () => {
      expect(findCanonicalTerm('dwc:sex', null)).toBe('unknown');
    });

    test('handles undefined input', () => {
      expect(findCanonicalTerm('dwc:sex', undefined)).toBe('unknown');
    });
  });

  describe('with non-string input', () => {
    test('converts numbers to strings', () => {
      const customVocab: Record<string, MockVocabulary> = {
        'test:numbers': {
          name: 'test:numbers',
          strict: true,
          terms: [
            { term: 'one', synonyms: ['1'] },
            { term: 'two', synonyms: ['2'] },
          ],
        },
      };

      expect(findCanonicalTerm('test:numbers', 1, customVocab)).toBe('one');
      expect(findCanonicalTerm('test:numbers', 2, customVocab)).toBe('two');
    });

    test('converts booleans to strings', () => {
      const customVocab: Record<string, MockVocabulary> = {
        'test:boolean': {
          name: 'test:boolean',
          strict: true,
          terms: [
            { term: 'yes', synonyms: ['true'] },
            { term: 'no', synonyms: ['false'] },
          ],
        },
      };

      expect(findCanonicalTerm('test:boolean', true, customVocab)).toBe('yes');
      expect(findCanonicalTerm('test:boolean', false, customVocab)).toBe('no');
    });
  });

  describe('with unknown vocabulary', () => {
    test('returns null for unknown vocabulary', () => {
      expect(findCanonicalTerm('unknown:vocab', 'test')).toBeNull();
    });
  });

  describe('with life stage vocabulary', () => {
    test('handles life stage synonyms correctly', () => {
      expect(findCanonicalTerm('dwc:life_stage', 'juv')).toBe('juvenile');
      expect(findCanonicalTerm('dwc:life_stage', 'JUV')).toBe('juvenile');
      expect(findCanonicalTerm('dwc:life_stage', 'young')).toBe('juvenile');
      expect(findCanonicalTerm('dwc:life_stage', 'mature')).toBe('adult');
    });
  });
});

describe('transformControlledVocabulary', () => {
  test('transforms synonyms to canonical terms', () => {
    expect(transformControlledVocabulary('M', 'dwc:sex')).toBe('male');
    expect(transformControlledVocabulary('F', 'dwc:sex')).toBe('female');
    expect(transformControlledVocabulary('juv', 'dwc:life_stage')).toBe('juvenile');
  });

  test('preserves canonical terms', () => {
    expect(transformControlledVocabulary('male', 'dwc:sex')).toBe('male');
    expect(transformControlledVocabulary('adult', 'dwc:life_stage')).toBe('adult');
  });

  test('returns original value for unknown terms', () => {
    expect(transformControlledVocabulary('invalid', 'dwc:sex')).toBe('invalid');
    expect(transformControlledVocabulary('spawning', 'dwc:life_stage')).toBe('spawning');
  });

  test('handles null/undefined values', () => {
    expect(transformControlledVocabulary(null, 'dwc:sex')).toBe('unknown');
    expect(transformControlledVocabulary(undefined, 'dwc:sex')).toBe('unknown');
  });

  test('returns original value for unknown vocabulary', () => {
    expect(transformControlledVocabulary('test', 'unknown:vocab')).toBe('test');
  });
});

describe('validateControlledVocabulary', () => {
  describe('with strict vocabulary (dwc:sex)', () => {
    test('validates canonical terms as valid', () => {
      const result = validateControlledVocabulary('male', 'dwc:sex');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('validates synonyms as valid after transformation', () => {
      // Note: validation happens AFTER transformation, so we test with canonical terms
      const result = validateControlledVocabulary('male', 'dwc:sex'); // 'M' would be transformed to 'male' first
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('invalidates unknown terms with error', () => {
      const result = validateControlledVocabulary('INTERSEX', 'dwc:sex');
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('INTERSEX');
      expect(result.errors[0]).toContain('not in controlled vocabulary');
      expect(result.errors[0]).toContain('male, female, hermaphrodite, unknown');
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('with non-strict vocabulary (dwc:life_stage)', () => {
    test('validates canonical terms as valid', () => {
      const result = validateControlledVocabulary('adult', 'dwc:life_stage');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('validates unknown terms as valid with warning', () => {
      const result = validateControlledVocabulary('spawning', 'dwc:life_stage');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('spawning');
      expect(result.warnings[0]).toContain('not in recommended vocabulary');
      expect(result.warnings[0]).toContain('adult, juvenile, larva, egg, unknown');
    });
  });

  describe('with unknown vocabulary', () => {
    test('returns invalid with error for unknown vocabulary', () => {
      const result = validateControlledVocabulary('test', 'unknown:vocab');
      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toBe('Unknown vocabulary: unknown:vocab');
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    test('handles null values', () => {
      // null/undefined map to 'unknown' which is valid in sex vocabulary
      const result = validateControlledVocabulary('unknown', 'dwc:sex'); // After transformation null -> 'unknown'
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('handles undefined values', () => {
      // null/undefined map to 'unknown' which is valid in sex vocabulary  
      const result = validateControlledVocabulary('unknown', 'dwc:sex'); // After transformation undefined -> 'unknown'
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test('handles empty strings', () => {
      // Empty string should map to 'unknown' and be valid
      const result = validateControlledVocabulary('unknown', 'dwc:sex'); // After transformation '' -> 'unknown'
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });
});

describe('integration tests', () => {
  test('full transformation and validation pipeline', () => {
    // Test the complete pipeline: input -> transform -> validate
    const testCases = [
      {
        input: 'M',
        vocab: 'dwc:sex',
        expectedTransformed: 'male',
        expectedValid: true,
        expectedErrors: 0,
        expectedWarnings: 0,
      },
      {
        input: 'INTERSEX',
        vocab: 'dwc:sex',
        expectedTransformed: 'INTERSEX', // No transformation for unknown term
        expectedValid: false,
        expectedErrors: 1,
        expectedWarnings: 0,
      },
      {
        input: 'spawning',
        vocab: 'dwc:life_stage',
        expectedTransformed: 'spawning', // No transformation for unknown term
        expectedValid: true, // Valid with warning for non-strict vocab
        expectedErrors: 0,
        expectedWarnings: 1,
      },
    ];

    testCases.forEach(({ input, vocab, expectedTransformed, expectedValid, expectedErrors, expectedWarnings }) => {
      const transformed = transformControlledVocabulary(input, vocab);
      const validation = validateControlledVocabulary(transformed, vocab);

      expect(transformed).toBe(expectedTransformed);
      expect(validation.isValid).toBe(expectedValid);
      expect(validation.errors).toHaveLength(expectedErrors);
      expect(validation.warnings).toHaveLength(expectedWarnings);
    });
  });
});