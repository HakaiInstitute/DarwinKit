/**
 * Transformation Functions Library
 *
 * Implements actual transformation functions that can be executed with parameters
 */

import type { SomePrimitive, GlobalParameters, VocabularyTerm, MockVocabulary } from "./types";

// Use centralized TransformationResult but maintain backward compatibility
interface TransformationResult {
  value: SomePrimitive;
  success: boolean;
  error?: string; // Single error for backward compatibility
  errors?: string[]; // Array for consistency with centralized type
  warnings?: string[]; // Optional warnings
}

// Controlled vocabulary transformation
export function normalizeControlledVocabulary(
  input: SomePrimitive,
  params: {
    vocabularyName: string;
    vocabularies: Record<string, MockVocabulary>;
    defaultValue?: string;
    caseSensitive?: boolean;
  }
): TransformationResult {
  if (input === null || input === undefined || input === "") {
    return { value: input, success: true };
  }

  const inputStr = input.toString();
  const vocabulary = params.vocabularies[params.vocabularyName];

  if (!vocabulary) {
    return {
      value: params.defaultValue ?? "unknown",
      success: false,
      error: `Vocabulary '${params.vocabularyName}' not found`,
    };
  }

  const caseSensitive = params.caseSensitive ?? false;
  const searchValue = caseSensitive ? inputStr : inputStr.toLowerCase();

  // Search for direct term match or synonym match
  for (const termData of vocabulary.terms) {
    const termToCheck = caseSensitive ? termData.term : termData.term.toLowerCase();

    // Check canonical term
    if (termToCheck === searchValue) {
      return { value: termData.term, success: true };
    }

    // Check synonyms
    const synonymsToCheck = caseSensitive
      ? termData.synonyms
      : termData.synonyms.map((s) => s.toLowerCase());
    if (synonymsToCheck.includes(searchValue)) {
      return { value: termData.term, success: true };
    }
  }

  // No match found
  return {
    value: params.defaultValue ?? "unknown",
    success: true, // Not an error, just no match
  };
}

// String transformation functions
export function trimWhitespace(
  input: SomePrimitive,
  params: { sides?: "both" | "left" | "right" } = {}
): TransformationResult {
  if (input === null || input === undefined) {
    return { value: input, success: true };
  }

  const inputStr = String(input);
  const sides = params.sides ?? "both";

  let result: string;
  switch (sides) {
    case "left":
      result = inputStr.trimStart();
      break;
    case "right":
      result = inputStr.trimEnd();
      break;
    case "both":
    default:
      result = inputStr.trim();
      break;
  }

  return { value: result, success: true };
}

export function toLowerCase(input: SomePrimitive): TransformationResult {
  if (input === null || input === undefined || input === "") {
    return { value: input, success: true };
  }

  const inputStr = String(input);
  return { value: inputStr.toLowerCase(), success: true };
}

// Coordinate transformation functions
export function parseCoordinates(
  input: SomePrimitive,
  params: {
    inputFormat?: "auto" | "decimal" | "dms" | "combined";
    precision?: number;
    component?: "latitude" | "longitude" | "both";
  } = {}
): TransformationResult {
  if (input === null || input === undefined || input === "") {
    return { value: null, success: true };
  }

  const inputStr = String(input).trim();
  const precision = params.precision ?? 6;
  const component = params.component ?? "latitude";

  try {
    // Handle combined coordinates like "40.7128, -74.0060"
    if (inputStr.includes(",")) {
      const parts = inputStr.split(",").map((p) => p.trim());
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          if (component === "latitude") {
            return { value: Number(lat.toFixed(precision)), success: true };
          } else if (component === "longitude") {
            return { value: Number(lng.toFixed(precision)), success: true };
          } else {
            return {
              value: {
                latitude: Number(lat.toFixed(precision)),
                longitude: Number(lng.toFixed(precision)),
              },
              success: true,
            };
          }
        }
      }
    }

    // Handle DMS format like "40°42'46.08"N"
    const dmsMatch = /(\d+)°(\d+)'([\d.]+)"?([NSEW])?/i.exec(inputStr);
    if (dmsMatch) {
      const [, degrees, minutes, seconds, direction] = dmsMatch;
      let decimal = parseInt(degrees) + parseInt(minutes) / 60 + parseFloat(seconds) / 3600;

      if (direction && (direction.toUpperCase() === "S" || direction.toUpperCase() === "W")) {
        decimal = -decimal;
      }

      return { value: Number(decimal.toFixed(precision)), success: true };
    }

    // Handle simple decimal
    const decimal = parseFloat(inputStr);
    if (!isNaN(decimal)) {
      return { value: Number(decimal.toFixed(precision)), success: true };
    }

    return {
      value: null,
      success: false,
      error: `Unable to parse coordinate: ${inputStr}`,
    };
  } catch (error) {
    return {
      value: null,
      success: false,
      error: `Coordinate parsing error: ${String(error)}`,
    };
  }
}

