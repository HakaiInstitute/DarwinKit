/**
 * Transformation Functions Library
 * 
 * Implements actual transformation functions that can be executed with parameters
 */

interface TransformationResult {
  value: unknown;
  success: boolean;
  error?: string;
}

interface VocabularyTerm {
  term: string;
  synonyms: string[];
}

interface MockVocabulary {
  name: string;
  strict: boolean;
  terms: VocabularyTerm[];
}

// Controlled vocabulary transformation
export function normalizeControlledVocabulary(
  input: unknown,
  params: {
    vocabularyName: string;
    vocabularies: Record<string, MockVocabulary>;
    defaultValue?: string;
    caseSensitive?: boolean;
  }
): TransformationResult {
  if (input === null || input === undefined || input === '') {
    return { value: input, success: true };
  }

  const inputStr = String(input);
  const vocabulary = params.vocabularies[params.vocabularyName];
  
  if (!vocabulary) {
    return { 
      value: params.defaultValue || 'unknown', 
      success: false, 
      error: `Vocabulary '${params.vocabularyName}' not found` 
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
    const synonymsToCheck = caseSensitive ? termData.synonyms : termData.synonyms.map(s => s.toLowerCase());
    if (synonymsToCheck.includes(searchValue)) {
      return { value: termData.term, success: true };
    }
  }

  // No match found
  return { 
    value: params.defaultValue || 'unknown', 
    success: true // Not an error, just no match
  };
}

// String transformation functions
export function trimWhitespace(
  input: unknown,
  params: { sides?: 'both' | 'left' | 'right' } = {}
): TransformationResult {
  if (input === null || input === undefined) {
    return { value: input, success: true };
  }

  const inputStr = String(input);
  const sides = params.sides || 'both';

  let result: string;
  switch (sides) {
    case 'left':
      result = inputStr.trimStart();
      break;
    case 'right':
      result = inputStr.trimEnd();
      break;
    case 'both':
    default:
      result = inputStr.trim();
      break;
  }

  return { value: result, success: true };
}

export function toLowerCase(input: unknown): TransformationResult {
  if (input === null || input === undefined || input === '') {
    return { value: input, success: true };
  }

  const inputStr = String(input);
  return { value: inputStr.toLowerCase(), success: true };
}

// Coordinate transformation functions
export function parseCoordinates(
  input: unknown,
  params: { 
    inputFormat?: 'auto' | 'decimal' | 'dms' | 'combined'; 
    precision?: number;
    component?: 'latitude' | 'longitude' | 'both';
  } = {}
): TransformationResult {
  if (input === null || input === undefined || input === '') {
    return { value: null, success: true };
  }

  const inputStr = String(input).trim();
  const precision = params.precision ?? 6;
  const component = params.component || 'latitude';

  try {
    // Handle combined coordinates like "40.7128, -74.0060"
    if (inputStr.includes(',')) {
      const parts = inputStr.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng)) {
          if (component === 'latitude') {
            return { value: Number(lat.toFixed(precision)), success: true };
          } else if (component === 'longitude') {
            return { value: Number(lng.toFixed(precision)), success: true };
          } else {
            return { value: { latitude: Number(lat.toFixed(precision)), longitude: Number(lng.toFixed(precision)) }, success: true };
          }
        }
      }
    }

    // Handle DMS format like "40°42'46.08"N"
    const dmsMatch = inputStr.match(/(\d+)°(\d+)'([\d.]+)"?([NSEW])?/i);
    if (dmsMatch) {
      const [, degrees, minutes, seconds, direction] = dmsMatch;
      let decimal = parseInt(degrees) + parseInt(minutes) / 60 + parseFloat(seconds) / 3600;
      
      if (direction && (direction.toUpperCase() === 'S' || direction.toUpperCase() === 'W')) {
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
      error: `Unable to parse coordinate: ${inputStr}` 
    };

  } catch (error) {
    return { 
      value: null, 
      success: false, 
      error: `Coordinate parsing error: ${error}` 
    };
  }
}

// Date transformation functions
export function parseDate(
  input: unknown,
  params: { inputFormat?: 'auto' | 'iso' | 'us' | 'uk' | 'verbose'; outputFormat?: 'iso' | 'us' | 'uk' } = {}
): TransformationResult {
  if (input === null || input === undefined || input === '') {
    return { value: input, success: true };
  }

  const inputStr = String(input).trim();
  const outputFormat = params.outputFormat || 'iso';

  try {
    let date: Date;

    // Try parsing various formats
    if (inputStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // ISO format: 2023-01-15
      date = new Date(inputStr);
    } else if (inputStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      // UK format: 15/01/2023
      const [day, month, year] = inputStr.split('/');
      date = new Date(`${year}-${month}-${day}`);
    } else if (inputStr.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
      // US format: 1/15/2023
      const [month, day, year] = inputStr.split('/');
      date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    } else if (inputStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
      // ISO-like with single digits: 2023-1-15
      const [year, month, day] = inputStr.split('-');
      date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    } else {
      // Try natural language parsing
      date = new Date(inputStr);
    }

    if (isNaN(date.getTime())) {
      return { 
        value: inputStr, 
        success: false, 
        error: `Unable to parse date: ${inputStr}` 
      };
    }

    // Format output
    let result: string;
    switch (outputFormat) {
      case 'us':
        result = date.toLocaleDateString('en-US');
        break;
      case 'uk':
        result = date.toLocaleDateString('en-GB');
        break;
      case 'iso':
      default:
        result = date.toISOString().split('T')[0];
        break;
    }

    return { value: result, success: true };

  } catch (error) {
    return { 
      value: inputStr, 
      success: false, 
      error: `Date parsing error: ${error}` 
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

// Execute transformation function by name
export function executeTransformation(
  functionName: string,
  input: unknown,
  parameters: Record<string, unknown> = {}
): TransformationResult {
  const func = TRANSFORMATION_FUNCTIONS[functionName as keyof typeof TRANSFORMATION_FUNCTIONS];
  
  if (!func) {
    return { 
      value: input, 
      success: false, 
      error: `Transformation function '${functionName}' not found` 
    };
  }

  try {
    return func(input, parameters as any);
  } catch (error) {
    return { 
      value: input, 
      success: false, 
      error: `Execution error: ${error}` 
    };
  }
}