import logger from "~/utils/test-logger";
/**
 * Configuration Visualization Demo
 *
 * Shows how to use the visualization system with different configuration types
 */

import type { IntegratedConfiguration } from "~/lib/configurator/integrated-configuration";
import {
  createMappingOnlyConfig,
  createMappingValidateConfig,
  createTransformValidateConfig,
} from "~/lib/configurator/modular-configuration";
import { createVisualizationFromIntegrated, createVisualizationFromModular } from "~/lib/visualize";

// Sample mapping-only configuration
const mappingOnlyDemo = createMappingOnlyConfig({
  name: "Darwin Core Field Mapping",
  mappings: [
    { sourceColumn: "organism_sex", targetField: "sex" },
    { sourceColumn: "lat_dd", targetField: "decimalLatitude" },
    { sourceColumn: "lon_dd", targetField: "decimalLongitude" },
    { sourceColumn: "date_collected", targetField: "eventDate" },
    { sourceColumn: "life_stage", targetField: "lifeStage" },
  ],
});

// Sample mapping + validation configuration
const mappingValidateDemo = createMappingValidateConfig({
  name: "Mapping with Data Validation",
  mappings: [
    {
      sourceColumn: "organism_sex",
      targetField: "sex",
      validations: [
        {
          functionName: "validateControlledVocabulary",
          parameters: { vocabularyName: "sex" },
        },
        { functionName: "validateRequiredField", parameters: {} },
      ],
    },
    {
      sourceColumn: "lat_dd",
      targetField: "decimalLatitude",
      validations: [
        { functionName: "validateLatitude", parameters: {} },
        {
          functionName: "validateCoordinatePrecision",
          parameters: { decimalPlaces: 6 },
        },
      ],
    },
  ],
});

// Sample transform + validation configuration
const transformValidateDemo = createTransformValidateConfig({
  name: "Data Transformation and Validation",
  fields: [
    {
      fieldName: "eventDate",
      transformations: [
        {
          functionName: "parseDate",
          parameters: { inputFormat: "MM/DD/YYYY", outputFormat: "ISO8601" },
        },
        {
          functionName: "normalizeTimezone",
          parameters: { targetTimezone: "UTC" },
        },
      ],
      validations: [
        {
          functionName: "validateDateFormat",
          parameters: { format: "ISO8601" },
        },
        {
          functionName: "validateDateRange",
          parameters: { minDate: "1900-01-01", maxDate: "today" },
        },
        { functionName: "validateFutureDate", parameters: {} },
      ],
    },
    {
      fieldName: "scientificName",
      transformations: [
        {
          functionName: "normalizeCase",
          parameters: { targetCase: "sentence" },
        },
        { functionName: "trimWhitespace", parameters: {} },
      ],
      validations: [
        {
          functionName: "validateTaxonomicName",
          parameters: { registry: "worms" },
        },
        { functionName: "validateRequiredField", parameters: {} },
      ],
    },
  ],
});

// Sample full integrated configuration
const integratedDemo: IntegratedConfiguration = {
  name: "Complete Biodiversity Data Pipeline",
  sourceFile: "marine_specimens.csv",
  standard: "Darwin Core",
  globalParameters: {
    vocabularies: {
      sex: {
        name: "sex",
        strict: true,
        terms: [
          { term: "male", synonyms: ["M", "Male"] },
          { term: "female", synonyms: ["F", "Female"] },
          { term: "hermaphrodite", synonyms: ["H"] },
        ],
      },
    },
  },
  fieldMappings: [
    {
      sourceColumn: "specimen_sex",
      targetField: "sex",
      transformations: [
        {
          functionName: "normalizeCase",
          parameters: { targetCase: "lowercase" },
        },
      ],
      validations: [
        {
          functionName: "validateControlledVocabulary",
          parameters: { vocabularyName: "sex" },
        },
      ],
    },
    {
      sourceColumn: "collection_date",
      targetField: "eventDate",
      transformations: [
        {
          functionName: "parseDate",
          parameters: { inputFormat: "DD-MM-YYYY" },
        },
      ],
      validations: [
        { functionName: "validateDateFormat", parameters: {} },
        {
          functionName: "validateDateRange",
          parameters: { minDate: "1800-01-01" },
        },
      ],
    },
    {
      sourceColumn: "latitude",
      targetField: "decimalLatitude",
      transformations: [
        {
          functionName: "convertToDecimal",
          parameters: { sourceFormat: "DMS" },
        },
      ],
      validations: [
        { functionName: "validateLatitude", parameters: {} },
        {
          functionName: "validateCoordinatePrecision",
          parameters: { decimalPlaces: 6 },
        },
      ],
    },
  ],
};

/**
 * Generate visualization data for all demo configurations
 */
export function generateVisualizationDemos() {
  logger.log("📊 Configuration Visualization Demos");
  logger.log("=====================================\n");

  const vizConfig = {
    layout: "horizontal" as const,
    showParameters: true,
    compactMode: false,
  };

  // Mapping-only visualization
  logger.log("🗺️  Mapping-Only Configuration");
  logger.log("------------------------------");
  const mappingViz = createVisualizationFromModular(mappingOnlyDemo, vizConfig);
  logger.log(`Nodes: ${mappingViz.nodes.length}, Edges: ${mappingViz.edges.length}`);
  logger.log("Node types:", mappingViz.nodes.map((n) => n.data.type).join(", "));
  logger.log("");

  // Mapping + validation visualization
  logger.log("✅ Mapping + Validation Configuration");
  logger.log("------------------------------------");
  const mappingValidateViz = createVisualizationFromModular(mappingValidateDemo, vizConfig);
  logger.log(
    `Nodes: ${mappingValidateViz.nodes.length}, Edges: ${mappingValidateViz.edges.length}`
  );
  logger.log("Node types:", mappingValidateViz.nodes.map((n) => n.data.type).join(", "));
  logger.log("");

  // Transform + validation visualization
  logger.log("🔄 Transform + Validate Configuration");
  logger.log("------------------------------------");
  const transformValidateViz = createVisualizationFromModular(transformValidateDemo, vizConfig);
  logger.log(
    `Nodes: ${transformValidateViz.nodes.length}, Edges: ${transformValidateViz.edges.length}`
  );
  logger.log("Node types:", transformValidateViz.nodes.map((n) => n.data.type).join(", "));
  logger.log("");

  // Integrated visualization
  logger.log("🚀 Full Integrated Configuration");
  logger.log("-------------------------------");
  const integratedViz = createVisualizationFromIntegrated(integratedDemo, vizConfig);
  logger.log(`Nodes: ${integratedViz.nodes.length}, Edges: ${integratedViz.edges.length}`);
  logger.log("Node types:", integratedViz.nodes.map((n) => n.data.type).join(", "));
  logger.log("");

  // Return all visualization data for potential use
  return {
    mappingOnly: { config: mappingOnlyDemo, visualization: mappingViz },
    mappingValidate: {
      config: mappingValidateDemo,
      visualization: mappingValidateViz,
    },
    transformValidate: {
      config: transformValidateDemo,
      visualization: transformValidateViz,
    },
    integrated: { config: integratedDemo, visualization: integratedViz },
  };
}

/**
 * Run the demo (executed via pnpm script)
 */
generateVisualizationDemos();
