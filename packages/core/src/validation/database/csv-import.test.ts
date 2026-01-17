/**
 * Integration tests for Workspace CSV import functionality
 *
 * Tests the Workspace.importCsv() method to verify the public API contract:
 * - Importing CSV files into workspace tables
 * - Configurable null value handling
 * - Table lifecycle management (create/replace/preserve)
 * - Error handling for invalid inputs
 * - Row numbering for validation reporting
 */

import { Workspace, WorkspaceImportError } from "@dwkt/core";
import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import {
  DEFAULT_TEST_CONFIG,
  withTestWorkspace,
  writeCsvFile,
} from "../../testing/csv-fixtures.ts";
import { assertEffectFails } from "../test-utils.ts";

// ============================================================================
// Test Data
// ============================================================================

const BASIC_DATA = [
  { id: "1", name: "Alice", value: "100" },
  { id: "2", name: "Bob", value: "200" },
  { id: "3", name: "Charlie", value: "300" },
];

const NULL_VALUE_DATA = [
  { id: "1", name: "Alice", status: "active" },
  { id: "2", name: "Bob", status: "NA" },
  { id: "3", name: "Charlie", status: "N/A" },
  { id: "4", name: "David", status: "" },
];

const REPLACEMENT_DATA_INITIAL = [
  { id: "1", name: "Alice" },
  { id: "2", name: "Bob" },
];

const REPLACEMENT_DATA_NEW = [
  { id: "3", name: "Charlie" },
];

// ============================================================================
// Core Import Tests
// ============================================================================

Deno.test("Workspace.importCsv - imports data and adds row numbers", async () => {
  await withTestWorkspace(async (tempDir, workspace) => {
    const csvPath = await writeCsvFile(tempDir, "basic", BASIC_DATA);

    await Effect.runPromise(
      workspace.importCsv(
        csvPath,
        "basic_test",
        true,
      ),
    );

    // Verify data imported correctly
    const rows = await Effect.runPromise(
      workspace.query("SELECT * FROM basic_test ORDER BY _row_number"),
    );

    assertEquals(rows.length, BASIC_DATA.length);

    // Verify row numbers are sequential starting from 1
    for (let i = 0; i < rows.length; i++) {
      assertEquals(Number(rows[i]._row_number), i + 1);
    }

    // Verify data integrity
    assertEquals(rows[0].name, BASIC_DATA[0].name);
    assertEquals(rows[1].name, BASIC_DATA[1].name);
    assertEquals(rows[2].name, BASIC_DATA[2].name);
  });
});

Deno.test("Workspace.importCsv - respects null value configuration", async () => {
  await withTestWorkspace(async (tempDir, workspace) => {
    const csvPath = await writeCsvFile(tempDir, "nulls", NULL_VALUE_DATA);

    await Effect.runPromise(
      workspace.importCsv(
        csvPath,
        "null_test",
        true,
      ),
    );

    const rows = await Effect.runPromise(
      workspace.query("SELECT * FROM null_test ORDER BY id"),
    );

    // First row should have actual value
    assertEquals(rows[0].status, "active");

    // Configured null values should be converted to NULL
    assertEquals(rows[1].status, null); // "NA"
    assertEquals(rows[2].status, null); // "N/A"
    assertEquals(rows[3].status, null); // ""
  });
});

Deno.test("Workspace.importCsv - handles empty CSV files", async () => {
  await withTestWorkspace(async (tempDir, workspace) => {
    // Create a headers-only CSV (no data rows)
    const csvPath = join(tempDir, "empty.csv");
    await Deno.writeTextFile(csvPath, "id,name,value\n");

    await Effect.runPromise(
      workspace.importCsv(
        csvPath,
        "empty_test",
        true,
      ),
    );

    const rows = await Effect.runPromise(
      workspace.query("SELECT * FROM empty_test"),
    );

    assertEquals(rows.length, 0);
  });
});

// ============================================================================
// Table Lifecycle Tests
// ============================================================================

Deno.test("Workspace.importCsv - dropTable=true replaces existing table", async () => {
  await withTestWorkspace(async (tempDir, workspace) => {
    // First import
    const csvPath1 = await writeCsvFile(tempDir, "initial", REPLACEMENT_DATA_INITIAL);

    await Effect.runPromise(
      workspace.importCsv(
        csvPath1,
        "lifecycle_test",
        true,
      ),
    );

    let rows = await Effect.runPromise(
      workspace.query("SELECT * FROM lifecycle_test"),
    );
    assertEquals(rows.length, 2);

    // Second import with dropTable=true should replace the table
    const csvPath2 = await writeCsvFile(tempDir, "replacement", REPLACEMENT_DATA_NEW);

    await Effect.runPromise(
      workspace.importCsv(
        csvPath2,
        "lifecycle_test",
        true,
      ),
    );

    rows = await Effect.runPromise(
      workspace.query("SELECT * FROM lifecycle_test ORDER BY id"),
    );

    // Should only have the new data
    assertEquals(rows.length, 1);
    assertEquals(rows[0].name, "Charlie");
  });
});

Deno.test("Workspace.importCsv - dropTable=false preserves existing table", async () => {
  await withTestWorkspace(async (tempDir, workspace) => {
    // First import with dropTable=true to create table
    const csvPath1 = await writeCsvFile(tempDir, "first", [{ id: "1", name: "Alice" }]);

    await Effect.runPromise(
      workspace.importCsv(
        csvPath1,
        "preserve_test",
        true,
      ),
    );

    // Second import with dropTable=false should not replace the table
    const csvPath2 = await writeCsvFile(tempDir, "second", [{ id: "2", name: "Bob" }]);

    await Effect.runPromise(
      workspace.importCsv(
        csvPath2,
        "preserve_test",
        false,
      ),
    );

    // Original data should still be there
    const rows = await Effect.runPromise(
      workspace.query("SELECT * FROM preserve_test ORDER BY id"),
    );

    assertEquals(rows.length, 1);
    assertEquals(rows[0].name, "Alice");
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

Deno.test("Workspace.importCsv - fails with nonexistent file", async () => {
  // Note: Can't use withTestWorkspace here since we don't need temp dir
  using workspace = Workspace.create(DEFAULT_TEST_CONFIG);

  await assertEffectFails(
    workspace.importCsv(
      "/nonexistent/path/file.csv",
      "error_test",
      true,
    ),
    WorkspaceImportError,
  );
});
