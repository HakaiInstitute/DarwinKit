/**
 * Dataset-Aware Validation Demo
 *
 * Demonstrates row-level validations with full dataset context for cross-row validation
 */

import {
  executeDatasetValidationWithContext,
  validateValidationConfiguration,
  type ValidationConfiguration,
} from "~/lib/configurator/validation-executor";
import logger from "~/utils/test-logger";
import { type Dataset } from "../test/validations.test";

// import {
//   executeDatasetValidationWithContext,
//   validateValidationConfiguration
// } from '../lib/validation-executor.js';

// Sample dataset with various cross-row validation scenarios
const DATASET_VALIDATION_TEST_DATA: Dataset = [
  // Survey parent events (these are what other events reference)
  {
    catalogNumber: null, // Survey events don't have specimens
    eventID: "SURVEY_2023",
    parentEventID: null,
    scientificName: null,
    kingdom: null,
    collectionDate: "2023-06-01",
    decimalLatitude: 45.5,
    recordedBy: "Survey Team",
    eventType: "survey",
  },
  {
    catalogNumber: null,
    eventID: "SURVEY_2024",
    parentEventID: null,
    scientificName: null,
    kingdom: null,
    collectionDate: "2024-01-01",
    decimalLatitude: 46.0,
    recordedBy: "Survey Team",
    eventType: "survey",
  },
  // Specimen collection events
  {
    catalogNumber: "FISH_001",
    eventID: "EVENT_001",
    parentEventID: "SURVEY_2023", // Valid reference
    scientificName: "Salmo salar",
    kingdom: "Animalia",
    collectionDate: "2023-06-15",
    decimalLatitude: 45.5231,
    recordedBy: "J. Smith",
    eventType: "specimen",
  },
  {
    catalogNumber: "FISH_002",
    eventID: "EVENT_002",
    parentEventID: "SURVEY_2023", // Valid reference
    scientificName: "Oncorhynchus mykiss",
    kingdom: "Animalia", // Should be consistent within same survey
    collectionDate: "2023-06-16", // Sequential dates
    decimalLatitude: 45.5245,
    recordedBy: "J. Smith",
    eventType: "specimen",
  },
  {
    catalogNumber: "FISH_001", // DUPLICATE - should fail uniqueness
    eventID: "EVENT_003",
    parentEventID: "SURVEY_2023", // Valid reference
    scientificName: "Salmo trutta",
    kingdom: "Plantae", // INCONSISTENT - different kingdom in same survey
    collectionDate: "2023-06-14", // OUT OF ORDER - earlier date
    decimalLatitude: 45.526,
    recordedBy: "A. Brown",
    eventType: "specimen",
  },
  {
    catalogNumber: "FISH_004",
    eventID: "EVENT_004",
    parentEventID: "SURVEY_2024", // Valid reference to different survey
    scientificName: "Gadus morhua",
    kingdom: "Animalia",
    collectionDate: "2024-01-10",
    decimalLatitude: 46.1234,
    recordedBy: "M. Johnson",
    eventType: "specimen",
  },
  {
    catalogNumber: "FISH_005",
    eventID: "EVENT_005",
    parentEventID: "INVALID_SURVEY", // ORPHANED - references non-existent survey
    scientificName: "Clupea harengus",
    kingdom: "Animalia",
    collectionDate: "2023-07-20",
    decimalLatitude: 46.5678,
    recordedBy: "S. Wilson",
    eventType: "specimen",
  },
];

// Additional reference data (simulates lookup tables)
// const VALID_PARENT_EVENTS = [
//   { eventID: 'SURVEY_2023', eventType: 'field_survey', location: 'Atlantic Coast' },
//   { eventID: 'SURVEY_2024', eventType: 'field_survey', location: 'Pacific Coast' }
// ];

// Dataset-aware validation configuration
const DATASET_VALIDATION_CONFIG: ValidationConfiguration = {
  name: "Cross-Row Biodiversity Data Validation",
  description: "Validates consistency and referential integrity across the entire dataset",
  validations: [
    {
      field: "catalogNumber",
      validations: [
        {
          functionName: "validateUnique",
          parameters: {
            fieldName: "catalogNumber",
            message: "Catalog numbers must be unique across the dataset",
          },
        },
      ],
    },
    {
      field: "parentEventID",
      validations: [
        {
          functionName: "validateReferentialIntegrity",
          parameters: {
            referenceField: "eventID", // Look for rows where eventID matches our parentEventID
            message: "Parent event ID must reference a valid event in the dataset",
          },
        },
      ],
    },
    {
      field: "kingdom",
      validations: [
        {
          functionName: "validateConsistentWithRelated",
          parameters: {
            groupByField: "parentEventID",
            // @ts-expect-error - TODO: wtf?
            consistentFields: ["kingdom"],
            message: "All specimens from the same survey should have consistent taxonomic kingdom",
          },
        },
      ],
    },
    {
      field: "collectionDate",
      validations: [
        {
          functionName: "validateSequentialOrder",
          parameters: {
            orderField: "collectionDate",
            direction: "asc",
            allowEqual: true,
            message: "Collection dates should be in chronological order",
          },
        },
      ],
    },
  ],
};

// Test scenarios for different validation types
const VALIDATION_TEST_SCENARIOS = [
  {
    name: "Uniqueness Validation",
    description: "Catalog numbers should be unique across the entire dataset",
    expectedFailures: ["FISH_001 appears in rows 1 and 3"],
  },
  {
    name: "Referential Integrity",
    description: "Parent event IDs should reference valid events",
    expectedFailures: ["INVALID_SURVEY not found in dataset"],
  },
  {
    name: "Cross-Row Consistency",
    description: "Taxonomic data should be consistent within survey groups",
    expectedFailures: ["Different kingdoms within SURVEY_2023"],
  },
  {
    name: "Sequential Ordering",
    description: "Collection dates should be in chronological order",
    expectedFailures: ["Date 2023-06-14 comes after 2023-06-16"],
  },
];

