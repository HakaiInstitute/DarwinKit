/**
 * Persistent DB Export Test
 *
 * Ensures that `exportToPersistentDB` correctly exports the in-memory database
 * to a persistent DuckDB file.
 */

import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { exportToPersistentDB } from "@dwkit/core/transform";
import type { WorkspaceConfig } from "@dwkit/domain/schemas";
import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";

Deno.test("exportToPersistentDB - exports in-memory DB to a file", async () => {
  const connection = await DuckDBConnection.create();
  const outputDir = await Deno.makeTempDir({ prefix: "dwkt-db-export-test-" });

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
        exportDB: true,
        outputFilesWithTimestamp: false, // For predictable filename
        exportDBFileName: "test-output",
      },
    },
  };

  const dbPath = `${outputDir}/test-output.duckdb`;

  try {
    await connection.run("CREATE TABLE event (eventID TEXT, year INTEGER, _row_number BIGINT);");
    await connection.run("INSERT INTO event VALUES ('evt1', 2025, 1);");
    await connection.run(
      "CREATE TABLE occurrence (occurrenceID TEXT, eventID TEXT, _row_number BIGINT);",
    );
    await connection.run("INSERT INTO occurrence VALUES ('occ1', 'evt1', 1);");

    await Effect.runPromise(exportToPersistentDB(connection, config));

    const diskConnection = await DuckDBInstance.create(dbPath)
      .then((instance) => instance.connect());

    const eventResult = await diskConnection.runAndReadAll("SELECT * FROM event;");
    const eventRows = eventResult.getRowObjects();
    assertEquals(eventRows.length, 1, "Event table should have one row in persistent DB");
    assertEquals(eventRows[0].year, 2025);

    const occResult = await diskConnection.runAndReadAll("SELECT * FROM occurrence;");
    const occRows = occResult.getRowObjects();
    assertEquals(occRows.length, 1, "Occurrence table should have one row in persistent DB");
    assertEquals(occRows[0].occurrenceID, "occ1");

    // _row_number must not leak into the persisted DB.
    const eventCols = (await diskConnection.runAndReadAll("PRAGMA table_info(event);"))
      .getRowObjects().map((c) => String(c.name));
    assertEquals(eventCols.includes("_row_number"), false, "_row_number must be excluded");

    // year is a spec integer -> INTEGER column in the persisted DB.
    const yearCol = (await diskConnection.runAndReadAll("PRAGMA table_info(event);"))
      .getRowObjects().find((c) => c.name === "year");
    assertEquals(String(yearCol?.column_type ?? yearCol?.type), "INTEGER");

    diskConnection.closeSync();
  } finally {
    await Deno.remove(outputDir, { recursive: true });
    connection.closeSync();
  }
});

Deno.test("exportToPersistentDB - does nothing if exportDB is false", async () => {
  const connection = await DuckDBConnection.create();
  const outputDir = await Deno.makeTempDir({ prefix: "dwkt-db-no-export-" });
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