// Date transformation functions
export function parseDate(
  input: SomePrimitive,
  params: {
    inputFormat?: "auto" | "iso" | "us" | "uk" | "verbose";
    outputFormat?: "iso" | "us" | "uk";
  } = {}
): TransformationResult {
  if (input === null || input === undefined || input === "") {
    return { value: input, success: true };
  }

  const inputStr = String(input).trim();
  const outputFormat = params.outputFormat ?? "iso";

  try {
    let date: Date;

    // Try parsing various formats
    if (/^\d{4}-\d{2}-\d{2}$/.exec(inputStr)) {
      // ISO format: 2023-01-15
      date = new Date(inputStr);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.exec(inputStr)) {
      // UK format: 15/01/2023
      const [day, month, year] = inputStr.split("/");
      date = new Date(`${year}-${month}-${day}`);
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.exec(inputStr)) {
      // US format: 1/15/2023
      const [month, day, year] = inputStr.split("/");
      date = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.exec(inputStr)) {
      // ISO-like with single digits: 2023-1-15
      const [year, month, day] = inputStr.split("-");
      date = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`);
    } else {
      // Try natural language parsing
      date = new Date(inputStr);
    }

    if (isNaN(date.getTime())) {
      return {
        value: inputStr,
        success: false,
        error: `Unable to parse date: ${inputStr}`,
      };
    }

    // Format output
    let result: string;
    switch (outputFormat) {
      case "us":
        result = date.toLocaleDateString("en-US");
        break;
      case "uk":
        result = date.toLocaleDateString("en-GB");
        break;
      case "iso":
      default:
        result = date.toISOString().split("T")[0];
        break;
    }

    return { value: result, success: true };
  } catch (error) {
    return {
      value: inputStr,
      success: false,
      error: `Date parsing error: ${String(error)}`,
    };
  }
}

// Function registry for dynamic execution
export const TRANSFORMATION_FUNCTIONS = {
  normalizeControlledVocabulary,
  trimWhitespace,
  toLowerCase,
  parseCoordinates,
  parseDate,
};

// Generic transformation function type
type TransformationFunction = (
  input: SomePrimitive,
  params?: GlobalParameters
) => TransformationResult;

// Execute transformation function by name
export function executeTransformation(
  functionName: string,
  input: SomePrimitive,
  parameters: GlobalParameters = {}
): TransformationResult {
  const func = TRANSFORMATION_FUNCTIONS[
    functionName as keyof typeof TRANSFORMATION_FUNCTIONS
  ] as TransformationFunction;

  if (!func) {
    return {
      value: input,
      success: false,
      error: `Transformation function '${functionName}' not found`,
    };
  }

  try {
    // Trust the convention: all transformation functions take (input, params) and return TransformationResult
    // If parameters are wrong, the function will throw or return errors, which we catch and handle
    return func(input, parameters);
  } catch (error) {
    return {
      value: input,
      success: false,
      error: `Transformation execution error in '${functionName}': ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
