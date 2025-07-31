import { eq } from "drizzle-orm";
import { db } from "../server/db/index";
import { controlledVocabularies, vocabularyTerms } from "../server/db/schema";

// Cached vocabularies to avoid repeated database queries
const vocabularyCache = new Map<string, VocabularyData>();

export interface VocabularyData {
  id: number;
  name: string;
  displayName: string;
  strict: boolean; // Default strictness from vocabulary
  terms: Array<{
    id: number;
    term: string;
    displayName?: string;
    synonyms: string[];
    deprecated: boolean;
  }>;
}

// Fetch vocabulary by name with caching
export async function getVocabulary(vocabularyName: string): Promise<VocabularyData | null> {
  // Check cache first
  if (vocabularyCache.has(vocabularyName)) {
    return vocabularyCache.get(vocabularyName)!;
  }

  try {
    // Fetch vocabulary with terms from database
    const vocabulary = await db.query.controlledVocabularies.findFirst({
      where: eq(controlledVocabularies.name, vocabularyName),
      with: {
        terms: {
          where: eq(vocabularyTerms.deprecated, false),
          orderBy: [vocabularyTerms.sortOrder, vocabularyTerms.term],
        },
      },
    });

    if (!vocabulary) {
      return null;
    }

    const vocabularyData: VocabularyData = {
      id: vocabulary.id,
      name: vocabulary.name,
      displayName: vocabulary.displayName,
      strict: vocabulary.strict,
      terms: vocabulary.terms.map(term => ({
        id: term.id,
        term: term.term,
        displayName: term.displayName || undefined,
        synonyms: Array.isArray(term.synonyms) ? term.synonyms as string[] : [],
        deprecated: term.deprecated,
      })),
    };

    // Cache the result
    vocabularyCache.set(vocabularyName, vocabularyData);
    
    return vocabularyData;
  } catch (error) {
    console.error(`Error fetching vocabulary "${vocabularyName}":`, error);
    return null;
  }
}

// Get all terms from a vocabulary (including synonyms)
export async function getVocabularyTerms(vocabularyName: string): Promise<string[]> {
  const vocabulary = await getVocabulary(vocabularyName);
  
  if (!vocabulary) {
    return [];
  }

  const allTerms: string[] = [];
  
  for (const termData of vocabulary.terms) {
    allTerms.push(termData.term);
    allTerms.push(...termData.synonyms);
  }

  return allTerms;
}

// Get canonical terms only (no synonyms)
export async function getCanonicalTerms(vocabularyName: string): Promise<string[]> {
  const vocabulary = await getVocabulary(vocabularyName);
  
  if (!vocabulary) {
    return [];
  }

  return vocabulary.terms.map(term => term.term);
}

// Find canonical term for a given input (handles synonyms)
export async function findCanonicalTerm(
  vocabularyName: string, 
  inputTerm: string,
  caseSensitive = false
): Promise<string | null> {
  const vocabulary = await getVocabulary(vocabularyName);
  
  if (!vocabulary) {
    return null;
  }

  const normalizedInput = caseSensitive ? inputTerm.trim() : inputTerm.trim().toLowerCase();

  for (const termData of vocabulary.terms) {
    // Check canonical term
    const canonicalTerm = caseSensitive ? termData.term : termData.term.toLowerCase();
    if (canonicalTerm === normalizedInput) {
      return termData.term;
    }

    // Check synonyms
    for (const synonym of termData.synonyms) {
      const normalizedSynonym = caseSensitive ? synonym : synonym.toLowerCase();
      if (normalizedSynonym === normalizedInput) {
        return termData.term;
      }
    }
  }

  return null;
}

// Clear vocabulary cache (useful for testing or when vocabularies are updated)
export function clearVocabularyCache(): void {
  vocabularyCache.clear();
}

// Pre-load vocabularies (useful for performance)
export async function preloadVocabularies(vocabularyNames: string[]): Promise<void> {
  await Promise.all(
    vocabularyNames.map(name => getVocabulary(name))
  );
}