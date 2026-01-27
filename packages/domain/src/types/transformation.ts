/**
 * Transformation Types
 *
 * Types for tracking data transformations applied during validation.
 * Transformations can be automatic (DuckDB coercion) or explicit (configured functions).
 *
 * DESIGN DECISION: Kept as pure TypeScript interfaces rather than Effect Schemas because:
 * 1. Complex type relationships - TransformationFunctionName is derived from const registry keys
 * 2. Internal-only usage - Used for data provenance tracking, not API validation
 * 3. Programmatic construction - These types are constructed internally by the validation system,
 *    never parsed from external input
 * 4. Helper functions - createAutomaticTransformation and createExplicitTransformation work well as-is
 *
 * These types are constructed internally by the validation system and returned as part
 * of validation results. They don't need runtime validation via Effect Schema.
 */

/**
 * Automatic transformations applied by the system based on configuration
 *
 * Note: DuckDB type inference (string→number, string→date) is NOT tracked here.
 * Type inference is expected behavior when reading CSV files and is configured
 * via field mappings, not an explicit transformation.
 */
export type AutomaticTransformationType =
  | "null_interpretation" // CSV value → NULL based on nullValues config
  | "whitespace_trim"; // Future: if we add explicit trim config

/**
 * Registry of available transformation functions
 *
 * Each function has a name, description, and parameter schema.
 * Functions are purpose-specific for biodiversity data transformations.
 */
export const TransformationFunctions = {
  splitCoordinates: {
    description: "Split combined latitude/longitude field into separate values",
    parameters: {
      latFirst: {
        type: "boolean",
        default: true,
        description: "Whether latitude comes first",
      },
      separator: {
        type: "string",
        default: ",",
        description: "Character separating coordinates",
      },
      coordinateSystem: {
        type: "string",
        default: "WGS84",
        description: "Coordinate reference system",
        options: ["WGS84", "NAD83", "ETRS89"],
      },
    },
  },

  normalizeScientificName: {
    description: "Normalize scientific names to standard taxonomic format",
    parameters: {
      authority: {
        type: "string",
        optional: true,
        description: "Taxonomic authority to validate against",
        options: ["WoRMS", "GBIF", "ITIS"],
      },
      removeAuthors: {
        type: "boolean",
        default: false,
        description: "Remove author citations",
      },
    },
  },

  convertDateFormat: {
    description: "Convert date from one format to another",
    parameters: {
      inputFormat: {
        type: "string",
        description: "Input date format (e.g., 'DD/MM/YYYY')",
      },
      outputFormat: {
        type: "string",
        default: "YYYY-MM-DD",
        description: "Output date format",
      },
    },
  },

  combineFields: {
    description: "Combine multiple fields into one",
    parameters: {
      sourceFields: {
        type: "array",
        description: "Array of field names to combine",
      },
      separator: {
        type: "string",
        default: " ",
        description: "Separator between values",
      },
      skipEmpty: {
        type: "boolean",
        default: true,
        description: "Skip empty values",
      },
    },
  },

  extractFromPattern: {
    description: "Extract value using a regular expression pattern",
    parameters: {
      pattern: { type: "string", description: "Regular expression pattern" },
      captureGroup: {
        type: "number",
        default: 1,
        description: "Capture group to extract",
      },
    },
  },

  lookupMapping: {
    description: "Map values using a lookup table",
    parameters: {
      mappingTable: {
        type: "object",
        description: "Object mapping source values to target values",
      },
      defaultValue: {
        type: "string",
        optional: true,
        description: "Default value if no mapping found",
      },
    },
  },

  normalizeCountryCode: {
    description: "Convert country names to ISO 3166-1 alpha-2 codes",
    parameters: {
      format: {
        type: "string",
        default: "alpha-2",
        description: "Output format",
        options: ["alpha-2", "alpha-3", "name"],
      },
    },
  },

  parseCoordinateUncertainty: {
    description: "Extract coordinate precision from various formats",
    parameters: {
      unit: {
        type: "string",
        default: "meters",
        description: "Output unit",
        options: ["meters", "kilometers", "degrees"],
      },
    },
  },
} as const;

/**
 * Type-safe function names from the registry
 */
export type TransformationFunctionName = keyof typeof TransformationFunctions;

/**
 * Parameter type for a specific transformation function
 * This extracts the parameter schema from the registry
 */
export type TransformationParameters<T extends TransformationFunctionName> = Record<
  string,
  unknown
>;

/**
 * Single transformation in a chain
 *
 * Discriminated union distinguishing automatic (system) vs explicit (configured) transformations
 */
export type Transformation =
  | {
    readonly category: "automatic";
    readonly type: AutomaticTransformationType;
    readonly description: string;
    readonly metadata?: {
      readonly from?: string;
      readonly to?: string;
      readonly nullValues?: readonly string[];
      readonly format?: string;
    };
  }
  | {
    readonly category: "explicit";
    readonly function: TransformationFunctionName;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };

/**
 * Complete chain of transformations applied to a value
 *
 * Tracks the full journey from source CSV value to final validated value,
 * including all automatic and explicit transformations applied in order.
 */
export interface TransformationChain {
  readonly sourceValue: string;
  readonly transformedValue: unknown;
  readonly transformations: ReadonlyArray<Transformation>;
}

/**
 * Configuration for an explicit transformation to apply to a field
 *
 * Used in darwinkit.json field mappings to specify transformations
 */
export interface TransformationConfig<
  T extends TransformationFunctionName = TransformationFunctionName,
> {
  readonly function: T;
  readonly parameters: TransformationParameters<T>;
  readonly description?: string;
}

/**
 * Summary of transformations applied across a dataset
 *
 * Provides aggregate statistics for reporting
 */
export interface TransformationSummary {
  readonly totalValues: number;
  readonly transformedValues: number;
  readonly byType: {
    readonly [K in AutomaticTransformationType | TransformationFunctionName]?: {
      readonly count: number;
      readonly percentage: number;
    };
  };
}

/**
 * Helper to create an automatic transformation
 */
export function createAutomaticTransformation(
  type: AutomaticTransformationType,
  description: string,
  metadata?: Transformation & { category: "automatic" } extends { metadata?: infer M } ? M : never,
): Transformation {
  return {
    category: "automatic",
    type,
    description,
    metadata,
  };
}

/**
 * Helper to create an explicit transformation
 */
export function createExplicitTransformation(
  functionName: TransformationFunctionName,
  parameters: Record<string, unknown>,
  description?: string,
): Transformation {
  const func = TransformationFunctions[functionName];
  return {
    category: "explicit",
    function: functionName,
    description: description || func.description,
    parameters,
  };
}

/**
 * Validation violation with transformation context
 *
 * Enhanced error that includes the full transformation chain
 */
export interface TransformationAwareViolation {
  readonly rowNumber: number;
  readonly fieldName: string;
  readonly chain: TransformationChain;
  readonly errorMessage: string;
}
