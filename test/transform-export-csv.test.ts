/**
 * CSV Export Test
 *
 * Ensures that `exportTablesToCSV` correctly exports data from DuckDB tables
 * to CSV files according to the workspace configuration.
 */

import { DuckDBConnection } from "@duckdb/node-api";
import { exportTablesToCSV } from "@dwkt/core/transform";
import type { WorkspaceConfig } from "@dwkt/domain/schemas";
import { assertEquals, assertExists, assertFalse, assertStringIncludes } from "@std/assert";
import * as Effect from "effect/Effect";

Deno.test("exportTablesToCSV - exports tables to CSV without timestamps", async () => {
  // 1. Setup
  const connection = await DuckDBConnection.create();
  const outputDir = await Deno.makeTempDir({ prefix: "dwkt-export-test-" });

  const config: WorkspaceConfig = {
    version: "1",
    standard: { base: "darwin-core", variant: "obis" },
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
        { name: "Event", class: "Event", source: {}, fields: {} },
        { name: "Occurrence", class: "Occurrence", source: {}, fields: {} },
      ],
      output: {
        outputDir: outputDir,
        outputFilesWithTimestamp: false, // For predictable filenames
        exportDB: false,
      },
    },
  };

  try {
    // 2. Arrange: Create and populate tables to be exported
    await connection.run("CREATE TABLE event (eventID TEXT, year INTEGER);");
    await connection.run("INSERT INTO event VALUES ('evt1', 2023);");
    await connection.run("CREATE TABLE occurrence (occurrenceID TEXT, eventID TEXT);");
    await connection.run("INSERT INTO occurrence VALUES ('occ1', 'evt1');");

    // 3. Act: Execute the export function
    const effect = exportTablesToCSV(connection, config);
    await Effect.runPromise(effect);

    // 4. Assert: Verify the CSV files and their contents
    // Check event.csv
    const eventCsvPath = `${outputDir}/event.csv`;
    const eventCsvContent = await Deno.readTextFile(eventCsvPath);
    assertExists(eventCsvContent, "event.csv should be created");
    // DuckDB COPY ... TO (FORMAT CSV, HEADER): LF line endings, unquoted values.
    assertEquals(eventCsvContent.trim(), `eventID,year\nevt1,2023`);

    // Check occurrence.csv
    const occurrenceCsvPath = `${outputDir}/occurrence.csv`;
    const occurrenceCsvContent = await Deno.readTextFile(occurrenceCsvPath);
    assertExists(occurrenceCsvContent, "occurrence.csv should be created");
    assertEquals(occurrenceCsvContent.trim(), `occurrenceID,eventID\nocc1,evt1`);
  } finally {
    // 5. Teardown
    await Deno.remove(outputDir, { recursive: true });
    connection.closeSync();
  }
});

Deno.test("exportTablesToCSV - drops null columns when configured", async () => {
  // 1. Setup
  const connection = await DuckDBConnection.create();
  const outputDir = await Deno.makeTempDir({ prefix: "dwkt-export-null-test-" });

  const config: WorkspaceConfig = {
    version: "1",
    standard: { base: "darwin-core", variant: "obis" },
    createdAt: new Date(),
    updatedAt: new Date(),
    id: "test-workspace",
    name: "Test Workspace",
    description: "A workspace for testing",
    transform: {
      nullValues: [],
      inputs: {},
      postImportTransforms: [],
      datasets: [{ name: "Event", class: "Event", source: {}, fields: {} }],
      output: {
        outputDir: outputDir,
        outputFilesWithTimestamp: false,
        exportDB: false,
        dropNullColumns: true, // Enable dropping null columns
      },
    },
  };

  try {
    // 2. Arrange: Create a table with a column that is entirely NULL
    await connection.run("DROP TABLE IF EXISTS event;");
    await connection.run(
      "CREATE TABLE event (eventID TEXT, year INTEGER, month INTEGER, remarks TEXT);",
    );
    await connection.run(
      "INSERT INTO event VALUES ('evt1', 2023, 1, NULL), ('evt2', 2024, 2, NULL);",
    );

    // 3. Act
    const effect = exportTablesToCSV(connection, config);
    await Effect.runPromise(effect);

    // 4. Assert
    const csvPath = `${outputDir}/event.csv`;
    const csvContent = await Deno.readTextFile(csvPath);
    assertExists(csvContent, "CSV file should be created");

    const [header, ...rows] = csvContent.trim().split("\n");

    // The 'remarks' column should not be in the header.
    // DuckDB COPY output is unquoted with LF line endings.
    assertStringIncludes(header, "eventID", "Header should contain eventID");
    assertStringIncludes(header, "year", "Header should contain year");
    assertStringIncludes(header, "month", "Header should contain month");
    assertFalse(header.includes("remarks"), "Header should NOT contain the null column 'remarks'");

    assertEquals(rows.length, 2, "CSV should contain 2 data rows");
    assertEquals(rows[0], `evt1,2023,1`);
    assertEquals(rows[1], `evt2,2024,2`);
  } finally {
    // 5. Teardown
    await Deno.remove(outputDir, { recursive: true });
    connection.closeSync();
  }
});

Deno.test("exportTablesToCSV - returns OutputError on file system failure", async () => {
  const connection = await DuckDBConnection.create();
  // Invalid path to trigger a file system error
  const invalidOutputDir = "/non_existent_dir/sub_dir";

  const config: WorkspaceConfig = {
    version: "1",
    standard: { base: "darwin-core", variant: "obis" },
    createdAt: new Date(),
    updatedAt: new Date(),
    id: "test-workspace",
    name: "Test Workspace",
    description: "A workspace for testing",
    transform: {
      inputs: {},
      postImportTransforms: [],
      nullValues: [],
      datasets: [{ name: "Event", class: "Event", source: {}, fields: {} }],
      output: { outputDir: invalidOutputDir, exportDB: false },
    },
  };

  const effect = exportTablesToCSV(connection, config);
  const result = await Effect.runPromise(Effect.flip(effect));

  assertEquals(result._tag, "OutputError", "Should fail with OutputError");
  assertEquals(result.outputPath, invalidOutputDir);

  connection.closeSync();
});
