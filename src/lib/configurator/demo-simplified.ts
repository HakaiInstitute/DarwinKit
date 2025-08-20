/**
 * Demo of Simplified Type System
 *
 * Shows how the new DataValue-based types work with real data processing
 */

import { DataRow, DataValue, PipelineConfiguration } from "./types/core.ts";
import type { ExecutionResult } from "./types/results.ts";

// Sample CSV data (as it would come from DuckDB)
const sampleData: DataRow[] = [
  {
    organism_sex: "male",
    latitude_dd: 42.3601,
    collection_date: new Date("2023-05-15"),
    specimen_count: 5,
    verified: true,
    notes: null,
  },
  {
    organism_sex: "female",
    latitude_dd: 42.3582,
    collection_date: new Date("2023-05-16"),
    specimen_count: 3,
    verified: false,
    notes: "Needs verification",
  },
];

// Simplified configuration (replaces 16 different interfaces)
const pipelineConfig: PipelineConfiguration = {
  name: "Darwin Core Mapping and Validation",
  description: "Map CSV columns to Darwin Core standard with validation",
  globalParameters: {
    strict_validation: true,
    target_standard: "Darwin Core",
  },
  operations: [
    {
      field: "sex",
      source: "organism_sex",
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
      field: "decimalLatitude",
      source: "latitude_dd",
      transforms: [
        {
          functionName: "normalizeCoordinates",
          parameters: { precision: 6 },
        },
      ],
      validations: [
        {
          functionName: "validateCoordinates",
          parameters: { type: "latitude" },
        },
      ],
    },
    {
      field: "eventDate",
      source: "collection_date",
      transforms: [
        {
          functionName: "formatDate",
          parameters: { format: "ISO8601" },
        },
      ],
      validations: [
        {
          functionName: "validateDateRange",
          parameters: {
            allowFuture: false,
            minDate: "1900-01-01",
          },
        },
      ],
    },
  ],
};

// Mock execution function (demonstrates simplified interface)
function executePipeline(
  data: DataRow[],
): ExecutionResult {
  return {
    success: true,
    processedRows: data.length,
    validRows: data.length,
    invalidRows: 0,
    transformedData: data.map((row) => ({
      sex: row.organism_sex,
      decimalLatitude: row.latitude_dd,
      eventDate: row.collection_date,
    })),
    errors: [],
    warnings: [],
  };
}

// Type safety demonstration
function processDataValue(value: DataValue): string {
  if (value === null) return "NULL";
  if (typeof value === "string") return value.toUpperCase();
  if (typeof value === "number") return value.toFixed(2);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

// Demo execution
console.log("=== Simplified Type System Demo ===");
console.log("Sample data types:", typeof sampleData[0].organism_sex);
console.log("Configuration operations:", pipelineConfig.operations.length);

const result = executePipeline(sampleData);
console.log("Execution result:", result.success);
console.log("Processed rows:", result.processedRows);

// Test DataValue processing
const testValues: DataValue[] = [
  "hello",
  42.5,
  true,
  new Date(),
  BigInt(9007199254740991),
  null,
];

console.log("DataValue processing:");
testValues.forEach((value) => {
  const serialized = typeof value === "bigint" ? value.toString() : JSON.stringify(value);
  console.log(`${serialized} -> ${processDataValue(value)}`);
});

export { executePipeline, pipelineConfig, sampleData };
