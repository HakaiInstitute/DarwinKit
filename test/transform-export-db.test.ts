/**
 * Persistent DB Export Test
 *
 * Ensures that `exportToPersistentDB` correctly exports the in-memory database
 * to a persistent DuckDB file.
 */

import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { exportToPersistentDB } from "@dwkt/core/transform";
import type { WorkspaceConfig } from "@dwkt/domain/schemas";
import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";

Deno.test("exportToPersistentDB - exports in-memory DB to a file", async () => {
  // 1. Setup: In-memory DB, temp output dir, and config
  const connection = await DuckDBConnection.create();
  const outputDir = await Deno.makeTempDir({ prefix: "dwkt-db-export-test-" });

  const config: WorkspaceConfig = {
    version: "1",
    standard: "obis",
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
        exportDB: true,
        outputFilesWithTimestamp: false, // For predictable filename
        exportDBFileName: "test-output",
      },
    },
  };

  const dbPath = `${outputDir}/test-output.duckdb`;

  try {
    // 2. Arrange: Create and populate tables in the in-memory DB
    await connection.run("CREATE TABLE event (eventID TEXT, year INTEGER);");
    await connection.run("INSERT INTO event VALUES ('evt1', 2025);");
    await connection.run("CREATE TABLE occurrence (occurrenceID TEXT, eventID TEXT);");
    await connection.run("INSERT INTO occurrence VALUES ('occ1', 'evt1');");

    // 3. Act: Execute the export function
    await Effect.runPromise(exportToPersistentDB(connection, config));

    // 4. Assert: Verify the contents of the created DB file
    // Connect to the newly created persistent DB file
    const diskConnection = await DuckDBInstance.create(dbPath)
      .then((instance) => instance.connect());

    // Check Event table data
    const eventResult = await diskConnection.runAndReadAll("SELECT * FROM event;");
    const eventRows = eventResult.getRowObjects();
    assertEquals(eventRows.length, 1, "Event table should have one row in persistent DB");
    assertEquals(eventRows[0].year, 2025);

    // Check Occurrence table data
    const occResult = await diskConnection.runAndReadAll("SELECT * FROM occurrence;");
    const occRows = occResult.getRowObjects();
    assertEquals(occRows.length, 1, "Occurrence table should have one row in persistent DB");
    assertEquals(occRows[0].occurrenceID, "occ1");

    diskConnection.closeSync();
  } finally {
    // 5. Teardown
    await Deno.remove(outputDir, { recursive: true });
    connection.closeSync();
  }
});

Deno.test("exportToPersistentDB - does nothing if exportDB is false", async () => {
  const connection = await DuckDBConnection.create();
  const outputDir = await Deno.makeTempDir({ prefix: "dwkt-db-no-export-" });
  const config: WorkspaceConfig = {
    version: "1",
    standard: "obis",
    createdAt: new Date(),
    updatedAt: new Date(),
    id: "test-workspace",
    name: "Test Workspace",
    description: "A workspace for testing",
    transform: {
      nullValues: [],
      inputs: {},
      postImportTransforms: [],
      datasets: [],
      output: {
        outputDir: outputDir,
        exportDB: false,
      },
    },
  };

  await Effect.runPromise(exportToPersistentDB(connection, config));

  // Assert that no files were created in the output directory
  const files = Array.from(Deno.readDirSync(outputDir));
  assertEquals(files.length, 0, "No database file should be created when exportDB is false");

  await Deno.remove(outputDir, { recursive: true });
  connection.closeSync();
});
