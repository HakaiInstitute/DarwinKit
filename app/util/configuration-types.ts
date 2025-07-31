import { z } from "zod";

// Function call structure for transformations and validations
export const functionCallSchema = z.object({
  functionName: z.string(),
  parameters: z.record(z.any()),
});

export type FunctionCall = z.infer<typeof functionCallSchema>;

// Complete field mapping configuration
export const fieldMappingConfigSchema = z.object({
  sourceColumn: z.string(),
  targetField: z.string(),
  transformations: z.array(functionCallSchema).default([]),
  validations: z.array(functionCallSchema).default([]),
});

export type FieldMappingConfig = z.infer<typeof fieldMappingConfigSchema>;

// Project configuration structure
export const projectConfigurationSchema = z.object({
  name: z.string(),
  standardName: z.string(),
  standardVersion: z.string(),
  fieldMappings: z.array(fieldMappingConfigSchema),
});

export type ProjectConfiguration = z.infer<typeof projectConfigurationSchema>;

// Semantic types for fields
export const semanticTypes = [
  "controlled_vocabulary",
  "coordinate",
  "date",
  "measurement",
  "identifier",
  "text",
  "numeric",
  "boolean",
] as const;

export type SemanticType = typeof semanticTypes[number];

// Primitive types
export const primitiveTypes = [
  "string",
  "integer", 
  "float",
  "boolean",
  "date",
] as const;

export type PrimitiveType = typeof primitiveTypes[number];

// Function parameter schemas for type safety
export const parameterSchemas = {
  // Transformation function parameter schemas
  normalizeGender: z.object({
    maleTerms: z.array(z.string()).default(["M", "male", "Male"]),
    femaleTerms: z.array(z.string()).default(["F", "female", "Female"]),
    hermaphroditeTerms: z.array(z.string()).default(["H", "hermaphrodite"]),
    defaultValue: z.string().optional(),
  }),
  
  formatCoordinates: z.object({
    precision: z.number().min(1).max(10).default(6),
    format: z.enum(["decimal", "dms"]).default("decimal"),
  }),
  
  formatDate: z.object({
    inputFormat: z.string().default("auto"),
    outputFormat: z.string().default("YYYY-MM-DD"),
  }),
  
  normalizeControlledVocabulary: z.object({
    vocabularyName: z.string(), // Reference to vocabulary by name
    caseSensitive: z.boolean().default(false),
    allowPartialMatch: z.boolean().default(false),
    defaultValue: z.string().optional(),
  }),
  
  // Validation function parameter schemas
  validateControlledVocabulary: z.object({
    vocabularyName: z.string(), // Reference to vocabulary by name
    strict: z.boolean().default(true),
    caseSensitive: z.boolean().default(false),
  }),
  
  validateCoordinateRange: z.object({
    type: z.enum(["latitude", "longitude"]),
    allowNull: z.boolean().default(false),
  }),
  
  validateDateRange: z.object({
    minDate: z.string().optional(),
    maxDate: z.string().optional(),
    allowFuture: z.boolean().default(false),
  }),
  
  validateRequired: z.object({
    allowEmpty: z.boolean().default(false),
  }),
} as const;

export type ParameterSchemas = typeof parameterSchemas;