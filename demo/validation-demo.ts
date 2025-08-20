import logger from "~/utils/test-logger.ts";
/**
 * Validation Demo
 *
 * Demonstrates validation functions working in isolation, with transformations, and integrated pipeline
 */

import { type IntegratedConfiguration } from "~/lib/configurator/integrated-configuration.ts";
import {
  executeIntegratedConfiguration,
  validateIntegratedConfiguration,
} from "~/lib/configurator/integrated-executor.ts";
import {
  executeDatasetValidation,
  generateValidationSummary,
  validateValidationConfiguration,
} from "~/lib/configurator/validation-executor.ts";
import { MOCK_VOCABULARIES } from "./mapping-demo.ts";

// Sample data with various validation scenarios
const VALIDATION_TEST_DATA = [
  {
    // Valid row
    sex: "male",
    lifeStage: "adult",
    decimalLatitude: 40.7128,
    decimalLongitude: -74.006,
    eventDate: "2023-06-15",
    catalogNumber: "FISH_001",
    scientificName: "Oncorhynchus mykiss",
    recordedBy: "J. Smith",
    occurrenceRemarks: "Healthy specimen",
  },
  {
    // Invalid vocabulary terms
    sex: "INVALID_SEX",
    lifeStage: "spawning", // Not in strict vocabulary but in non-strict
    decimalLatitude: 45.5231,
    decimalLongitude: -122.6765,
    eventDate: "2023-06-16",
    catalogNumber: "", // Empty required field
    scientificName: "Oncorhynchus kisutch",
    recordedBy: "A. Brown",
    occurrenceRemarks: "Specimen in good condition",
  },
  {
    // Invalid coordinates and data types
    sex: "female",
    lifeStage: "juvenile",
    decimalLatitude: 95.0, // Invalid latitude (> 90)
    decimalLongitude: 200.0, // Invalid longitude (> 180)
    eventDate: "invalid-date",
    catalogNumber: "FISH_003",
    scientificName: "Oncorhynchus nerka",
    recordedBy: null,
    occurrenceRemarks: "",
  },
  {
    // Edge cases
    sex: "",
    lifeStage: "unknown",
    decimalLatitude: -90.0, // Valid edge case
    decimalLongitude: 180.0, // Valid edge case
    eventDate: "2023-12-31",
    catalogNumber: "FISH_004",
    scientificName:
      "Very very very very very very long scientific name that exceeds reasonable limits",
    recordedBy: "Dr. Research Scientist",
    occurrenceRemarks: "Normal observation",
  },
];

// Standalone validation configuration
const STANDALONE_VALIDATION_CONFIG = {
  name: "Darwin Core Data Validation",
  description: "Comprehensive validation of biodiversity data",
  validations: [
    {
      field: "sex",
      validations: [
        {
          functionName: "validateControlledVocabulary",
          parameters: {
            vocabularyName: "dwc:sex",
            strict: true,
            allowEmpty: true,
            caseSensitive: false,
          },
        },
      ],
    },
    {
      field: "lifeStage",
      validations: [
        {
          functionName: "validateControlledVocabulary",
          parameters: {
            vocabularyName: "dwc:life_stage",
            strict: false, // Non-strict vocabulary - warnings only
            allowEmpty: true,
            caseSensitive: false,
          },
        },
      ],
    },
    {
      field: "decimalLatitude",
      validations: [
        {
          functionName: "validateDataType",
          parameters: {
            expectedType: "number",
            allowEmpty: false,
          },
        },
        {
          functionName: "validateCoordinates",
          parameters: {
            type: "latitude",
            allowEmpty: false,
          },
        },
      ],
    },
    {
      field: "decimalLongitude",
      validations: [
        {
          functionName: "validateDataType",
          parameters: {
            expectedType: "number",
            allowEmpty: false,
          },
        },
        {
          functionName: "validateCoordinates",
          parameters: {
            type: "longitude",
            allowEmpty: false,
          },
        },
      ],
    },
    {
      field: "eventDate",
      validations: [
        {
          functionName: "validateDataType",
          parameters: {
            expectedType: "date",
            allowEmpty: false,
          },
        },
      ],
    },
    {
      field: "catalogNumber",
      validations: [
        {
          functionName: "validateRequired",
          parameters: {},
        },
        {
          functionName: "validateLength",
          parameters: {
            minLength: 3,
            maxLength: 50,
          },
        },
      ],
    },
    {
      field: "scientificName",
      validations: [
        {
          functionName: "validateRequired",
          parameters: {},
        },
        {
          functionName: "validateLength",
          parameters: {
            maxLength: 100,
          },
        },
        {
          functionName: "validatePattern",
          parameters: {
            pattern: "^[A-Z][a-z]+\\s[a-z]+",
            description: "binomial nomenclature (Genus species)",
            allowEmpty: false,
          },
        },
      ],
    },
  ],
};

