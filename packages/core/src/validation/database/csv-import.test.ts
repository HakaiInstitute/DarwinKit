/**
 * Integration tests for validation/database/csv-import.ts
 *
 * Tests CSV import functionality including row numbering, null handling,
 * and special character support.
 */

import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import {
  generateTestData,
  withTestDirectory,
  writeCsvFile,
  writeCsvFileWithHeaders,
} from "../../testing/csv-fixtures.ts";
import { assertEffectFails, withTestConnection } from "../test-utils.ts";
import { WorkspaceImportError } from "../utils.ts";
import { importCsvToWorkspace } from "./csv-import.ts";

// ============================================================================
// Test Data Definitions
// ============================================================================

/**
 * Test data as structured objects.
 *
 * This approach is more readable and maintainable than inline CSV strings:
 * - Field names are explicit and type-checked
 * - No CSV escaping to worry about
 * - Easy to add/modify test cases
 */
const TEST_DATA = {
  /** Basic data for row number verification */
  BASIC_IMPORT: [
    { id: "1", name: "Alice", value: "100" },
    { id: "2", name: "Bob", value: "200" },
    { id: "3", name: "Charlie", value: "300" },
  ],

  /** Data with various null representations */
  NULL_VALUES: [
    { id: "1", name: "Alice", status: "active" },
    { id: "2", name: "Bob", status: "NA" },
    { id: "3", name: "Charlie", status: "N/A" },
    { id: "4", name: "David", status: "" },
  ],

  /** Simple ID sequence for row number testing */
  SEQUENCE: [
    { id: "1" },
    { id: "2" },
    { id: "3" },
    { id: "4" },
    { id: "5" },
  ],

  /** Data with quoted fields */
  QUOTED_FIELDS: [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
  ],

  /** Data with special characters that need proper CSV escaping */
  SPECIAL_CHARACTERS: [
    { id: "1", name: "O'Brien", description: "Quotes and, commas" },
    { id: "2", name: "Smith", description: "Newline\\ntest" },
  ],

  /** Initial data for table replacement test */
  DROP_TABLE_INITIAL: [
    { id: "1", name: "Alice" },
    { id: "2", name: "Bob" },
  ],

  /** Replacement data for table replacement test */
  DROP_TABLE_REPLACEMENT: [
    { id: "3", name: "Charlie" },
  ],

  /** Data for preserve table test - first import */
  PRESERVE_TABLE_FIRST: [
    { id: "1", name: "Alice" },
  ],

  /** Data for preserve table test - second import */
  PRESERVE_TABLE_SECOND: [
    { id: "2", name: "Bob" },
  ],
};

// ============================================================================
// Test Case Definitions
// ============================================================================

type CsvImportTestCase = {
  description: string;
  data: Record<string, string>[];
  tableName: string;
  nullStrings: string;
  expectedRowCount: number;
  verify: (rows: Array<Record<string, unknown>>) => void;
};

const csvImportTestCases: CsvImportTestCase[] = [
  {
    description: "basic import with row numbers",
    data: TEST_DATA.BASIC_IMPORT,
    tableName: "test_table",
    nullStrings: "'NA'",
    expectedRowCount: 3,
    verify: (rows) => {
      // Check _row_number column exists and is sequential
      assertEquals(Number(rows[0]._row_number), 1);
      assertEquals(Number(rows[1]._row_number), 2);
      assertEquals(Number(rows[2]._row_number), 3);

      // Check data was imported correctly
      assertEquals(rows[0].name, "Alice");
      assertEquals(rows[1].name, "Bob");
      assertEquals(rows[2].name, "Charlie");
    },
  },
  {
    description: "null value handling",
    data: TEST_DATA.NULL_VALUES,
    tableName: "test_nulls",
    nullStrings: "'NA', 'N/A', ''",
    expectedRowCount: 4,
    verify: (rows) => {
      // Alice should have status
      assertEquals(rows[0].status, "active");

      // Bob, Charlie, and David should have NULL status
      assertEquals(rows[1].status, null);
      assertEquals(rows[2].status, null);
      assertEquals(rows[3].status, null);
    },
  },
  {
    description: "sequence increments correctly",
    data: TEST_DATA.SEQUENCE,
    tableName: "test_seq",
    nullStrings: "'NA'",
    expectedRowCount: 5,
    verify: (rows) => {
      const rowNumbers = rows.map((r) => Number(r._row_number));
      assertEquals(rowNumbers, [1, 2, 3, 4, 5]);
    },
  },
  {
    description: "handles quoted fields correctly",
    data: TEST_DATA.QUOTED_FIELDS,
    tableName: "test_quoted",
    nullStrings: "'NA'",
    expectedRowCount: 2,
    verify: (rows) => {
      assertEquals(rows[0].name, "Alice");
      assertEquals(rows[1].name, "Bob");
    },
  },
  {
    description: "handles special characters in data",
    data: TEST_DATA.SPECIAL_CHARACTERS,
    tableName: "test_special",
    nullStrings: "'NA'",
    expectedRowCount: 2,
    verify: (rows) => {
      assertEquals(rows[0].name, "O'Brien");
      assertEquals(rows[0].description, "Quotes and, commas");
    },
  },
];

// ============================================================================
// CSV Import Tests
// ============================================================================

