/**
 * Shared workspace test utilities for workspace-validator tests.
 */

import type { DatasetConfig, DatasetRule, ValidationSettingsInput } from "@dwkt/domain/schemas";
import { isPrimaryKeyViolation } from "@dwkt/domain/types";
import type { WorkspaceValidationResult } from "@dwkt/domain/types";
import { assertEquals } from "@std/assert";
import { stringify as stringifyCSV } from "@std/csv";
import { join } from "@std/path";
import { stringify as stringifyYAML } from "@std/yaml";
import { Array } from "effect";
import * as Effect from "effect/Effect";
import { WorkspaceValidator } from "@dwkt/core/validation";

// Helper type for workspace creation
export type TestWorkspaceOptions = {
  eventData?: Array<Record<string, unknown>>;
  occurrenceData?: Array<Record<string, unknown>>;
  datasets?: DatasetConfig[];
  datasetRules?: DatasetRule[];
  validation?: ValidationSettingsInput;
};

// deno-lint-ignore no-explicit-any
export type RawFieldMapping = Record<string, any>;

// Test data as structured objects (easier to read and modify than CSV strings)
export const TEST_DATA = {
  VALID_EVENTS: [
    {
      eventID: "E1",
      country: "Canada",
      countryCode: "CA",
      decimalLatitude: 49.5,
      decimalLongitude: -123.5,
    },
    {
      eventID: "E2",
      country: "Canada",
      countryCode: "CA",
      decimalLatitude: 50.0,
      decimalLongitude: -124.0,
    },
  ],

  VALID_OCCURRENCES: [
    {
      eventID: "E1",
      occurrenceID: "O1",
      basisOfRecord: "HumanObservation",
      scientificName: "Ursus arctos",
    },
    {
      eventID: "E1",
      occurrenceID: "O2",
      basisOfRecord: "HumanObservation",
      scientificName: "Canis lupus",
    },
    {
      eventID: "E2",
      occurrenceID: "O3",
      basisOfRecord: "HumanObservation",
      scientificName: "Ursus arctos",
    },
  ],

  EVENTS_WITH_ONLY_E1: [
    { eventID: "E1", country: "Canada", countryCode: "CA" },
  ],

  OCCURRENCES_WITH_INVALID_EVENT_REF: [
    {
      eventID: "E1",
      occurrenceID: "O1",
      basisOfRecord: "HumanObservation",
      scientificName: "Ursus arctos",
    },
    {
      eventID: "E2",
      occurrenceID: "O2",
      basisOfRecord: "HumanObservation",
      scientificName: "Canis lupus",
    },
  ],

  EVENTS_MISSING_COUNTRY_CODE: [
    {
      eventID: "E1",
      country: "Canada",
      eventDate: "2000-01-01",
      decimalLatitude: 49.5,
      decimalLongitude: -123.5,
    },
  ],

  EVENTS_WITH_INVALID_LATITUDE: [
    { eventID: "E1", eventDate: "2000-01-01", decimalLatitude: 49.5, decimalLongitude: -123.5 },
    { eventID: "E2", eventDate: "2000-01-01", decimalLatitude: 95.0, decimalLongitude: -124.0 },
    { eventID: "E3", eventDate: "2000-01-01", decimalLatitude: -95.0, decimalLongitude: -125.0 },
  ],

  OCCURRENCES_WITH_INVALID_BASIS: [
    {
      occurrenceID: "O1",
      basisOfRecord: "HumanObservation",
      scientificName: "Ursus arctos",
    },
    {
      occurrenceID: "O2",
      basisOfRecord: "InvalidBasis",
      scientificName: "Canis lupus",
    },
    {
      occurrenceID: "O3",
      basisOfRecord: "PreservedSpecimen",
      scientificName: "Panthera tigris",
    },
  ],

  EVENTS_WITH_DUPLICATE_E1: [
    { eventID: "E1", country: "Canada" },
    { eventID: "E2", country: "USA" },
    { eventID: "E1", country: "Mexico" },
  ],

  EVENTS_WITH_4_DUPLICATES: [
    { eventID: "DUP", country: "Country1" },
    { eventID: "E2", country: "Country2" },
    { eventID: "DUP", country: "Country3" },
    { eventID: "E4", country: "Country4" },
    { eventID: "DUP", country: "Country5" },
    { eventID: "E6", country: "Country6" },
    { eventID: "DUP", country: "Country7" },
  ],

  EVENTS_WITH_2_DUPLICATE_VALUES: [
    { eventID: "E1", country: "Canada" },
    { eventID: "E2", country: "USA" },
    { eventID: "E1", country: "Mexico" },
    { eventID: "E3", country: "France" },
    { eventID: "E2", country: "Germany" },
    { eventID: "E4", country: "Spain" },
  ],
};

// Convert structured test data to CSV format
export function toCSV<T extends Record<string, unknown>>(data: T[]): string {
  if (data.length === 0) return "";
  const columns = Object.keys(data[0]);
  return stringifyCSV(data, { columns });
}

const tempDirs: string[] = [];

