#!/usr/bin/env tsx

// Demo script for DarwinKit mapping system
import logger from "~/utils/test-logger";
// Run with: tsx demo/mapping-demo.ts

// ==============================================================================
// 1. MOCK CONTROLLED VOCABULARIES
// ==============================================================================

interface VocabularyTerm {
  term: string;
  synonyms: string[];
}

interface MockVocabulary {
  name: string;
  strict: boolean;
  terms: VocabularyTerm[];
}

type RowData = Record<string, unknown>;

export const MOCK_VOCABULARIES: Record<string, MockVocabulary> = {
  "dwc:sex": {
    name: "dwc:sex",
    strict: true, // Strict vocabulary - only these terms allowed
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
    strict: false, // Recommended vocabulary - allows custom terms with warnings
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

// ==============================================================================
// 2. TEST SOURCE DATA
// ==============================================================================

const SOURCE_DATA = [
  {
    // Row 1: All valid data
    specimen_id: "FISH_001",
    organism_sex: "M", // Should map to "male"
    life_stage: "adult", // Should pass through as "adult"
    record_type: "specimen", // Should map to "PreservedSpecimen"
    lat_dd: 45.5231,
    lon_dd: -122.6765,
    collection_date: "2023-06-15",
    species_name: "Oncorhynchus mykiss", // Pass-through field
    collector: "J. Smith", // Pass-through field
    notes: "Healthy specimen from tributary", // Pass-through field
  },

  {
    // Row 2: Some invalid vocabulary values
    specimen_id: "FISH_002",
    organism_sex: "INTERSEX", // Invalid - not in sex vocabulary (strict)
    life_stage: "spawning", // Invalid but should warn only (not strict)
    record_type: "photo", // Invalid - not in basis_of_record vocabulary (strict)
    lat_dd: 44.2619,
    lon_dd: -121.3153,
    collection_date: "2023-06-16",
    species_name: "Salmo trutta",
    collector: "M. Johnson",
    notes: "Photographed during spawning run",
  },

  {
    // Row 3: Mix of synonyms and edge cases
    specimen_id: "FISH_003",
    organism_sex: "f", // Synonym for "female"
    life_stage: "JUV", // Synonym for "juvenile"
    record_type: "human", // Synonym for "HumanObservation"
    lat_dd: 46.1351,
    lon_dd: -123.924,
    collection_date: "2023-06-17",
    species_name: "Oncorhynchus kisutch",
    collector: "A. Brown",
    notes: "", // Empty string
  },

  {
    // Row 4: Empty/null values
    specimen_id: "FISH_004",
    organism_sex: "", // Empty - should map to "unknown"
    life_stage: null, // Null value
    record_type: "observation", // Synonym
    lat_dd: 45.7749,
    lon_dd: -121.5135,
    collection_date: "2023-06-18",
    species_name: "Oncorhynchus nerka",
    collector: null,
    notes: "Observed during survey",
  },
];

// ==============================================================================
// 3. MAPPING CONFIGURATION
// ==============================================================================

interface FieldMapping {
  sourceColumn: string;
  targetField: string;
  vocabularyName?: string; // For controlled vocabulary fields
  strictOverride?: boolean; // Override vocabulary's default strictness
  passThrough?: boolean; // Pass through without transformation/validation
}

interface MappingConfiguration {
  name: string;
  standardName: string;
  fieldMappings: FieldMapping[];
}

const MAPPING_CONFIG: MappingConfiguration = {
  name: "Fish Survey to Darwin Core",
  standardName: "Darwin Core",
  fieldMappings: [
    // Controlled vocabulary mappings
    {
      sourceColumn: "organism_sex",
      targetField: "sex",
      vocabularyName: "dwc:sex",
      // Uses vocabulary default: strict = true
    },
    {
      sourceColumn: "life_stage",
      targetField: "lifeStage",
      vocabularyName: "dwc:life_stage",
      // Uses vocabulary default: strict = false (warnings only)
    },
    {
      sourceColumn: "record_type",
      targetField: "basisOfRecord",
      vocabularyName: "dwc:basis_of_record",
      // Uses vocabulary default: strict = true
    },

    // Pass-through mappings (no transformation/validation)
    {
      sourceColumn: "specimen_id",
      targetField: "catalogNumber",
      passThrough: true,
    },
    {
      sourceColumn: "lat_dd",
      targetField: "decimalLatitude",
      passThrough: true,
    },
    {
      sourceColumn: "lon_dd",
      targetField: "decimalLongitude",
      passThrough: true,
    },
    {
      sourceColumn: "collection_date",
      targetField: "eventDate",
      passThrough: true,
    },
    {
      sourceColumn: "species_name",
      targetField: "scientificName",
      passThrough: true,
    },
    {
      sourceColumn: "collector",
      targetField: "recordedBy",
      passThrough: true,
    },
    {
      sourceColumn: "notes",
      targetField: "occurrenceRemarks",
      passThrough: true,
    },
  ],
};

// ==============================================================================
// 4. MOCK PROCESSING FUNCTIONS
// ==============================================================================

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface FieldResult {
  sourceColumn: string;
  targetField: string;
  originalValue: unknown;
  transformedValue: unknown;
  validation: ValidationResult;
}

interface RowResult {
  rowIndex: number;
  fields: FieldResult[];
  isValid: boolean;
  hasWarnings: boolean;
}

// Find canonical term in vocabulary (handles synonyms)
function findCanonicalTerm(vocabularyName: string, inputValue: unknown): string | null {
  inputValue ??= "";

  const vocab = MOCK_VOCABULARIES[vocabularyName];
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

// Transform value using controlled vocabulary
function transformControlledVocabulary(value: string, vocabularyName: string): string {
  const canonicalTerm = findCanonicalTerm(vocabularyName, value);
  return canonicalTerm ?? value; // Return original if no match found
}

// Validate value using controlled vocabulary
function validateControlledVocabulary(value: string, vocabularyName: string): ValidationResult {
  const vocab = MOCK_VOCABULARIES[vocabularyName];
  if (!vocab) {
    return {
      isValid: false,
      errors: [`Unknown vocabulary: ${vocabularyName}`],
      warnings: [],
    };
  }

  const canonicalTerm = findCanonicalTerm(vocabularyName, value);
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

// Process a single field mapping
function processField(rowData: RowData, mapping: FieldMapping): FieldResult {
  const originalValue = rowData[mapping.sourceColumn];
  let transformedValue = originalValue;
  let validation: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  if (mapping.passThrough) {
    // Pass-through field: no transformation or validation
    transformedValue = originalValue;
  } else if (mapping.vocabularyName) {
    // Controlled vocabulary field
    transformedValue = transformControlledVocabulary(String(originalValue), mapping.vocabularyName);
    validation = validateControlledVocabulary(String(transformedValue), mapping.vocabularyName);
  }

  return {
    sourceColumn: mapping.sourceColumn,
    targetField: mapping.targetField,
    originalValue,
    transformedValue,
    validation,
  };
}

// Process a single row
function processRow(rowData: RowData, rowIndex: number): RowResult {
  const fields = MAPPING_CONFIG.fieldMappings.map((mapping) => processField(rowData, mapping));

  const isValid = fields.every((f) => f.validation.isValid);
  const hasWarnings = fields.some((f) => f.validation.warnings.length > 0);

  return {
    rowIndex,
    fields,
    isValid,
    hasWarnings,
  };
}

// ==============================================================================
// 5. DEMO EXECUTION
// ==============================================================================

function runDemo() {
  logger.log("🧬 DarwinKit Mapping Demo");
  logger.log("========================\\n");

  logger.log("📋 Configuration:");
  logger.log(`Name: ${MAPPING_CONFIG.name}`);
  logger.log(`Standard: ${MAPPING_CONFIG.standardName}`);
  logger.log(`Field mappings: ${MAPPING_CONFIG.fieldMappings.length}\\n`);

  logger.log("📊 Processing Results:");
  logger.log("======================\\n");

  const results = SOURCE_DATA.map((row, index) => processRow(row, index));

  // Summary statistics
  const validRows = results.filter((r) => r.isValid).length;
  const rowsWithWarnings = results.filter((r) => r.hasWarnings).length;

  logger.log(`Total rows processed: ${results.length}`);
  logger.log(`Valid rows: ${validRows}`);
  logger.log(`Invalid rows: ${results.length - validRows}`);
  logger.log(`Rows with warnings: ${rowsWithWarnings}\\n`);

  // Detailed results for each row
  results.forEach((result, index) => {
    logger.log(
      `🔍 Row ${index + 1} (${result.isValid ? "✅ Valid" : "❌ Invalid"}${
        result.hasWarnings ? " ⚠️ Warnings" : ""
      }):`
    );

    result.fields.forEach((field) => {
      if (
        field.validation.errors.length > 0 ||
        field.validation.warnings.length > 0 ||
        field.originalValue !== field.transformedValue
      ) {
        logger.log(`  ${field.sourceColumn} → ${field.targetField}:`);
        logger.log(`    Original: "${String(field.originalValue)}"`);
        logger.log(`    Transformed: "${String(field.transformedValue)}"`);

        if (field.validation.errors.length > 0) {
          logger.log(`    ❌ Errors: ${field.validation.errors.join("; ")}`);
        }

        if (field.validation.warnings.length > 0) {
          logger.log(`    ⚠️  Warnings: ${field.validation.warnings.join("; ")}`);
        }
      }
    });
    logger.log();
  });

  // Show transformed output
  logger.log("✨ Transformed Output (Valid Rows Only):");
  logger.log("========================================\\n");

  const transformedData = results
    .filter((result) => result.isValid)
    .map((result) => {
      const transformedRow: RowData = {};
      result.fields.forEach((field) => {
        transformedRow[field.targetField] = field.transformedValue;
      });
      return transformedRow;
    });

  logger.log(JSON.stringify(transformedData, null, 2));
}

// Run the demo
runDemo();
