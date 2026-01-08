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
