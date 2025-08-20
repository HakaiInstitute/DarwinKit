/**
 * Integrated Demo
 *
 * Demonstrates unified mapping + transformation + validation pipeline
 */

import {
  executeIntegratedConfiguration,
  validateIntegratedConfiguration,
} from "~/lib/configurator/integrated-executor.ts";
import type { IntegratedConfiguration } from "~/lib/configurator/types/configuration.ts";
import logger from "~/utils/test-logger.ts";
import { MOCK_VOCABULARIES } from "./mapping-demo.ts";

// Sample source data (raw CSV-like data)
const SAMPLE_SOURCE_DATA = [
  {
    organism_sex: "M",
    life_stage: "adult",
    lat_long: "40.7128, -74.0060",
    date_collected: "2023-06-15",
    specimen_id: "FISH_001",
    species: "Oncorhynchus mykiss",
    collector: "J. Smith",
    prep_type: "dried",
    notes: "  healthy specimen  ",
  },
  {
    organism_sex: "FEMALE",
    life_stage: "JUV",
    lat_long: "41.2524° N, 95.9980° W",
    date_collected: "15/06/2023",
    specimen_id: "FISH_002",
    species: "Oncorhynchus kisutch",
    collector: "A. Brown",
    prep_type: "ALCOHOL",
    notes: "uncertain identification",
  },
  {
    organism_sex: "",
    life_stage: "unknown",
    lat_long: "invalid coords",
    date_collected: "June 17, 2023",
    specimen_id: "FISH_003",
    species: "Oncorhynchus nerka",
    collector: "",
    prep_type: "frozen",
    notes: "",
  },
];

// Integrated configuration combining mapping + transformation
const INTEGRATED_CONFIG: IntegratedConfiguration = {
  name: "Fish Survey to Darwin Core - Integrated Pipeline",
  sourceFile: "fish_survey.csv",
  standard: "Darwin Core",

  globalParameters: {
    vocabularies: MOCK_VOCABULARIES,
    dateFormat: "auto",
    coordinatePrecision: 6,
  },

  fieldMappings: [
    // Sex field: mapping + vocabulary transformation
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
    },

    // Life stage field: mapping + vocabulary transformation
    {
      fieldName: "lifeStage",
      sourceColumn: "life_stage",
      targetField: "lifeStage",
      transformations: [
        {
          functionName: "normalizeControlledVocabulary",
          parameters: {
            vocabularyName: "dwc:life_stage",
            defaultValue: "unknown",
            caseSensitive: false,
          },
        },
      ],
    },

    // Latitude extraction: mapping + coordinate parsing
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
    },

    // Longitude extraction: mapping + coordinate parsing
    {
      fieldName: "decimalLongitude",
      sourceColumn: "lat_long",
      targetField: "decimalLongitude",
      transformations: [
        {
          functionName: "parseCoordinates",
          parameters: {
            inputFormat: "auto",
            component: "longitude",
          },
        },
      ],
    },

    // Date standardization: mapping + date parsing
    {
      fieldName: "eventDate",
      sourceColumn: "date_collected",
      targetField: "eventDate",
      transformations: [
        {
          functionName: "parseDate",
          parameters: {
            inputFormat: "auto",
            outputFormat: "iso",
          },
        },
      ],
    },

    // Simple mappings (no transformation needed)
    {
      fieldName: "catalogNumber",
      sourceColumn: "specimen_id",
      targetField: "catalogNumber",
    },
    {
      fieldName: "scientificName",
      sourceColumn: "species",
      targetField: "scientificName",
    },
    {
      fieldName: "recordedBy",
      sourceColumn: "collector",
      targetField: "recordedBy",
    },

    // Notes field: mapping + string cleaning
    {
      fieldName: "occurrenceRemarks",
      sourceColumn: "notes",
      targetField: "occurrenceRemarks",
      transformations: [
        {
          functionName: "trimWhitespace",
          parameters: {
            sides: "both",
          },
        },
      ],
    },
  ],
};

