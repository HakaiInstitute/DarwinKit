// Vocabulary types and functions extracted from demo for testing

export interface VocabularyTerm {
  term: string;
  synonyms: string[];
}

export interface MockVocabulary {
  name: string;
  strict: boolean;
  terms: VocabularyTerm[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Mock vocabularies for testing
export const MOCK_VOCABULARIES: Record<string, MockVocabulary> = {
  "dwc:sex": {
    name: "dwc:sex",
    strict: true,
    terms: [
      { term: "male", synonyms: ["M", "MALE", "Male", "m"] },
      { term: "female", synonyms: ["F", "FEMALE", "Female", "f"] },
      {
        term: "hermaphrodite",
        synonyms: ["H", "HERMAPHRODITE", "Hermaphrodite", "h"],
      },
      {
        term: "unknown",
        synonyms: ["U", "UNKNOWN", "Unknown", "u", "NA", "N/A", ""],
      },
    ],
  },
  "dwc:life_stage": {
    name: "dwc:life_stage",
    strict: false,
    terms: [
      { term: "adult", synonyms: ["ADULT", "Adult", "mature"] },
      {
        term: "juvenile",
        synonyms: ["JUVENILE", "Juvenile", "juv", "JUV", "young"],
      },
      { term: "larva", synonyms: ["LARVA", "Larva", "larvae", "larval"] },
      { term: "egg", synonyms: ["EGG", "Egg", "eggs", "embryo"] },
      {
        term: "unknown",
        synonyms: ["UNKNOWN", "Unknown", "U", "NA", "N/A", ""],
      },
    ],
  },
  "dwc:basis_of_record": {
    name: "dwc:basis_of_record",
    strict: true,
    terms: [
      { term: "HumanObservation", synonyms: ["observation", "obs", "human"] },
      {
        term: "MachineObservation",
        synonyms: ["machine", "sensor", "automated"],
      },
      {
        term: "PreservedSpecimen",
        synonyms: ["specimen", "preserved", "museum"],
      },
      { term: "LivingSpecimen", synonyms: ["living", "live", "captive"] },
      { term: "FossilSpecimen", synonyms: ["fossil", "fossilized"] },
    ],
  },
};

/**
 * Find canonical term in vocabulary (handles synonyms)
 */
export function findCanonicalTerm(
  vocabularyName: string,
  inputValue: unknown,
  vocabularies: Record<string, MockVocabulary> = MOCK_VOCABULARIES
): string | null {
  if (inputValue === null || inputValue === undefined) {
    inputValue = "";
  }

  const vocab = vocabularies[vocabularyName];
  if (!vocab) return null;

  const inputStr = String(inputValue).trim();

  for (const termData of vocab.terms) {
    // Check canonical term
    if (termData.term.toLowerCase() === inputStr.toLowerCase()) {
      return termData.term;
    }

    // Check synonyms
    for (const synonym of termData.synonyms) {
      if (synonym.toLowerCase() === inputStr.toLowerCase()) {
        return termData.term;
      }
    }
  }

  return null;
}

/**
 * Transform value using controlled vocabulary
 */
export function transformControlledVocabulary(
  value: unknown,
  vocabularyName: string,
  vocabularies: Record<string, MockVocabulary> = MOCK_VOCABULARIES
): string | null | unknown {
  const canonicalTerm = findCanonicalTerm(vocabularyName, value, vocabularies);
  return canonicalTerm || value; // Return original if no match found
}

/**
 * Validate value using controlled vocabulary
 */
export function validateControlledVocabulary(
  value: unknown,
  vocabularyName: string,
  vocabularies: Record<string, MockVocabulary> = MOCK_VOCABULARIES
): ValidationResult {
  const vocab = vocabularies[vocabularyName];
  if (!vocab) {
    return {
      isValid: false,
      errors: [`Unknown vocabulary: ${vocabularyName}`],
      warnings: [],
    };
  }

  const canonicalTerm = findCanonicalTerm(vocabularyName, value, vocabularies);
  const isValid = canonicalTerm !== null;

  if (!isValid) {
    const allTerms = vocab.terms.map((t) => t.term);

    if (vocab.strict) {
      return {
        isValid: false,
        errors: [
          `Value "${value}" is not in controlled vocabulary "${vocabularyName}". Allowed: ${allTerms.join(
            ", "
          )}`,
        ],
        warnings: [],
      };
    } else {
      return {
        isValid: true, // Valid with warnings for non-strict vocabularies
        errors: [],
        warnings: [
          `Value "${value}" is not in recommended vocabulary "${vocabularyName}". Recommended: ${allTerms.join(
            ", "
          )}`,
        ],
      };
    }
  }

  return { isValid: true, errors: [], warnings: [] };
}