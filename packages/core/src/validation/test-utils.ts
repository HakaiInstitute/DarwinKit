/**
 * Shared test utilities for validation module tests
 *
 * Provides reusable helpers for:
 * - DuckDB connection management (in-memory databases)
 * - Test table creation with sample data
 * - Mock violation factories
 * - Effect testing utilities
 * - Temp directory management
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";
import type { DatasetValidationResult, EnforcementLevel, FieldViolation } from "@dwkt/domain";
import {
  ErrorSeverity,
  MissingFieldViolation,
  RangeViolation,
  type SchemaViolation,
} from "@dwkt/domain";
import { assert } from "@std/assert";
import { Effect } from "effect";

// ============================================================================
// Test Constants
// ============================================================================

export const TEST_DIR_PREFIX = "validation_test_";

// ============================================================================
// DuckDB Connection Management
// ============================================================================

/**
 * Create an in-memory DuckDB connection for testing
 *
 * Uses :memory: database for fast, isolated tests that don't touch
 * the file system. Each connection gets its own isolated database.
 *
 * @returns A new DuckDB connection
 *
 * @example
 * ```typescript
 * const connection = await createTestConnection();
 * try {
 *   // run tests
 * } finally {
 *   await connection.close();
 * }
 * ```
 */
export async function createTestConnection(): Promise<DuckDBConnection> {
  const instance = await DuckDBInstance.create(":memory:");
  return await instance.connect();
}

/**
 * Run a test with automatic DuckDB connection cleanup
 *
 * Eliminates repetitive try-finally pattern by:
 * - Creating an in-memory DuckDB connection
 * - Running the test function
 * - Cleaning up the connection, even if test fails
 *
 * @param testFn - Test function that receives a connection
 *
 * @example
 * ```typescript
 * await withTestConnection(async (connection) => {
 *   await createTestTable(connection, "test_data", [
 *     { id: 1, name: "Alice" },
 *   ]);
 *
 *   const result = await connection.runAndReadAll(
 *     "SELECT * FROM test_data"
 *   );
 *   assertEquals(result.getRowObjects().length, 1);
 * });
 * ```
 */
export async function withTestConnection(
  testFn: (conn: DuckDBConnection) => Promise<void>,
): Promise<void> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  try {
    await testFn(connection);
  } finally {
    connection.closeSync();
    // Note: DuckDBInstance doesn't have explicit close method in current API
  }
}

// ============================================================================
// Test Table Creation
// ============================================================================

/**
 * Create a test table with sample data
 *
 * Automatically infers column types from JavaScript values and creates
 * a table with _row_number column (like our CSV import does).
 *
 * @param connection - DuckDB connection
 * @param tableName - Name for the test table
 * @param data - Array of objects representing rows
 *
 * @example
 * ```typescript
 * await createTestTable(connection, "events", [
 *   { _row_number: 1, eventID: "E1", country: "Canada" },
 *   { _row_number: 2, eventID: "E2", country: "USA" },
 * ]);
 * ```
 */
export async function createTestTable(
  connection: DuckDBConnection,
  tableName: string,
  data: Record<string, unknown>[],
): Promise<void> {
  if (data.length === 0) {
    throw new Error("Cannot create table from empty data array");
  }

  // Ensure _row_number exists
  const dataWithRowNumbers = data.map((row, index) => ({
    _row_number: row._row_number ?? index + 1,
    ...row,
  }));

  // Create table from JSON data
  // Use direct SQL string interpolation for in-memory test data
  const jsonData = JSON.stringify(dataWithRowNumbers);
  await connection.run(
    `CREATE TABLE ${tableName} AS SELECT * FROM read_json('${jsonData}', format='auto')`,
  );
}

// ============================================================================
// Mock Violation Factories
// ============================================================================

/**
 * Base properties for creating mock violations
 */
interface MockViolationBase {
  enforcement?: EnforcementLevel;
  fieldName?: string;
  targetName?: string;
  rowNumber?: number;
  value?: string;
  errorMessage?: string;
}

/**
 * Create a mock RangeViolation for testing
 *
 * @param overrides - Optional property overrides
 * @returns A mock RangeViolation instance
 *
 * @example
 * ```typescript
 * const violation = createMockRangeViolation({
 *   value: "-95",
 *   rowNumber: 5,
 *   enforcement: "required",
 * });
 * ```
 */
export function createMockRangeViolation(
  overrides?: MockViolationBase & { params?: { min?: number; max?: number } },
): RangeViolation {
  return new RangeViolation({
    enforcement: overrides?.enforcement ?? "required",
    severity: ErrorSeverity.ERROR,
    fieldName: overrides?.fieldName ?? "testField",
    targetName: overrides?.targetName ?? "testField",
    rowNumber: overrides?.rowNumber ?? 1,
    value: overrides?.value ?? "invalid",
    errorMessage: overrides?.errorMessage ?? "Range validation failed",
    validatorType: "range",
    params: overrides?.params,
  });
}

