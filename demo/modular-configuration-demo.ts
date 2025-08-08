import logger from "~/utils/test-logger";
/**
 * Modular Configuration Demonstration
 *
 * Shows how to use different component combinations:
 * - Mapping only
 * - Transform + validate only
 * - Mapping + validate only
 * - Mapping + transform only
 * - Full pipeline
 */

import {
  createMappingOnlyConfig,
  createMappingTransformConfig,
  createMappingValidateConfig,
  createTransformValidateConfig,
  executeMappingOnly,
  executeModularConfiguration,
} from "~/lib/configurator/modular-executor";

// Sample biodiversity data
const sampleData = [
  {
    organism_sex: "M",
    latitude_dd: "45.123456",
    longitude_dd: "-123.987654",
    collection_date: "2023-06-15",
    life_stage: "Adult",
  },
  {
    organism_sex: "female",
    latitude_dd: "44.5678",
    longitude_dd: "-124.1234",
    collection_date: "2023-06-16",
    life_stage: "juv",
  },
  {
    organism_sex: "X", // Invalid - will cause validation error
    latitude_dd: "91", // Invalid latitude
    longitude_dd: "-180.1", // Invalid longitude
    collection_date: "2025-01-01", // Future date
    life_stage: "pupae",
  },
];

// Mock vocabularies for demonstrations
const mockVocabularies = {
  sex: {
    name: "sex",
    strict: true,
    terms: [
      { term: "male", synonyms: ["M", "Male", "MALE"] },
      { term: "female", synonyms: ["F", "Female", "FEMALE"] },
      { term: "hermaphrodite", synonyms: ["H", "Hermaphrodite"] },
      { term: "unknown", synonyms: [] },
    ],
  },
  lifeStage: {
    name: "lifeStage",
    strict: false,
    terms: [
      { term: "adult", synonyms: ["Adult", "ADULT"] },
      { term: "juvenile", synonyms: ["juv", "Juvenile", "JUVENILE"] },
      { term: "larva", synonyms: ["larvae", "Larva", "LARVA"] },
      { term: "egg", synonyms: ["Egg", "EGG"] },
    ],
  },
};

/**
 * Demo 1: Mapping-only configuration
 * Just renames CSV columns to Darwin Core fields
 */
export function demonstrateMappingOnly() {
  logger.log("🗺️ MAPPING-ONLY CONFIGURATION");
  logger.log("================================\\n");

  const mappingConfig = createMappingOnlyConfig({
    name: "Darwin Core Field Mapping",
    mappings: [
      { sourceColumn: "organism_sex", targetField: "sex" },
      { sourceColumn: "latitude_dd", targetField: "decimalLatitude" },
      { sourceColumn: "longitude_dd", targetField: "decimalLongitude" },
      { sourceColumn: "collection_date", targetField: "eventDate" },
      { sourceColumn: "life_stage", targetField: "lifeStage" },
    ],
  });

  // Simple execution for mapping-only
  const mappedData = executeMappingOnly(
    sampleData,
    mappingConfig.fields.map((f) => {
      const config = f.config as { sourceColumn: string; targetField: string };
      return {
        sourceColumn: config.sourceColumn,
        targetField: config.targetField,
      };
    })
  );

  logger.log("Original columns:", Object.keys(sampleData[0]));
  logger.log("Mapped columns:", Object.keys(mappedData[0]));
  logger.log("\\nFirst mapped row:", mappedData[0]);
}

/**
 * Demo 2: Transform + validate configuration (no mapping)
 * Works on data that's already in the right format
 */
export function demonstrateTransformValidate() {
  logger.log("\\n🔄 TRANSFORM + VALIDATE CONFIGURATION");
  logger.log("=====================================\\n");

  // Pre-mapped data (already has Darwin Core field names)
  const preMappedData = [
    { sex: "M", decimalLatitude: 45.123456, lifeStage: "Adult" },
    { sex: "female", decimalLatitude: 44.5678, lifeStage: "juv" },
    { sex: "X", decimalLatitude: 91, lifeStage: "pupae" },
  ];

  const transformValidateConfig = createTransformValidateConfig({
    name: "Data Quality Processing",
    globalParameters: { vocabularies: mockVocabularies },
    fields: [
      {
        fieldName: "sex",
        transformations: [
          {
            functionName: "normalizeControlledVocabulary",
            parameters: {
              vocabularyName: "sex",
              defaultValue: "unknown",
            },
          },
        ],
        validations: [
          {
            functionName: "validateControlledVocabulary",
            parameters: {
              vocabularyName: "sex",
              strict: true,
            },
          },
        ],
      },
      {
        fieldName: "decimalLatitude",
        transformations: [],
        validations: [
          {
            functionName: "validateCoordinates",
            parameters: { type: "latitude" },
          },
        ],
      },
      {
        fieldName: "lifeStage",
        transformations: [
          {
            functionName: "normalizeControlledVocabulary",
            parameters: {
              vocabularyName: "lifeStage",
              defaultValue: "unknown",
            },
          },
        ],
        validations: [
          {
            functionName: "validateControlledVocabulary",
            parameters: {
              vocabularyName: "lifeStage",
              strict: false,
            },
          },
        ],
      },
    ],
  });

  const result = executeModularConfiguration(preMappedData, transformValidateConfig);

  logger.log(`Processed ${result.processedRows} rows`);
  logger.log(`Valid: ${result.validRows}, Invalid: ${result.invalidRows}`);
  logger.log("\\nTransformed data:");
  result.transformedData.forEach((row, i) => {
    logger.log(`Row ${i + 1}:`, row);
  });

  logger.log("\\nValidation errors:");
  result.rowResults.forEach((row, i) => {
    if (row.errors.length > 0) {
      logger.log(`Row ${i + 1}:`, row.errors);
    }
  });
}