// Integrated configuration with mapping + transformation + validation
const INTEGRATED_WITH_VALIDATION_CONFIG: IntegratedConfiguration = {
  name: "Fish Survey to Darwin Core - Full Pipeline with Validation",
  sourceFile: "fish_survey.csv",
  standard: "Darwin Core",

  globalParameters: {
    vocabularies: MOCK_VOCABULARIES,
  },

  fieldMappings: [
    {
      fieldName: "sex",
      sourceColumn: "organism_sex",
      targetField: "sex",
      transformations: [
        {
          functionName: "normalizeControlledVocabulary",
          parameters: {
            vocabularyName: "dwc:sex",
            defaultValue: "unknown",
            caseSensitive: false,
          },
        },
      ],
      validations: [
        {
          functionName: "validateControlledVocabulary",
          parameters: {
            vocabularyName: "dwc:sex",
            strict: true,
            allowEmpty: true,
          },
        },
      ],
    },
    {
      fieldName: "decimalLatitude",
      sourceColumn: "lat_long",
      targetField: "decimalLatitude",
      transformations: [
        {
          functionName: "parseCoordinates",
          parameters: {
            inputFormat: "auto",
            component: "latitude",
          },
        },
      ],
      validations: [
        {
          functionName: "validateCoordinates",
          parameters: {
            type: "latitude",
            allowEmpty: false,
          },
        },
      ],
    },
    {
      fieldName: "catalogNumber",
      sourceColumn: "specimen_id",
      targetField: "catalogNumber",
      validations: [
        {
          functionName: "validateRequired",
          parameters: {},
        },
        {
          functionName: "validateLength",
          parameters: {
            minLength: 3,
            maxLength: 50,
          },
        },
      ],
    },
  ],
};

// Demo functions
export function runStandaloneValidationDemo() {
  logger.log("=== Standalone Validation Demo ===\n");

  // 1. Validate configuration
  logger.log("1. Validating validation configuration...");
  const configValidation = validateValidationConfiguration(STANDALONE_VALIDATION_CONFIG);

  if (!configValidation.valid) {
    logger.error("❌ Configuration validation failed:", configValidation.errors);
    return;
  }
  logger.log("✅ Configuration is valid\n");

  // 2. Execute validation on dataset
  logger.log("2. Executing validation on test dataset...");
  const result = executeDatasetValidation(VALIDATION_TEST_DATA, STANDALONE_VALIDATION_CONFIG, {
    vocabularies: MOCK_VOCABULARIES,
  });

  logger.log(`📊 Validation Results: ${result.validRows}/${result.totalRows} rows are valid`);
  logger.log(`Overall success: ${result.success}\n`);

  // 3. Show detailed row-by-row results
  logger.log("3. Detailed validation results:\n");

  for (const rowResult of result.rowResults) {
    const status = rowResult.valid ? "✅" : "❌";
    logger.log(`${status} Row ${rowResult.rowIndex + 1}:`);

    // Show field-by-field validation results
    for (const [fieldName, fieldResult] of Object.entries(rowResult.fieldResults)) {
      const fieldStatus = fieldResult.valid ? "✅" : "❌";
      logger.log(`  ${fieldStatus} ${fieldName}: "${String(fieldResult.value)}"`);

      // Show validation steps
      for (const step of fieldResult.steps) {
        const stepStatus = step.valid ? "✅" : "❌";
        logger.log(`    ${stepStatus} ${step.functionName}`);
        if (step.errors) {
          logger.log(`      Error: ${step.errors.join("; ")}`);
        }
      }

      // Show accumulated errors and warnings
      if (fieldResult.errors.length > 0) {
        logger.log(`    Errors: ${fieldResult.errors.join("; ")}`);
      }
      if (fieldResult.warnings.length > 0) {
        logger.log(`    Warnings: ${fieldResult.warnings.join("; ")}`);
      }
    }
    logger.log();
  }

  // 4. Show summary statistics
  logger.log("4. Validation Summary:");
  const summary = generateValidationSummary(result);
  logger.log(`Total fields validated: ${summary.totalFields}`);
  logger.log(`Total validation checks: ${summary.totalValidations}`);
  logger.log(`Passed: ${summary.passedValidations}`);
  logger.log(`Failed: ${summary.failedValidations}\n`);

  for (const [fieldName, fieldSummary] of Object.entries(summary.fieldSummaries)) {
    logger.log(`${fieldName}: ${fieldSummary.validRows}/${fieldSummary.totalRows} rows valid`);
    if (fieldSummary.mostCommonErrors.length > 0) {
      logger.log(`  Common errors: ${fieldSummary.mostCommonErrors.slice(0, 2).join("; ")}`);
    }
  }

  logger.log("\n=== Standalone Validation Demo Complete ===\n");
}