export function runDatasetValidationDemo() {
  logger.section("Dataset-Aware Validation Demo");

  // 1. Validate configuration
  logger.log("1. Validating dataset validation configuration...");
  const configValidation = validateValidationConfiguration(DATASET_VALIDATION_CONFIG);

  if (!configValidation.valid) {
    logger.error("❌ Configuration validation failed:");
    logger.json(configValidation.errors);
    return;
  }
  logger.success("Configuration is valid");
  logger.log("");

  // 2. Show test data structure
  logger.subsection("2. Dataset structure");
  logger.log(`   Total rows: ${DATASET_VALIDATION_TEST_DATA.length}`);
  logger.log(
    "   Fields: catalogNumber, eventID, parentEventID, scientificName, kingdom, collectionDate, decimalLatitude, recordedBy"
  );
  logger.log("   Expected validation issues:");
  VALIDATION_TEST_SCENARIOS.forEach((scenario, i) => {
    logger.log(`   ${i + 1}. ${scenario.name}: ${scenario.description}`);
  });
  logger.log("");

  // 3. Execute dataset-aware validation
  logger.log("3. Executing dataset-aware validations...");
  const result = executeDatasetValidationWithContext(
    DATASET_VALIDATION_TEST_DATA,
    DATASET_VALIDATION_CONFIG
  );

  logger.info(`📊 Validation Results: ${result.validRows}/${result.totalRows} rows are valid`);
  logger.check(result.success, "Overall validation: PASSED", "Overall validation: FAILED");
  logger.log("");

  // 4. Show detailed row-by-row results
  logger.subsection("4. Detailed validation results");
  logger.log("");

  for (const rowResult of result.rowResults) {
    const _status = rowResult.valid ? "✅" : "❌";
    logger.status(rowResult.valid, `Row ${rowResult.rowIndex + 1}:`);

    // Show source data for context
    const sourceRow = DATASET_VALIDATION_TEST_DATA[rowResult.rowIndex];
    logger.log(
      `   Data: catalogNumber="${String(sourceRow.catalogNumber)}", parentEventID="${String(sourceRow.parentEventID)}", kingdom="${String(sourceRow.kingdom)}", date="${String(sourceRow.collectionDate)}"`
    );

    // Show field-by-field validation results
    for (const [fieldName, fieldResult] of Object.entries(rowResult.fieldResults)) {
      const _fieldStatus = fieldResult.valid ? "✅" : "❌";
      logger.status(fieldResult.valid, `   ${fieldName}: "${String(fieldResult.value)}"`);

      // Show validation steps with details
      for (const step of fieldResult.steps) {
        const _stepStatus = step.valid ? "✅" : "❌";
        logger.status(step.valid, `     ${step.functionName}`);
        if (step.errors.length > 0) {
          step.errors.forEach((error) => logger.error(`       Error: ${error}`));
        }
        if (step.warnings.length > 0) {
          step.warnings.forEach((warning) => logger.warn(`       Warning: ${warning}`));
        }
      }
    }
    logger.log("");
  }

  // 5. Show cross-row validation insights
  logger.subsection("5. Dataset-wide validation insights");

  // Analyze uniqueness violations
  const uniquenessFails = result.rowResults.filter(
    (row) => row.fieldResults.catalogNumber && !row.fieldResults.catalogNumber.valid
  );
  if (uniquenessFails.length > 0) {
    logger.warning(
      `🔍 Uniqueness violations: ${uniquenessFails.length} rows have duplicate catalog numbers`
    );
  }

  // Analyze referential integrity
  const referentialFails = result.rowResults.filter(
    (row) => row.fieldResults.parentEventID && !row.fieldResults.parentEventID.valid
  );
  if (referentialFails.length > 0) {
    logger.warning(
      `🔗 Referential integrity issues: ${referentialFails.length} rows reference invalid parent events`
    );
  }

  // Analyze consistency issues
  const consistencyFails = result.rowResults.filter(
    (row) => row.fieldResults.kingdom && !row.fieldResults.kingdom.valid
  );
  if (consistencyFails.length > 0) {
    logger.warning(
      `📊 Consistency issues: ${consistencyFails.length} rows have inconsistent data within their groups`
    );
  }

  // Analyze sequential order issues
  const orderFails = result.rowResults.filter(
    (row) => row.fieldResults.collectionDate && !row.fieldResults.collectionDate.valid
  );
  if (orderFails.length > 0) {
    logger.warning(
      `📅 Sequential order issues: ${orderFails.length} rows break chronological ordering`
    );
  }

  logger.log("");

  // 6. Show field statistics
  logger.subsection("6. Field-level validation statistics");
  for (const [fieldName, stats] of Object.entries(result.fieldStatistics)) {
    const successRate = Math.round((stats.valid / stats.totalProcessed) * 100);
    logger.log(`   ${fieldName}: ${stats.valid}/${stats.totalProcessed} valid (${successRate}%)`);

    if (stats.mostCommonErrors.length > 0) {
      logger.warn(`     Common errors: ${stats.mostCommonErrors[0]}`);
    }
  }

  logger.section("Dataset-Aware Validation Demo Complete");

  return result;
}

// Export test data for use in other demos
export { DATASET_VALIDATION_CONFIG, DATASET_VALIDATION_TEST_DATA };

// Run demo (executed via pnpm script)
runDatasetValidationDemo();
