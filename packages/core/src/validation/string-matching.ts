export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  let prevRow: number[] = Array(a.length + 1);
  let currRow: number[] = Array(a.length + 1);

  for (let i = 0; i <= a.length; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= b.length; j++) {
    currRow[0] = j;

    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      currRow[i] = Math.min(
        currRow[i - 1] + 1,
        prevRow[i] + 1,
        prevRow[i - 1] + cost,
      );
    }

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[a.length];
}

export interface StringMatchOptions {
  readonly maxDistance?: number;
  readonly maxSuggestions?: number;
  readonly caseInsensitive?: boolean;
  readonly normalizeSeparators?: boolean;
}

const DEFAULT_OPTIONS: Required<StringMatchOptions> = {
  maxDistance: 2,
  maxSuggestions: 3,
  caseInsensitive: true,
  normalizeSeparators: true,
};

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

export interface StringMatch {
  readonly value: string;
  readonly distance: number;
}

export function findClosestMatches(
  input: string,
  options: readonly string[],
  matchOptions: StringMatchOptions = {},
): StringMatch[] {
  if (options.length === 0) return [];

  const opts = { ...DEFAULT_OPTIONS, ...matchOptions };
  const normalizedInput = normalizeString(input, opts);

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
      if (a.distance !== b.distance) return a.distance - b.distance;
      if (a.value.length !== b.value.length) return a.value.length - b.value.length;
      return a.value.localeCompare(b.value);
    })
    .slice(0, opts.maxSuggestions);

  return matches;
}

export function findSuggestions(
  input: string,
  options: readonly string[],
  matchOptions: StringMatchOptions = {},
): string[] {
  return findClosestMatches(input, options, matchOptions).map((m) => m.value);
}

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