Deno.test("importCsvToWorkspace - basic functionality", async (t) => {
  for (const testCase of csvImportTestCases) {
    await t.step(testCase.description, async () => {
      await withTestDirectory(async (tempDir) => {
        await withTestConnection(async (connection) => {
          // Create CSV file from structured data
          const csvPath = await writeCsvFile(tempDir, testCase.tableName, testCase.data);

          // Import CSV
          await Effect.runPromise(
            importCsvToWorkspace(
              connection,
              testCase.tableName,
              csvPath,
              testCase.nullStrings,
              true,
            ),
          );

          // Verify row count
          const countResult = await connection.runAndReadAll(
            `SELECT COUNT(*) as count FROM ${testCase.tableName}`,
          );
          assertEquals(
            Number(countResult.getRowObjects()[0].count),
            testCase.expectedRowCount,
          );

          // Run custom verification
          if (testCase.expectedRowCount > 0) {
            const result = await connection.runAndReadAll(
              `SELECT * FROM ${testCase.tableName} ORDER BY _row_number`,
            );
            testCase.verify(result.getRowObjects());
          } else {
            testCase.verify([]);
          }
        });
      });
    });
  }
});

Deno.test("importCsvToWorkspace - handles CSV with headers only", async () => {
  await withTestDirectory(async (tempDir) => {
    await withTestConnection(async (connection) => {
      // Create a headers-only CSV (no data rows)
      const csvPath = await writeCsvFileWithHeaders(tempDir, "test_empty", ["id", "name", "value"]);

      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_empty", csvPath, "'NA'", true),
      );

      const countResult = await connection.runAndReadAll(
        "SELECT COUNT(*) as count FROM test_empty",
      );
      assertEquals(Number(countResult.getRowObjects()[0].count), 0);
    });
  });
});

// ============================================================================
// Large File Tests
// ============================================================================

Deno.test("importCsvToWorkspace - handles large CSV files", async () => {
  await withTestDirectory(async (tempDir) => {
    await withTestConnection(async (connection) => {
      // Generate 1000 rows of test data
      const largeData = generateTestData(1000, (i) => ({
        id: String(i),
        value: String(i * 100),
      }));

      const csvPath = await writeCsvFile(tempDir, "large", largeData);

      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_large", csvPath, "'NA'", true),
      );

      const result = await connection.runAndReadAll(
        "SELECT COUNT(*) as count, MIN(_row_number) as min_row, MAX(_row_number) as max_row FROM test_large",
      );

      const stats = result.getRowObjects()[0];
      assertEquals(Number(stats.count), 1000);
      assertEquals(Number(stats.min_row), 1);
      assertEquals(Number(stats.max_row), 1000);
    });
  });
});

// ============================================================================
// Table Lifecycle Tests
// ============================================================================

Deno.test("importCsvToWorkspace - dropTable flag creates new table", async () => {
  await withTestDirectory(async (tempDir) => {
    await withTestConnection(async (connection) => {
      // First import
      const csvPath1 = await writeCsvFile(tempDir, "test", TEST_DATA.DROP_TABLE_INITIAL);

      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_drop", csvPath1, "'NA'", true),
      );

      let result = await connection.runAndReadAll(
        "SELECT COUNT(*) as count FROM test_drop",
      );
      assertEquals(Number(result.getRowObjects()[0].count), 2);

      // Create new CSV with different data (overwrite the file)
      const csvPath2 = await writeCsvFile(tempDir, "test2", TEST_DATA.DROP_TABLE_REPLACEMENT);

      // Import again with dropTable=true should replace the table
      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_drop", csvPath2, "'NA'", true),
      );

      result = await connection.runAndReadAll(
        "SELECT * FROM test_drop ORDER BY id",
      );
      const rows = result.getRowObjects();

      // Should only have the new data
      assertEquals(rows.length, 1);
      assertEquals(rows[0].name, "Charlie");
    });
  });
});

Deno.test("importCsvToWorkspace - dropTable false preserves existing data", async () => {
  await withTestDirectory(async (tempDir) => {
    await withTestConnection(async (connection) => {
      // First import with dropTable=true to create table
      const csvPath1 = await writeCsvFile(tempDir, "test1", TEST_DATA.PRESERVE_TABLE_FIRST);

      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_preserve", csvPath1, "'NA'", true),
      );

      // Second import with dropTable=false should create a new table
      // (IF NOT EXISTS clause in CREATE TABLE)
      const csvPath2 = await writeCsvFile(tempDir, "test2", TEST_DATA.PRESERVE_TABLE_SECOND);

      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_preserve", csvPath2, "'NA'", false),
      );

      // Original data should still be there (table not dropped)
      const result = await connection.runAndReadAll(
        "SELECT * FROM test_preserve ORDER BY id",
      );
      const rows = result.getRowObjects();

      // Should still have only the original data
      assertEquals(rows.length, 1);
      assertEquals(rows[0].name, "Alice");
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

Deno.test("importCsvToWorkspace - fails with nonexistent file", async () => {
  await withTestConnection(async (connection) => {
    await assertEffectFails(
      importCsvToWorkspace(
        connection,
        "test_fail",
        "/nonexistent/path/file.csv",
        "'NA'",
        true,
      ),
      WorkspaceImportError,
    );
  });
});