/**
 * Demo 3: Mapping + validate configuration (skip transformations)
 * Map CSV columns and validate, but don't transform values
 */
export function demonstrateMappingValidate() {
  logger.log("\\n🗺️✅ MAPPING + VALIDATE CONFIGURATION");
  logger.log("=====================================\\n");

  const mappingValidateConfig = createMappingValidateConfig({
    name: "Map and Validate Only",
    globalParameters: { vocabularies: mockVocabularies },
    mappings: [
      {
        sourceColumn: "latitude_dd",
        targetField: "decimalLatitude",
        validations: [
          {
            functionName: "validateDataType",
            parameters: { expectedType: "number" },
          },
          {
            functionName: "validateCoordinates",
            parameters: { type: "latitude" },
          },
        ],
      },
      {
        sourceColumn: "longitude_dd",
        targetField: "decimalLongitude",
        validations: [
          {
            functionName: "validateDataType",
            parameters: { expectedType: "number" },
          },
          {
            functionName: "validateCoordinates",
            parameters: { type: "longitude" },
          },
        ],
      },
      {
        sourceColumn: "collection_date",
        targetField: "eventDate",
        validations: [
          {
            functionName: "validateDateRange",
            parameters: {
              allowFuture: false,
              minDate: "1800-01-01",
            },
          },
        ],
      },
    ],
  });

  const result = executeModularConfiguration(sampleData, mappingValidateConfig);

  logger.log(`Configuration: ${result.configurationName}`);
  logger.log(`Valid: ${result.validRows}/${result.totalRows} rows`);
  logger.log("\\nField statistics:");
  Object.entries(result.fieldStatistics).forEach(([field, stats]) => {
    logger.log(`${field}: ${stats.successful}/${stats.totalProcessed} successful`);
    if (stats.mostCommonErrors.length > 0) {
      logger.log(`  Common errors: ${stats.mostCommonErrors[0]}`);
    }
  });
}

/**
 * Demo 4: Mapping + transform configuration (skip validations)
 * Map CSV columns and transform values, but don't validate
 */
export function demonstrateMappingTransform() {
  logger.log("\\n🗺️🔄 MAPPING + TRANSFORM CONFIGURATION");
  logger.log("======================================\\n");

  const mappingTransformConfig = createMappingTransformConfig({
    name: "Map and Transform Only",
    globalParameters: { vocabularies: mockVocabularies },
    mappings: [
      {
        sourceColumn: "organism_sex",
        targetField: "sex",
        transformations: [
          {
            functionName: "normalizeControlledVocabulary",
            parameters: {
              vocabularyName: "sex",
              defaultValue: "unknown",
            },
          },
        ],
      },
      {
        sourceColumn: "life_stage",
        targetField: "lifeStage",
        transformations: [
          {
            functionName: "normalizeControlledVocabulary",
            parameters: {
              vocabularyName: "lifeStage",
              defaultValue: "unknown",
            },
          },
        ],
      },
      {
        sourceColumn: "latitude_dd",
        targetField: "decimalLatitude",
        transformations: [
          {
            functionName: "formatDecimal",
            parameters: { decimalPlaces: 6 },
          },
        ],
      },
    ],
  });

  const result = executeModularConfiguration(sampleData, mappingTransformConfig);

  logger.log("Original vs Transformed:");
  sampleData.forEach((originalRow, i) => {
    const transformedRow = result.transformedData[i];
    logger.log(`\\nRow ${i + 1}:`);
    logger.log("  Original:", originalRow);
    logger.log("  Transformed:", transformedRow);
  });

  logger.log(`\\nTransformation success rate: ${result.validRows}/${result.totalRows}`);
}

/**
 * Demo 5: Architecture comparison
 */
export function demonstrateArchitectureComparison() {
  logger.log("\\n📊 ARCHITECTURE COMPARISON");
  logger.log("==========================\\n");

  logger.log("Component Selection Options:");
  logger.log("✅ mapping-only:       Fast field renaming (CSV → Darwin Core)");
  logger.log("✅ transform-validate: Data processing pipeline (quality control)");
  logger.log("✅ mapping-validate:   Direct validation (skip transformations)");
  logger.log("✅ mapping-transform:  Data normalization (skip validation)");
  logger.log("✅ full-pipeline:      Complete processing (all components)");

  logger.log("\\nUse Cases:");
  logger.log("• mapping-only:       Simple CSV column remapping");
  logger.log("• transform-validate: Clean already-mapped data");
  logger.log("• mapping-validate:   Quick quality checks on raw CSV");
  logger.log("• mapping-transform:  Normalize data without validation overhead");
  logger.log("• full-pipeline:      Production data processing");

  logger.log("\\nPerformance Benefits:");
  logger.log("• Selective components = faster execution");
  logger.log("• Skip unnecessary steps = reduced memory usage");
  logger.log("• Clear separation of concerns = easier debugging");
  logger.log("• Mode-specific optimizations possible");
}

/**
 * Run all demonstrations
 */
export function runModularConfigurationDemo() {
  logger.log("🧬 DARWINKIT MODULAR CONFIGURATION DEMO\\n");
  logger.log("This demonstrates the flexible architecture for selective");
  logger.log("use of mapping, transformation, and validation components.\\n");

  demonstrateMappingOnly();
  demonstrateTransformValidate();
  demonstrateMappingValidate();
  demonstrateMappingTransform();
  demonstrateArchitectureComparison();

  logger.log("\\n✨ Demo completed! The modular architecture supports");
  logger.log("   flexible component combinations for different use cases.");
}

// Run demo (executed via pnpm script)
try {
  runModularConfigurationDemo();
} catch (error) {
  logger.error("❌ Error running modular configuration demo:", error);
  process.exit(1);
}
