import { z } from "zod";
import { parameterSchemas } from "./configuration-types";
import { getCanonicalTerms, findCanonicalTerm } from "./vocabulary-service";

// Base transformation function interface
export interface TransformationFunction<T = any> {
  name: string;
  description: string;
  parameterSchema: z.ZodSchema<T>;
  transform: (value: any, parameters: T) => any | Promise<any>;
}

// Gender normalization transformation
export const normalizeGender: TransformationFunction<z.infer<typeof parameterSchemas.normalizeGender>> = {
  name: "normalizeGender",
  description: "Normalizes gender/sex values to Darwin Core controlled vocabulary",
  parameterSchema: parameterSchemas.normalizeGender,
  transform: (value: string, params) => {
    if (!value || typeof value !== "string") {
      return params.defaultValue || null;
    }
    
    const normalizedValue = value.trim().toLowerCase();
    
    if (params.maleTerms.some(term => term.toLowerCase() === normalizedValue)) {
      return "male";
    }
    if (params.femaleTerms.some(term => term.toLowerCase() === normalizedValue)) {
      return "female";
    }
    if (params.hermaphroditeTerms.some(term => term.toLowerCase() === normalizedValue)) {
      return "hermaphrodite";
    }
    
    return params.defaultValue || value;
  },
};

// Coordinate formatting transformation
export const formatCoordinates: TransformationFunction<z.infer<typeof parameterSchemas.formatCoordinates>> = {
  name: "formatCoordinates",
  description: "Formats coordinate values to specified precision and format",
  parameterSchema: parameterSchemas.formatCoordinates,
  transform: (value: number | string, params) => {
    const numValue = typeof value === "string" ? parseFloat(value) : value;
    
    if (isNaN(numValue)) {
      return null;
    }
    
    if (params.format === "decimal") {
      return parseFloat(numValue.toFixed(params.precision));
    }
    
    // DMS format conversion (simplified)
    const degrees = Math.floor(Math.abs(numValue));
    const minutes = Math.floor((Math.abs(numValue) - degrees) * 60);
    const seconds = ((Math.abs(numValue) - degrees) * 60 - minutes) * 60;
    const direction = numValue >= 0 ? "+" : "-";
    
    return `${direction}${degrees}°${minutes}'${seconds.toFixed(2)}\"`;
  },
};

// Date formatting transformation
export const formatDate: TransformationFunction<z.infer<typeof parameterSchemas.formatDate>> = {
  name: "formatDate",
  description: "Formats date values to ISO 8601 or custom format",
  parameterSchema: parameterSchemas.formatDate,
  transform: (value: string | Date, params) => {
    let date: Date;
    
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === "string") {
      // Auto-detect common date formats
      date = new Date(value);
    } else {
      return null;
    }
    
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // For now, always return ISO format
    // TODO: Implement custom format parsing
    return date.toISOString().split("T")[0];
  },
};

// Controlled vocabulary normalization
export const normalizeControlledVocabulary: TransformationFunction<z.infer<typeof parameterSchemas.normalizeControlledVocabulary>> = {
  name: "normalizeControlledVocabulary",
  description: "Normalizes values against a controlled vocabulary with fuzzy matching",
  parameterSchema: parameterSchemas.normalizeControlledVocabulary,
  transform: async (value: string, params) => {
    if (!value || typeof value !== "string") {
      return params.defaultValue || null;
    }
    
    // Try to find canonical term first (handles synonyms)
    const canonicalTerm = await findCanonicalTerm(
      params.vocabularyName,
      value.trim(),
      params.caseSensitive
    );
    
    if (canonicalTerm) {
      return canonicalTerm;
    }
    
    // Partial match if enabled
    if (params.allowPartialMatch) {
      const allTerms = await getCanonicalTerms(params.vocabularyName);
      const normalizedInput = params.caseSensitive ? value.trim() : value.trim().toLowerCase();
      
      for (const term of allTerms) {
        const normalizedTerm = params.caseSensitive ? term : term.toLowerCase();
        if (normalizedTerm.includes(normalizedInput) || normalizedInput.includes(normalizedTerm)) {
          return term;
        }
      }
    }
    
    return params.defaultValue || value;
  },
};

// Transformation function registry
export const transformationRegistry = {
  normalizeGender,
  formatCoordinates,
  formatDate,
  normalizeControlledVocabulary,
} as const;

export type TransformationName = keyof typeof transformationRegistry;

// Function to execute transformation with type safety
export async function executeTransformation(
  functionName: TransformationName,
  value: any,
  parameters: any
): Promise<any> {
  const func = transformationRegistry[functionName];
  
  // Validate parameters against schema
  const validatedParams = func.parameterSchema.parse(parameters);
  
  return await func.transform(value, validatedParams);
}