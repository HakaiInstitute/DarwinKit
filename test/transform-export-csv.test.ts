/**
 * CSV Export Test
 *
 * Ensures that `exportObisTablesToCSV` correctly exports data from tables
 * to CSV files according to the workspace configuration.
 */

import { exportObisTablesToCSV, Workspace } from "@dwkt/core";
import type { WorkspaceConfig } from "@dwkt/domain";
import { assertEquals, assertExists, assertFalse } from "@std/assert";
import * as Effect from "effect/Effect";
import { readCsvFile } from "./helpers/config-utils.ts";

Deno.test("exportObisTablesToCSV - exports tables to CSV without timestamps", async () => {
  // 1. Setup
  const outputDir = await Deno.makeTempDir({ prefix: "dwkt-export-test-" });

  const config: WorkspaceConfig = {
    version: "1",
    createdAt: new Date(),
    updatedAt: new Date(),
    id: "test-workspace",
    name: "Test Workspace",
    description: "A workspace for testing",
    transform: {
      nullValues: [],
      inputs: {},
      postImportTransforms: [],
      datasets: [
        { name: "Event", profile: "Event", source: {}, fields: {} },
        { name: "Occurrence", profile: "Occurrence", source: {}, fields: {} },
      ],
      output: {
        outputDir: outputDir,
        outputFilesWithTimestamp: false, // For predictable filenames
        exportDB: false,
      },
    },
  };

  const workspace = Workspace.create(config);

  try {
    // Get connection from workspace
    const connection = await Effect.runPromise(workspace.getConnection());

    // 2. Arrange: Create and populate tables to be exported
    await connection.run("CREATE TABLE event (eventID TEXT, year INTEGER);");
    await connection.run("INSERT INTO event VALUES ('evt1', 2023);");
    await connection.run("CREATE TABLE occurrence (occurrenceID TEXT, eventID TEXT);");
    await connection.run("INSERT INTO occurrence VALUES ('occ1', 'evt1');");

    // 3. Act: Execute the export function
    const effect = exportObisTablesToCSV(workspace);
    await Effect.runPromise(effect);

    // 4. Assert: Verify the CSV files and their contents
    // Check event.csv
    const eventCsvPath = `${outputDir}/event.csv`;
    const eventRows = await readCsvFile<{ eventID: string; year: string }>(eventCsvPath);
    assertEquals(eventRows.length, 1, "event.csv should contain 1 row");
    assertEquals(eventRows[0].eventID, "evt1");
    assertEquals(eventRows[0].year, "2023");

    // Check occurrence.csv
    const occurrenceCsvPath = `${outputDir}/occurrence.csv`;
    const occurrenceRows = await readCsvFile<{ occurrenceID: string; eventID: string }>(
      occurrenceCsvPath,
    );
    assertEquals(occurrenceRows.length, 1, "occurrence.csv should contain 1 row");
    assertEquals(occurrenceRows[0].occurrenceID, "occ1");
    assertEquals(occurrenceRows[0].eventID, "evt1");
  } finally {
    // 5. Teardown
    await Deno.remove(outputDir, { recursive: true });
    workspace.close();
  }
});

Deno.test("exportObisTablesToCSV - drops null columns when configured", async () => {
  // 1. Setup
  const outputDir = await Deno.makeTempDir({ prefix: "dwkt-export-null-test-" });

  const config: WorkspaceConfig = {
    version: "1",
    createdAt: new Date(),
    updatedAt: new Date(),
    id: "test-workspace",
    name: "Test Workspace",
    description: "A workspace for testing",
    transform: {
      nullValues: [],
      inputs: {},
      postImportTransforms: [],
      datasets: [{ name: "Event", profile: "Event", source: {}, fields: {} }],
      output: {
        outputDir: outputDir,
        outputFilesWithTimestamp: false,
        exportDB: false,
        dropNullColumns: true, // Enable dropping null columns
      },
    },
  };

  const workspace = Workspace.create(config);

  try {
    // Get connection from workspace
    const connection = await Effect.runPromise(workspace.getConnection());

    // 2. Arrange: Create a table with a column that is entirely NULL
    await connection.run("DROP TABLE IF EXISTS event;");
    await connection.run(
      "CREATE TABLE event (eventID TEXT, year INTEGER, month INTEGER, remarks TEXT);",
    );
    await connection.run(
      "INSERT INTO event VALUES ('evt1', 2023, 1, NULL), ('evt2', 2024, 2, NULL);",
    );

    // 3. Act
    const effect = exportObisTablesToCSV(workspace);
    await Effect.runPromise(effect);

    // 4. Assert
    const csvPath = `${outputDir}/event.csv`;
    const rows = await readCsvFile<{
      eventID: string;
      year: string;
      month: string;
      remarks?: string;
    }>(csvPath);

    assertEquals(rows.length, 2, "CSV should contain 2 data rows");

    // Verify the null column 'remarks' was dropped
    assertExists(rows[0].eventID, "Row should have eventID");
    assertExists(rows[0].year, "Row should have year");
    assertExists(rows[0].month, "Row should have month");
    assertFalse("remarks" in rows[0], "Row should NOT have the null column 'remarks'");

    // Verify the data values
    assertEquals(rows[0].eventID, "evt1");
    assertEquals(rows[0].year, "2023");
    assertEquals(rows[0].month, "1");

    assertEquals(rows[1].eventID, "evt2");
    assertEquals(rows[1].year, "2024");
    assertEquals(rows[1].month, "2");
  } finally {
    // 5. Teardown
    await Deno.remove(outputDir, { recursive: true });
    workspace.close();
  }
});

Deno.test("exportObisTablesToCSV - returns OutputError on file system failure", async () => {
  // Invalid path to trigger a file system error
  const invalidOutputDir = "/non_existent_dir/sub_dir";

  const config: WorkspaceConfig = {
    version: "1",
    createdAt: new Date(),
    updatedAt: new Date(),
    id: "test-workspace",
    name: "Test Workspace",
    description: "A workspace for testing",
    transform: {
      inputs: {},
      postImportTransforms: [],
      nullValues: [],
      datasets: [{ name: "Event", profile: "Event", source: {}, fields: {} }],
      output: { outputDir: invalidOutputDir, exportDB: false },
    },
  };

  const workspace = Workspace.create(config);

  const effect = exportObisTablesToCSV(workspace);
  const result = await Effect.runPromise(Effect.flip(effect));

  assertEquals(result._tag, "OutputError", "Should fail with OutputError");
  assertEquals(result.outputPath, invalidOutputDir);

  workspace.close();
});