export function runIntegratedValidationDemo() {
  logger.log("=== Integrated Pipeline with Validation Demo ===\n");

  // Sample source data for integrated pipeline
  const sourceData = [
    {
      organism_sex: "M",
      lat_long: "40.7128, -74.0060",
      specimen_id: "FISH_001",
    },
    {
      organism_sex: "INVALID",
      lat_long: "95.0, 200.0", // Invalid coordinates
      specimen_id: "", // Empty required field
    },
  ];

  // 1. Validate configuration
  logger.log("1. Validating integrated configuration...");
  const configValidation = validateIntegratedConfiguration(INTEGRATED_WITH_VALIDATION_CONFIG);

  if (!configValidation.valid) {
    logger.error("❌ Configuration validation failed:", configValidation.errors);
    return;
  }
  logger.log("✅ Configuration is valid\n");

  // 2. Execute integrated pipeline
  logger.log("2. Executing integrated pipeline (mapping + transformation + validation)...");
  const result = executeIntegratedConfiguration(sourceData, INTEGRATED_WITH_VALIDATION_CONFIG);

  logger.log(
    `📊 Pipeline Results: ${result.validRows}/${result.totalRows} rows processed successfully`,
  );

  // 3. Show detailed results
  for (const rowResult of result.rowResults) {
    const status = rowResult.success ? "✅" : "❌";
    logger.log(`\n${status} Row ${rowResult.rowIndex + 1}:`);

    logger.log(
      "  📥 Source:",
      JSON.stringify(sourceData[rowResult.rowIndex], null, 4).replace(/\n/g, "\n    "),
    );

    logger.log("  🔄 Pipeline steps:");
    for (const [fieldName, fieldResult] of Object.entries(rowResult.fieldResults)) {
      const fieldStatus = fieldResult.success ? "✅" : "❌";
      logger.log(`    ${fieldStatus} ${fieldResult.sourceColumn} → ${fieldName}:`);
      logger.log(`      Original: "${String(fieldResult.originalValue)}"`);
      logger.log(`      Final: "${String(fieldResult.finalValue)}"`);

      // Show transformation steps
      if (fieldResult.transformationSteps.length > 0) {
        logger.log("      Transformations:");
        for (const step of fieldResult.transformationSteps) {
          const stepStatus = step.success ? "✅" : "❌";
          logger.log(
            `        ${stepStatus} ${step.functionName}: "${String(step.inputValue)}" → "${
              String(step.outputValue)
            }"`,
          );
        }
      }

      // Show validation steps
      if (fieldResult.validationSteps.length > 0) {
        logger.log("      Validations:");
        for (const step of fieldResult.validationSteps) {
          const stepStatus = step.success ? "✅" : "❌";
          logger.log(`        ${stepStatus} ${step.functionName}`);
          if (step.error) {
            logger.log(`          Error: ${step.error}`);
          }
        }
      }

      if (fieldResult.errors.length > 0) {
        logger.log(`      Errors: ${fieldResult.errors.join("; ")}`);
      }
    }

    logger.log(
      "  📤 Output:",
      JSON.stringify(rowResult.transformedRow, null, 4).replace(/\n/g, "\n    "),
    );
  }

  logger.log("\n=== Integrated Validation Demo Complete ===");
}

// Run demos
export function runAllValidationDemos() {
  runStandaloneValidationDemo();
  runIntegratedValidationDemo();
}

// Run demo (executed via pnpm script)
runAllValidationDemos();
