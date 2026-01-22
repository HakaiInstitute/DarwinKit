/**
 * Persistent DB Export Test
 *
 * Ensures that `exportToPersistentDB` correctly exports the in-memory database
 * to a persistent DuckDB file.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { exportToPersistentDB, Workspace } from "@dwkt/core";
import type { ConfigWithTransformation } from "@dwkt/domain";
import { makeTransformConfig, makeTransformOutputConfig, makeWorkspaceConfig } from "@dwkt/domain";
import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";

Deno.test("exportToPersistentDB - exports in-memory DB to a file", async () => {
  // 1. Setup: temp output dir and config
  const outputDir = await Deno.makeTempDir({ prefix: "dwkt-db-export-test-" });

  const config = makeWorkspaceConfig({
    version: "1",
    id: "test-workspace",
    name: "Test Workspace",
    description: "A workspace for testing",
    transform: makeTransformConfig({
      // import: omitted - uses defaults { nullValues: [], dropTable: false }
      inputs: {},
      postImportTransforms: [],
      datasets: [
        { name: "Event", profile: "Event", source: {}, fields: {} },
        { name: "Occurrence", profile: "Occurrence", source: {}, fields: {} },
      ],
      output: makeTransformOutputConfig({
        dir: outputDir,
        exportDB: true,
        exportDbFileName: "test-output",
      }),
    }),
  }) as ConfigWithTransformation;

  const workspace = Workspace.create(config);
  const dbPath = `${outputDir}/test-output.duckdb`;

  try {
    // Get connection from workspace
    const connection = await Effect.runPromise(workspace.getConnection());

    // 2. Arrange: Create and populate tables in the in-memory DB
    await connection.run("CREATE TABLE event (eventID TEXT, year INTEGER);");
    await connection.run("INSERT INTO event VALUES ('evt1', 2025);");
    await connection.run("CREATE TABLE occurrence (occurrenceID TEXT, eventID TEXT);");
    await connection.run("INSERT INTO occurrence VALUES ('occ1', 'evt1');");

    // 3. Act: Execute the export function
    // Config is already typed as TransformOnlyConfig
    await Effect.runPromise(
      exportToPersistentDB(connection, config.transform),
    );

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
    workspace.close();
  }
});

Deno.test("exportToPersistentDB - does nothing if exportDB is false", async () => {
  const outputDir = await Deno.makeTempDir({ prefix: "dwkt-db-no-export-" });
  const config = makeWorkspaceConfig({
    version: "1",
    id: "test-workspace",
    name: "Test Workspace",
    description: "A workspace for testing",
    transform: makeTransformConfig({
      // import: omitted - uses defaults { nullValues: [], dropTable: false }
      inputs: {},
      postImportTransforms: [],
      datasets: [],
      output: {
        dir: outputDir,
        exportDB: false,
        outputFilesWithTimestamp: false,
        dropNullColumns: false,
      },
    }),
  }) as ConfigWithTransformation;

  const workspace = Workspace.create(config);
  const connection = await Effect.runPromise(workspace.getConnection());

  // When exportDB is false, we still call the function but it should skip export
  await Effect.runPromise(
    exportToPersistentDB(connection, config.transform!),
  );

  // Assert that no files were created in the output directory
  const files = Array.from(Deno.readDirSync(outputDir));
  assertEquals(files.length, 0, "No database file should be created when exportDB is false");

  await Deno.remove(outputDir, { recursive: true });
  workspace.close();
});
