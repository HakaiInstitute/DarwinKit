/**
 * Integration tests for validation/database/csv-import.ts
 */

import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import { assertEffectFails, withTempDir, withTestConnection } from "../test-utils.ts";
import { WorkspaceImportError } from "../utils.ts";
import { importCsvToWorkspace } from "./csv-import.ts";

// ============================================================================
// CSV Import Tests
// ============================================================================

Deno.test("importCsvToWorkspace - basic import with row numbers", async () => {
  await withTempDir(async (tempDir) => {
    await withTestConnection(async (connection) => {
      // Create a test CSV file
      const csvPath = join(tempDir, "test.csv");
      await Deno.writeTextFile(
        csvPath,
        "id,name,value\n1,Alice,100\n2,Bob,200\n3,Charlie,300",
      );

      // Import CSV
      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_table", csvPath, "'NA'", true),
      );

      // Verify data was imported with _row_number
      const result = await connection.runAndReadAll(
        "SELECT * FROM test_table ORDER BY _row_number",
      );

      const rows = result.getRowObjects();
      assertEquals(rows.length, 3);

      // Check _row_number column exists and is sequential
      // DuckDB returns BigInt for integer values
      assertEquals(Number(rows[0]._row_number), 1);
      assertEquals(Number(rows[1]._row_number), 2);
      assertEquals(Number(rows[2]._row_number), 3);

      // Check data was imported correctly
      assertEquals(rows[0].name, "Alice");
      assertEquals(rows[1].name, "Bob");
      assertEquals(rows[2].name, "Charlie");
    });
  });
});

Deno.test("importCsvToWorkspace - null value handling", async () => {
  await withTempDir(async (tempDir) => {
    await withTestConnection(async (connection) => {
      // Create CSV with various null representations
      const csvPath = join(tempDir, "test_nulls.csv");
      // TODO: Use a 'writeCsvFile' utility rather than hard-coding strings
      await Deno.writeTextFile(
        csvPath,
        "id,name,status\n1,Alice,active\n2,Bob,NA\n3,Charlie,N/A\n4,David,",
      );

      // Import with both 'NA' and 'N/A' as null strings
      await Effect.runPromise(
        importCsvToWorkspace(
          connection,
          "test_nulls",
          csvPath,
          "'NA', 'N/A', ''",
          true,
        ),
      );

      // Verify null values were handled correctly
      const result = await connection.runAndReadAll(
        "SELECT id, name, status FROM test_nulls ORDER BY id",
      );

      const rows = result.getRowObjects();
      assertEquals(rows.length, 4);

      // Alice should have status
      assertEquals(rows[0].status, "active");

      // Bob, Charlie, and David should have NULL status
      assertEquals(rows[1].status, null);
      assertEquals(rows[2].status, null);
      assertEquals(rows[3].status, null);
    });
  });
});

Deno.test("importCsvToWorkspace - dropTable flag creates new table", async () => {
  await withTempDir(async (tempDir) => {
    await withTestConnection(async (connection) => {
      const csvPath = join(tempDir, "test.csv");
      await Deno.writeTextFile(csvPath, "id,name\n1,Alice\n2,Bob");

      // First import
      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_drop", csvPath, "'NA'", true),
      );

      let result = await connection.runAndReadAll(
        "SELECT COUNT(*) as count FROM test_drop",
      );
      assertEquals(Number(result.getRowObjects()[0].count), 2);

      // Create new CSV with different data
      await Deno.writeTextFile(csvPath, "id,name\n3,Charlie");

      // Import again with dropTable=true should replace the table
      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_drop", csvPath, "'NA'", true),
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
  await withTempDir(async (tempDir) => {
    await withTestConnection(async (connection) => {
      const csvPath1 = join(tempDir, "test1.csv");
      await Deno.writeTextFile(csvPath1, "id,name\n1,Alice");

      // First import with dropTable=true to create table
      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_preserve", csvPath1, "'NA'", true),
      );

      const csvPath2 = join(tempDir, "test2.csv");
      await Deno.writeTextFile(csvPath2, "id,name\n2,Bob");

      // Second import with dropTable=false should create a new table
      // (IF NOT EXISTS clause in CREATE TABLE)
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

Deno.test("importCsvToWorkspace - sequence increments correctly", async () => {
  await withTempDir(async (tempDir) => {
    await withTestConnection(async (connection) => {
      const csvPath = join(tempDir, "test.csv");
      await Deno.writeTextFile(csvPath, "id\n1\n2\n3\n4\n5");

      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_seq", csvPath, "'NA'", true),
      );

      const result = await connection.runAndReadAll(
        "SELECT _row_number FROM test_seq ORDER BY _row_number",
      );

      const rowNumbers = result.getRowObjects().map((r) => Number(r._row_number));

      // Verify sequential numbering
      assertEquals(rowNumbers, [1, 2, 3, 4, 5]);
    });
  });
});

Deno.test("importCsvToWorkspace - handles CSV with headers only", async () => {
  await withTempDir(async (tempDir) => {
    await withTestConnection(async (connection) => {
      const csvPath = join(tempDir, "empty.csv");
      await Deno.writeTextFile(csvPath, "id,name,value");

      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_empty", csvPath, "'NA'", true),
      );

      const result = await connection.runAndReadAll(
        "SELECT COUNT(*) as count FROM test_empty",
      );

      assertEquals(Number(result.getRowObjects()[0].count), 0);
    });
  });
});

Deno.test("importCsvToWorkspace - handles large CSV files", async () => {
  await withTempDir(async (tempDir) => {
    await withTestConnection(async (connection) => {
      const csvPath = join(tempDir, "large.csv");

      // Generate CSV with 1000 rows
      const lines = ["id,value"];
      for (let i = 1; i <= 1000; i++) {
        lines.push(`${i},${i * 100}`);
      }
      await Deno.writeTextFile(csvPath, lines.join("\n"));

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

Deno.test("importCsvToWorkspace - handles quoted fields correctly", async () => {
  await withTempDir(async (tempDir) => {
    await withTestConnection(async (connection) => {
      // DuckDB's CSV parser is lenient and can handle most CSV formats
      // This test verifies that quoted fields are handled correctly
      const csvPath = join(tempDir, "quoted.csv");
      await Deno.writeTextFile(
        csvPath,
        'id,name\n1,"Alice"\n2,"Bob"',
      );

      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_quoted", csvPath, "'NA'", true),
      );

      const result = await connection.runAndReadAll(
        "SELECT * FROM test_quoted ORDER BY id",
      );

      const rows = result.getRowObjects();
      assertEquals(rows.length, 2);
      assertEquals(rows[0].name, "Alice");
      assertEquals(rows[1].name, "Bob");
    });
  });
});

Deno.test("importCsvToWorkspace - handles special characters in data", async () => {
  await withTempDir(async (tempDir) => {
    await withTestConnection(async (connection) => {
      const csvPath = join(tempDir, "special.csv");
      await Deno.writeTextFile(
        csvPath,
        'id,name,description\n1,"O\'Brien","Quotes and, commas"\n2,"Smith","Newline\\ntest"',
      );

      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_special", csvPath, "'NA'", true),
      );

      const result = await connection.runAndReadAll(
        "SELECT * FROM test_special ORDER BY id",
      );

      const rows = result.getRowObjects();
      assertEquals(rows.length, 2);
      assertEquals(rows[0].name, "O'Brien");
      assertEquals(rows[0].description, "Quotes and, commas");
    });
  });
});
