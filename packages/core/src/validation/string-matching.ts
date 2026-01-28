/**
 * String Utilities for Field Name Matching
 *
 * Provides fuzzy string matching using Levenshtein distance to help users
 * identify typos and suggest corrections when field names don't match.
 */

/**
 * Calculate Levenshtein distance between two strings
 *
 * The Levenshtein distance is the minimum number of single-character edits
 * (insertions, deletions, or substitutions) required to change one string
 * into another.
 *
 * This implementation uses space-optimized dynamic programming, keeping only
 * the previous row in memory rather than the full matrix.
 *
 * Time complexity: O(n * m) where n and m are string lengths
 * Space complexity: O(min(n, m))
 *
 * @param a First string
 * @param b Second string
 * @returns The edit distance between the two strings
 *
 * @example
 * levenshteinDistance("kitten", "sitting") // 3
 * levenshteinDistance("eventID", "evntID") // 2
 * levenshteinDistance("latitude", "decimalLatitude") // 7
 */
export function levenshteinDistance(a: string, b: string): number {
  // Handle empty strings
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string to minimize space usage
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  // Use two arrays: previous row and current row
  let prevRow: number[] = Array(a.length + 1);
  let currRow: number[] = Array(a.length + 1);

  // Initialize first row (distance from empty string)
  for (let i = 0; i <= a.length; i++) {
    prevRow[i] = i;
  }

  // Calculate each row
  for (let j = 1; j <= b.length; j++) {
    // First column: distance from empty string
    currRow[0] = j;

    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      currRow[i] = Math.min(
        currRow[i - 1] + 1, // Deletion (from current row)
        prevRow[i] + 1, // Insertion (from previous row)
        prevRow[i - 1] + cost, // Substitution (from previous row diagonal)
      );
    }

    // Swap rows for next iteration
    [prevRow, currRow] = [currRow, prevRow];
  }

  // Result is in prevRow (after the swap)
  return prevRow[a.length];
}

/**
 * Configuration for string matching
 */
export interface StringMatchOptions {
  /**
   * Maximum edit distance to consider for suggestions
   * Default: 2 (catches most typos without too many false positives)
   */
  readonly maxDistance?: number;

  /**
   * Maximum number of suggestions to return
   * Default: 3
   */
  readonly maxSuggestions?: number;

  /**
   * Whether to perform case-insensitive matching
   * Default: true
   */
  readonly caseInsensitive?: boolean;

  /**
   * Whether to normalize separators (replace _ and - with nothing)
   * Default: true
   */
  readonly normalizeSeparators?: boolean;
}

const DEFAULT_OPTIONS: Required<StringMatchOptions> = {
  maxDistance: 2,
  maxSuggestions: 3,
  caseInsensitive: true,
  normalizeSeparators: true,
};

/**
 * Normalize a string for matching
 */
function normalizeString(
  str: string,
  options: Required<StringMatchOptions>,
): string {
  let normalized = str;

  if (options.caseInsensitive) {
    normalized = normalized.toLowerCase();
  }

  if (options.normalizeSeparators) {
    normalized = normalized.replace(/[_-]/g, "");
  }

  return normalized;
}

/**
 * Match result with distance and original string
 */
export interface StringMatch {
  readonly value: string;
  readonly distance: number;
}

/**
 * Find closest matching strings using Levenshtein distance
 *
 * Returns strings ordered by edit distance, with the closest matches first.
 * Only returns matches within the maximum edit distance threshold.
 *
 * @param input The string to match against
 * @param options Array of possible matches
 * @param matchOptions Configuration for matching behavior
 * @returns Array of matches sorted by distance (closest first)
 *
 * @example
 * const fields = ["eventID", "eventDate", "eventType", "decimalLatitude"];
 *
 * findClosestMatches("evntID", fields)
 * // Returns: [{ value: "eventID", distance: 1 }]
 *
 * findClosestMatches("eventid", fields)
 * // Returns: [{ value: "eventID", distance: 0 }] (case-insensitive match)
 *
 * findClosestMatches("event", fields)
 * // Returns: [
 * //   { value: "eventID", distance: 2 },
 * //   { value: "eventDate", distance: 4 },
 * //   { value: "eventType", distance: 4 }
 * // ]
 */
export function findClosestMatches(
  input: string,
  options: readonly string[],
  matchOptions: StringMatchOptions = {},
): StringMatch[] {
  if (options.length === 0) return [];

  const opts = { ...DEFAULT_OPTIONS, ...matchOptions };
  const normalizedInput = normalizeString(input, opts);

  // Calculate distance for each option
  const matches = options
    .map((option) => {
      const normalizedOption = normalizeString(option, opts);
      const distance = levenshteinDistance(normalizedInput, normalizedOption);

      return {
        value: option, // Return original, not normalized
        distance,
      };
    })
    .filter((match) => match.distance <= opts.maxDistance)
    .sort((a, b) => {
      // Primary sort: by distance (closest first)
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      // Secondary sort: by length (shorter first - likely more relevant)
      if (a.value.length !== b.value.length) {
        return a.value.length - b.value.length;
      }
      // Tertiary sort: alphabetically
      return a.value.localeCompare(b.value);
    })
    .slice(0, opts.maxSuggestions);

  return matches;
}

/**
 * Find closest matching strings and return just the values
 *
 * Convenience wrapper around findClosestMatches that returns just the
 * string values without distance information.
 *
 * @param input The string to match against
 * @param options Array of possible matches
 * @param matchOptions Configuration for matching behavior
 * @returns Array of matching strings sorted by relevance
 */
export function findSuggestions(
  input: string,
  options: readonly string[],
  matchOptions: StringMatchOptions = {},
): string[] {
  return findClosestMatches(input, options, matchOptions).map((m) => m.value);
}

/**
 * Check if a string closely matches any option
 *
 * Returns true if the input has a close match (within max distance)
 * in the options list.
 *
 * @param input The string to check
 * @param options Array of valid options
 * @param matchOptions Configuration for matching behavior
 * @returns True if a close match exists
 */
export function hasCloseMatch(
  input: string,
  options: readonly string[],
  matchOptions: StringMatchOptions = {},
): boolean {
  if (options.length === 0) return false;

  const opts = { ...DEFAULT_OPTIONS, ...matchOptions };
  const normalizedInput = normalizeString(input, opts);

  return options.some((option) => {
    const normalizedOption = normalizeString(option, opts);
    return levenshteinDistance(normalizedInput, normalizedOption) <= opts.maxDistance;
  });
}

/**
 * Find suggested value using fuzzy matching (Levenshtein distance)
 *
 * Useful for providing helpful suggestions when a user enters
 * an invalid vocabulary value.
 *
 * @param invalidValue - The invalid value entered by the user
 * @param allowedValues - Array of valid values to match against
 * @param threshold - Maximum edit distance to consider (default: 3)
 * @returns The closest matching value, or undefined if none within threshold
 */
export function findSuggestedValue(
  invalidValue: string,
  allowedValues: ReadonlyArray<string>,
  threshold: number = 3,
): string | undefined {
  let bestMatch: string | undefined;
  let bestDistance = threshold;

  for (const allowed of allowedValues) {
    const distance = levenshteinDistance(invalidValue, allowed);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = allowed;
    }
  }

  return bestMatch;
}