// Execute integrated demo
export function runIntegratedDemo() {
  logger.section("Integrated Mapping + Transformation Demo");

  // 1. Validate configuration
  logger.log("1. Validating integrated configuration...");
  const validation = validateIntegratedConfiguration(INTEGRATED_CONFIG);

  if (!validation.valid) {
    logger.error("❌ Configuration validation failed:");
    validation.errors.forEach((error) => logger.error(`  - ${error}`));
    return;
  }

  logger.success("Configuration is valid");
  if (validation.warnings.length > 0) {
    logger.warning("Warnings:");
    validation.warnings.forEach((warning) => logger.warn(`  - ${warning}`));
  }
  logger.log("");

  // 2. Execute integrated pipeline
  logger.log("2. Executing integrated pipeline...");
  const result = executeIntegratedConfiguration(
    SAMPLE_SOURCE_DATA,
    INTEGRATED_CONFIG,
  );

  logger.success("Pipeline execution completed");
  logger.info(
    `📊 Results: ${result.validRows}/${result.totalRows} rows processed successfully`,
  );

  if (result.globalErrors.length > 0) {
    logger.log("");
    logger.error("Global errors:");
    result.globalErrors.forEach((error) => logger.error(`  - ${error}`));
  }
  logger.log("");

  // 3. Show detailed row-by-row results
  logger.subsection("3. Row-by-row execution details");

  for (const rowResult of result.rowResults) {
    const _status = rowResult.success ? "✅" : "❌";
    logger.status(rowResult.success, `Row ${rowResult.rowIndex + 1}:`);

    // Show original source data
    const sourceRow = SAMPLE_SOURCE_DATA[rowResult.rowIndex];
    logger.log("  📥 Source:");
    logger.json(sourceRow);

    // Show field-by-field transformations
    logger.log("  🔄 Field transformations:");
    for (
      const [fieldName, fieldResult] of Object.entries(
        rowResult.fieldResults,
      )
    ) {
      const _fieldStatus = fieldResult.success ? "✅" : "❌";
      logger.status(
        fieldResult.success,
        `  ${fieldResult.sourceColumn} → ${fieldName}:`,
      );
      logger.log(`      Original: "${String(fieldResult.originalValue)}"`);
      logger.log(`      Final: "${String(fieldResult.finalValue)}"`);

      // Show transformation steps
      if (fieldResult.transformationSteps.length > 0) {
        logger.log("      Steps:");
        for (const step of fieldResult.transformationSteps) {
          const _stepStatus = step.success ? "✅" : "❌";
          logger.status(
            step.success,
            `      ${step.functionName}: "${String(step.inputValue)}" → "${
              String(step.outputValue)
            }"`,
          );
          if (step.error) {
            logger.error(`          Error: ${step.error}`);
          }
        }
      }

      if (fieldResult.errors.length > 0) {
        logger.error(`      Errors: ${fieldResult.errors.join(", ")}`);
      }
    }

    // Show final transformed row
    logger.log("  📤 Output:");
    logger.json(rowResult.transformedRow);
    logger.log("");
  }

  // 4. Show execution summary
  logger.subsection("4. Execution Summary");
  logger.log(`   Configuration: ${result.configurationName}`);
  logger.log(`   Total rows: ${result.totalRows}`);
  logger.log(`   Valid rows: ${result.validRows}`);
  logger.log(`   Invalid rows: ${result.invalidRows}`);
  logger.check(
    result.success,
    `   Overall success: true`,
    `   Overall success: false`,
  );
  logger.log("");

  // 5. Field statistics
  logger.subsection("5. Field Statistics");
  for (const [fieldName, stats] of Object.entries(result.fieldStatistics)) {
    logger.log(`   ${fieldName}:`);
    logger.log(`     Processed: ${stats.totalProcessed}`);
    logger.log(`     Successful: ${stats.successful}`);
    logger.log(`     Failed: ${stats.failed}`);
    if (stats.mostCommonErrors.length > 0) {
      logger.warn(`     Common errors: ${stats.mostCommonErrors.join("; ")}`);
    }
  }
  logger.log("");

  // 6. Final transformed dataset
  logger.subsection("6. Final Transformed Dataset (Valid Rows Only)");
  logger.json(result.transformedData);

  logger.section("Integrated Demo Complete");
}

// Export configuration for testing
export { INTEGRATED_CONFIG, SAMPLE_SOURCE_DATA };

// Run demo (executed via pnpm script)
runIntegratedDemo();