export async function createTempDir(prefix: string) {
  if (prefix.length === 0) {
    throw new Error("Prefix cannot be empty");
  }
  const dir = await Deno.makeTempDir({ prefix });
  tempDirs.push(dir);
  return dir;
}

export async function removeTempDirs() {
  await Promise.all(
    tempDirs.map((dir) => Deno.remove(dir, { recursive: true })),
  );
}

// Write a workspace configuration file to the temp directory.
// deno-lint-ignore no-explicit-any
export async function writeConfig(tempDir: string, config: Record<string, any>) {
  const clean = JSON.parse(JSON.stringify(config));
  return await Deno.writeTextFile(
    join(tempDir, "darwinkit.yaml"),
    stringifyYAML(clean),
  );
}

// Write a CSV file to the temp directory from structured data
export async function writeCSV(
  tempDir: string,
  fileName: string,
  data: Array<Record<string, unknown>>,
) {
  return await Deno.writeTextFile(
    join(tempDir, `${fileName}.csv`),
    toCSV(data),
  );
}

// Create a multi-dataset workspace with events and occurrences
export async function createMultiDatasetWorkspace(
  tempDir: string,
  options?: TestWorkspaceOptions,
) {
  const eventData = options?.eventData ?? TEST_DATA.VALID_EVENTS;
  await writeCSV(tempDir, "events", eventData);

  const occurrenceData = options?.occurrenceData ?? TEST_DATA.VALID_OCCURRENCES;
  await writeCSV(tempDir, "occurrences", occurrenceData);

  const datasets = options?.datasets ?? [
    {
      name: "events",
      class: "Event",
      path: "./events.csv",
      fieldMappings: [
        { originName: "eventID", targetName: "eventID" },
        { originName: "country", targetName: "country" },
        { originName: "countryCode", targetName: "countryCode" },
        { originName: "decimalLatitude", targetName: "decimalLatitude" },
        { originName: "decimalLongitude", targetName: "decimalLongitude" },
      ],
    },
    {
      name: "occurrences",
      class: "Occurrence",
      path: "./occurrences.csv",
      fieldMappings: [
        { originName: "eventID", targetName: "eventID" },
        { originName: "occurrenceID", targetName: "occurrenceID" },
        { originName: "basisOfRecord", targetName: "basisOfRecord" },
        { originName: "scientificName", targetName: "scientificName" },
      ],
    },
  ];

  const datasetRules = options?.datasetRules ?? [
    {
      ruleType: "foreignKey",
      sourceDataset: "occurrences",
      sourceField: "eventID",
      targetDataset: "events",
      targetField: "eventID",
      description: "Occurrences must reference existing events",
    },
  ];

  const rawConfig = {
    name: "Test Workspace",
    validation: options?.validation ?? {
      nullValues: ["", "NA"],
      datasets,
    },
    datasetRules,
  };

  await writeConfig(tempDir, rawConfig);
}

// Create a workspace with a single dataset for testing
export async function createSingleDatasetWorkspace(
  tempDir: string,
  datasetName: string,
  data: Array<Record<string, unknown>>,
  fieldMappings: RawFieldMapping[],
  options?: { class?: string },
): Promise<void> {
  await writeCSV(tempDir, datasetName, data);

  const rawConfig = {
    name: "Test Workspace",
    validation: {
      nullValues: [""],
      datasets: [
        {
          name: datasetName,
          class: options?.class ?? datasetName,
          path: `./${datasetName}.csv`,
          fieldMappings,
        },
      ],
    },
  };

  await writeConfig(tempDir, rawConfig);
}

// Validate the workspace in the temp directory
export async function validateWorkspace(
  tempDir: string,
): Promise<WorkspaceValidationResult> {
  const validator = new WorkspaceValidator();
  return await Effect.runPromise(
    validator.validateFromConfig(tempDir),
  );
}

// Assertion helpers
export function assertPrimaryKeyViolations(
  result: WorkspaceValidationResult,
  expectedCount: number,
  expectedValue: string,
  options?: { checkDuplicateCount?: number },
): void {
  const datasetResult = result.datasetResults[0];
  const pkViolations = Array.filter(
    datasetResult.fieldViolations.errors,
    isPrimaryKeyViolation,
  );

  assertEquals(pkViolations.length, expectedCount);
  assertEquals(pkViolations[0].value, expectedValue);

  if (options?.checkDuplicateCount) {
    assertEquals(pkViolations[0].duplicateCount, options.checkDuplicateCount);
  }
}

export function assertRowNumbers(
  result: WorkspaceValidationResult,
  expectedRows: number[],
  options?: { checkOrdering?: boolean },
): void {
  const pkViolations = Array.filter(
    result.datasetResults[0].fieldViolations.errors,
    isPrimaryKeyViolation,
  );
  const rowNumbers = pkViolations.map(({ rowNumber }) => rowNumber);

  if (options?.checkOrdering) {
    const sorted = [...rowNumbers].sort((a, b) => a - b);
    assertEquals(
      rowNumbers,
      sorted,
      "Row numbers should be in ascending order",
    );
  }

  assertEquals([...rowNumbers].sort((a, b) => a - b), expectedRows);
}