/**
 * Generic mock violation factory
 *
 * Creates violations of different types based on enforcement level.
 * Useful for testing functions that work with any FieldViolation.
 *
 * @param enforcement - Enforcement level for the violation
 * @param overrides - Optional property overrides
 * @returns A mock validation violation
 *
 * @example
 * ```typescript
 * const violations = [
 *   createMockViolation("required"),
 *   createMockViolation("recommended"),
 *   createMockViolation("optional"),
 * ];
 * ```
 */
export function createMockViolation(
  enforcement: EnforcementLevel,
  overrides?: Partial<MockViolationBase>,
): FieldViolation {
  return createMockRangeViolation({
    enforcement,
    ...overrides,
  });
}

/**
 * Create a mock SchemaViolation for testing
 *
 * Creates a MissingFieldViolation by default. Use for testing schema-level
 * issues like missing required fields, unmapped fields, etc.
 *
 * @param enforcement - The enforcement level ("required", "recommended", "optional")
 * @param overrides - Optional property overrides
 * @returns A mock schema violation
 *
 * @example
 * ```typescript
 * const schemaErrors = [
 *   createMockSchemaViolation("required"),
 *   createMockSchemaViolation("recommended"),
 * ];
 * ```
 */
export function createMockSchemaViolation(
  enforcement: EnforcementLevel,
  overrides?: Partial<MissingFieldViolation>,
): SchemaViolation {
  return new MissingFieldViolation({
    enforcement,
    severity: enforcement === "required"
      ? ErrorSeverity.ERROR
      : enforcement === "recommended"
      ? ErrorSeverity.WARNING
      : ErrorSeverity.INFO,
    fieldName: overrides?.fieldName ?? "testField",
    targetName: overrides?.targetName ?? "testField",
    errorMessage: overrides?.errorMessage ?? "Test schema violation",
    validatorType: "schema",
    reason: overrides?.reason ?? "not_in_csv",
  });
}

// ============================================================================
// Mock Configuration Factories
// ============================================================================

/**
 * Create a mock DatasetValidationResult for testing
 *
 * @param overrides - Optional property overrides
 * @returns A mock DatasetValidationResult with all required fields
 *
 * @example
 * ```typescript
 * const result = createMockDatasetValidationResult({
 *   datasetName: "events",
 *   status: "pass",
 *   rowsProcessed: 100,
 * });
 * ```
 */
export function createMockDatasetValidationResult(
  overrides?: Partial<DatasetValidationResult>,
): DatasetValidationResult {
  return {
    datasetName: overrides?.datasetName ?? "test-dataset",
    spec: overrides?.spec ?? "test-spec",
    filePath: overrides?.filePath ?? "./test.csv",
    rowsProcessed: overrides?.rowsProcessed ?? 0,
    processingTimeMs: overrides?.processingTimeMs ?? 0,
    status: overrides?.status ?? "pass",
    schemaViolations: {
      errors: overrides?.schemaViolations?.errors ?? [],
      warnings: overrides?.schemaViolations?.warnings ?? [],
      info: overrides?.schemaViolations?.info ?? [],
    },
    fieldViolations: {
      errors: overrides?.fieldViolations?.errors ?? [],
      warnings: overrides?.fieldViolations?.warnings ?? [],
      info: overrides?.fieldViolations?.info ?? [],
    },
  };
}

// ============================================================================
// Effect Testing Utilities
// ============================================================================

/**
 * Test that an Effect fails with a specific error type
 *
 * Eliminates repetitive Effect.either pattern by:
 * - Running the effect and converting to Either
 * - Asserting it failed (Left)
 * - Asserting the error type matches
 *
 * @template E - The error type expected in the failure channel
 * @param effect - The Effect to test
 * @param errorType - Constructor for the expected error type
 *
 * @example
 * ```typescript
 * await assertEffectFails(
 *   importCsvToWorkspace(connection, "test", "/nonexistent.csv", "'NA'"),
 *   WorkspaceImportError
 * );
 * ```
 */
export async function assertEffectFails<E>(
  effect: Effect.Effect<unknown, E>,
  errorType: abstract new (...args: never[]) => E,
): Promise<void> {
  const result = await Effect.runPromise(effect.pipe(Effect.either));

  assert(result._tag === "Left", "Expected effect to fail");
  assert(
    result.left instanceof errorType,
    `Expected error type ${errorType.name}, got ${result.left?.constructor.name}`,
  );
}

// ============================================================================
// Temp Directory Management
// ============================================================================

/**
 * Run a test with automatic temp directory cleanup
 *
 * Eliminates repetitive try-finally pattern by:
 * - Creating a temp directory before the test
 * - Passing it to the test function
 * - Cleaning up automatically, even if the test fails
 *
 * @param testFn - Test function that receives a temp directory path
 *
 * @example
 * ```typescript
 * await withTempDir(async (tempDir) => {
 *   const csvPath = join(tempDir, "test.csv");
 *   await Deno.writeTextFile(csvPath, "id,name\n1,Alice");
 *   // ... run tests
 * });
 * ```
 */
export async function withTempDir(
  testFn: (tempDir: string) => Promise<void>,
): Promise<void> {
  const tempDir = await Deno.makeTempDir({ prefix: TEST_DIR_PREFIX });
  try {
    await testFn(tempDir);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}
