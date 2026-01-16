/**
 * CSV Test Fixtures
 *
 * Standardized utilities for creating and managing CSV test data.
 * Uses arrays of objects as the primary interface for better readability,
 * type safety, and maintainability compared to inline CSV strings.
 *
 * @example
 * ```typescript
 * import { writeCsvFile, withTestDirectory } from "./testing/csv-fixtures.ts";
 *
 * await withTestDirectory(async (tempDir) => {
 *   const csvPath = await writeCsvFile(tempDir, "events", [
 *     { eventID: "E1", country: "Canada" },
 *     { eventID: "E2", country: "USA" },
 *   ]);
 *
 *   // Use csvPath in your test...
 * });
 * ```
 *
 * @module
 */

import { parse, stringify } from "@std/csv";
import { join } from "@std/path";

// ============================================================================
// Constants
// ============================================================================

/** Prefix for all test temp directories */
export const TEST_DIR_PREFIX = "dwkt_test_";

// ============================================================================
// CSV Writing - Objects → CSV
// ============================================================================

/**
 * Convert an array of objects to a CSV string.
 *
 * Automatically infers column headers from the first object's keys.
 * Handles special characters (quotes, commas, newlines) correctly.
 *
 * @param data - Array of objects to convert
 * @returns CSV string with headers
 *
 * @example
 * ```typescript
 * const csv = toCsvString([
 *   { id: 1, name: "Alice" },
 *   { id: 2, name: "Bob" },
 * ]);
 * // Returns: "id,name\n1,Alice\n2,Bob\n"
 * ```
 */
export function toCsvString<T extends Record<string, unknown>>(data: T[]): string {
  if (data.length === 0) return "";
  const columns = Object.keys(data[0]);
  return stringify(data, { columns });
}

/**
 * Write an array of objects to a CSV file.
 *
 * Creates a CSV file in the specified directory with automatically
 * inferred headers from the object keys. Returns the full path
 * to the created file.
 *
 * @param dir - Directory to write the file in
 * @param filename - Name for the CSV file (with or without .csv extension)
 * @param data - Array of objects to write
 * @returns Full path to the created CSV file
 * @throws Error if data array is empty
 *
 * @example
 * ```typescript
 * const csvPath = await writeCsvFile(tempDir, "events", [
 *   { eventID: "E1", country: "Canada", decimalLatitude: 49.5 },
 *   { eventID: "E2", country: "USA", decimalLatitude: 38.9 },
 * ]);
 * ```
 */
export async function writeCsvFile<T extends Record<string, unknown>>(
  dir: string,
  filename: string,
  data: T[],
): Promise<string> {
  if (data.length === 0) {
    throw new Error("Cannot create CSV from empty array - need at least one row for headers");
  }

  const csvContent = toCsvString(data);
  const normalizedFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const filePath = join(dir, normalizedFilename);

  await Deno.writeTextFile(filePath, csvContent);
  return filePath;
}

/**
 * Write a CSV file with explicit headers (for edge cases like headers-only files).
 *
 * Use this when you need:
 * - A CSV with headers but no data rows
 * - Headers that don't match object keys
 * - Explicit control over column order
 *
 * @param dir - Directory to write the file in
 * @param filename - Name for the CSV file
 * @param headers - Array of column header names
 * @param rows - Optional array of row data (as string arrays)
 * @returns Full path to the created CSV file
 *
 * @example
 * ```typescript
 * // Headers-only file
 * const csvPath = await writeCsvFileWithHeaders(tempDir, "empty", ["id", "name"]);
 *
 * // With explicit rows
 * const csvPath = await writeCsvFileWithHeaders(tempDir, "data", ["id", "name"], [
 *   ["1", "Alice"],
 *   ["2", "Bob"],
 * ]);
 * ```
 */
export async function writeCsvFileWithHeaders(
  dir: string,
  filename: string,
  headers: string[],
  rows: string[][] = [],
): Promise<string> {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  const normalizedFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const filePath = join(dir, normalizedFilename);

  await Deno.writeTextFile(filePath, csvContent);
  return filePath;
}

// ============================================================================
// CSV Reading - CSV → Objects
// ============================================================================

/**
 * Read a CSV file and parse it into an array of objects.
 *
 * Useful for verifying transformed data or reading expected results.
 * The first row is treated as headers.
 *
 * @param filePath - Path to the CSV file
 * @returns Array of objects with string values
 *
 * @example
 * ```typescript
 * const data = await readCsvFile<{ eventID: string; country: string }>(csvPath);
 * assertEquals(data[0].eventID, "E1");
 * ```
 */
export async function readCsvFile<T extends Record<string, string>>(
  filePath: string,
): Promise<T[]> {
  const content = await Deno.readTextFile(filePath);
  return parse(content, { skipFirstRow: true }) as T[];
}

/**
 * Parse a CSV string into an array of objects.
 *
 * @param csvContent - CSV string with headers in first row
 * @returns Array of objects with string values
 */
export function parseCsvString<T extends Record<string, string>>(
  csvContent: string,
): T[] {
  return parse(csvContent, { skipFirstRow: true }) as T[];
}

// ============================================================================
// Temp Directory Management
// ============================================================================

/**
 * Create a temp directory for testing.
 *
 * Use `withTestDirectory` instead when possible for automatic cleanup.
 *
 * @param prefix - Optional prefix (defaults to TEST_DIR_PREFIX)
 * @returns Path to the created temp directory
 */
export async function createTestDirectory(prefix?: string): Promise<string> {
  return await Deno.makeTempDir({ prefix: prefix ?? TEST_DIR_PREFIX });
}

/**
 * Execute a test function with automatic temp directory cleanup.
 *
 * Creates a temp directory before the test and removes it after,
 * even if the test fails. This is the recommended approach for
 * tests that need file system access.
 *
 * @param testFn - Test function that receives the temp directory path
 *
 * @example
 * ```typescript
 * await withTestDirectory(async (tempDir) => {
 *   const csvPath = await writeCsvFile(tempDir, "test", testData);
 *   // ... run test assertions
 * }); // tempDir is automatically cleaned up
 * ```
 */
export async function withTestDirectory(
  testFn: (tempDir: string) => Promise<void>,
): Promise<void> {
  const tempDir = await createTestDirectory();
  try {
    await testFn(tempDir);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

// ============================================================================
// Test Fixture Helpers
// ============================================================================

/**
 * Result of creating a CSV fixture
 */
export interface CsvFixture<T extends Record<string, unknown>> {
  /** Path to the CSV file */
  filePath: string;
  /** Original data used to create the fixture */
  data: T[];
  /** Number of data rows (excluding header) */
  rowCount: number;
}

/**
 * Create a CSV fixture and return metadata about it.
 *
 * Combines file creation with useful metadata for assertions.
 *
 * @param dir - Directory to create the file in
 * @param name - Name for the CSV file
 * @param data - Array of objects to write
 * @returns Fixture metadata including path and row count
 *
 * @example
 * ```typescript
 * const fixture = await createCsvFixture(tempDir, "events", [
 *   { eventID: "E1", country: "Canada" },
 *   { eventID: "E2", country: "USA" },
 * ]);
 *
 * assertEquals(fixture.rowCount, 2);
 * // Use fixture.filePath for import operations
 * ```
 */
export async function createCsvFixture<T extends Record<string, unknown>>(
  dir: string,
  name: string,
  data: T[],
): Promise<CsvFixture<T>> {
  const filePath = await writeCsvFile(dir, name, data);
  return {
    filePath,
    data,
    rowCount: data.length,
  };
}
