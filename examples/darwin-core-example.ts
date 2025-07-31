import { ProjectConfiguration } from "../app/util/configuration-types";
import { ConfigurationProcessor } from "../app/util/configuration-processor";

// Example Darwin Core configuration for a biodiversity dataset
export const exampleDarwinCoreConfig: ProjectConfiguration = {
  name: "Marine Species Survey Configuration",
  standardName: "Darwin Core",
  standardVersion: "1.0.0",
  fieldMappings: [
    {
      sourceColumn: "organism_sex",
      targetField: "sex",
      transformations: [
        {
          functionName: "normalizeGender",
          parameters: {
            maleTerms: ["M", "male", "Male", "MALE"],
            femaleTerms: ["F", "female", "Female", "FEMALE"],
            hermaphroditeTerms: ["H", "hermaphrodite", "Hermaphrodite"],
            defaultValue: "unknown",
          },
        },
      ],
      validations: [
        {
          functionName: "validateControlledVocabulary",
          parameters: {
            vocabulary: ["male", "female", "hermaphrodite", "unknown"],
            strict: true,
            caseSensitive: false,
          },
        },
      ],
    },
    {
      sourceColumn: "latitude_dd",
      targetField: "decimalLatitude",
      transformations: [
        {
          functionName: "formatCoordinates",
          parameters: {
            precision: 6,
            format: "decimal",
          },
        },
      ],
      validations: [
        {
          functionName: "validateRequired",
          parameters: {
            allowEmpty: false,
          },
        },
        {
          functionName: "validateCoordinateRange",
          parameters: {
            type: "latitude",
            allowNull: false,
          },
        },
      ],
    },
    {
      sourceColumn: "longitude_dd",
      targetField: "decimalLongitude",
      transformations: [
        {
          functionName: "formatCoordinates",
          parameters: {
            precision: 6,
            format: "decimal",
          },
        },
      ],
      validations: [
        {
          functionName: "validateRequired",
          parameters: {
            allowEmpty: false,
          },
        },
        {
          functionName: "validateCoordinateRange",
          parameters: {
            type: "longitude",
            allowNull: false,
          },
        },
      ],
    },
    {
      sourceColumn: "collection_date",
      targetField: "eventDate",
      transformations: [
        {
          functionName: "formatDate",
          parameters: {
            inputFormat: "auto",
            outputFormat: "YYYY-MM-DD",
          },
        },
      ],
      validations: [
        {
          functionName: "validateRequired",
          parameters: {
            allowEmpty: false,
          },
        },
        {
          functionName: "validateDateRange",
          parameters: {
            minDate: "1800-01-01",
            allowFuture: false,
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
            vocabulary: ["adult", "juvenile", "larva", "egg", "unknown"],
            caseSensitive: false,
            allowPartialMatch: true,
            defaultValue: "unknown",
          },
        },
      ],
      validations: [
        {
          functionName: "validateControlledVocabulary",
          parameters: {
            vocabulary: ["adult", "juvenile", "larva", "egg", "unknown"],
            strict: false, // Allow non-standard values with warnings
            caseSensitive: false,
          },
        },
      ],
    },
  ],
};

// Example source data
export const exampleSourceData = [
  {
    organism_sex: "M",
    latitude_dd: "45.123456789",
    longitude_dd: "-123.987654321",
    collection_date: "2023-06-15",
    life_stage: "Adult",
  },
  {
    organism_sex: "female",
    latitude_dd: 44.5678,
    longitude_dd: -124.1234,
    collection_date: "2023-06-16",
    life_stage: "juv", // Will be normalized to "juvenile"
  },
  {
    organism_sex: "X", // Invalid - will cause validation error
    latitude_dd: 91, // Invalid latitude - will cause validation error
    longitude_dd: -180.1, // Invalid longitude - will cause validation error
    collection_date: "2025-01-01", // Future date - will cause validation error
    life_stage: "pupae", // Not in vocabulary - will cause warning
  },
];

// Demonstration function
export async function demonstrateConfiguration() {
  console.log("🧬 DarwinKit Configuration Example\\n");
  
  const processor = new ConfigurationProcessor(exampleDarwinCoreConfig);
  const result = await processor.processDataset(exampleSourceData);
  
  console.log("📊 Processing Summary:");
  console.log(`Total rows: ${result.summary.totalRows}`);
  console.log(`Valid rows: ${result.summary.validRows}`);
  console.log(`Invalid rows: ${result.summary.invalidRows}`);
  console.log(`Rows with warnings: ${result.summary.rowsWithWarnings}\\n`);
  
  console.log("🔍 Field-level Error Counts:");
  Object.entries(result.summary.fieldErrors).forEach(([field, count]) => {
    console.log(`  ${field}: ${count} errors`);
  });
  
  console.log("\\n⚠️  Field-level Warning Counts:");
  Object.entries(result.summary.fieldWarnings).forEach(([field, count]) => {
    console.log(`  ${field}: ${count} warnings`);
  });
  
  console.log("\\n✅ Transformed Valid Data:");
  const transformedData = await processor.getTransformedData(exampleSourceData, false);
  console.log(JSON.stringify(transformedData, null, 2));
  
  console.log("\\n🚨 Detailed Row Results:");
  result.rows.forEach((row, index) => {
    console.log(`\\nRow ${index + 1}:`);
    console.log(`  Valid: ${row.isValid}`);
    console.log(`  Has warnings: ${row.hasWarnings}`);
    
    row.fields.forEach(field => {
      if (field.validationResult.errors.length > 0 || field.validationResult.warnings.length > 0) {
        console.log(`  ${field.sourceColumn} -> ${field.targetField}:`);
        console.log(`    Original: ${field.originalValue}`);
        console.log(`    Transformed: ${field.transformedValue}`);
        
        if (field.validationResult.errors.length > 0) {
          console.log(`    Errors: ${field.validationResult.errors.join(", ")}`);
        }
        
        if (field.validationResult.warnings.length > 0) {
          console.log(`    Warnings: ${field.validationResult.warnings.join(", ")}`);
        }
      }
    });
  });
}

// Export for testing
if (require.main === module) {
  demonstrateConfiguration().catch(console.error);
}