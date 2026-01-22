/**
 * CSV Export Test
 *
 * Ensures that `exportObisTablesToCSV` correctly exports data from tables
 * to CSV files according to the workspace configuration.
 */

import { exportObisTablesToCSV } from "@dwkt/core";
import { makeTransformConfig, makeTransformOutputConfig } from "@dwkt/domain";
import { assertEquals, assertExists, assertFalse } from "@std/assert";
import * as Effect from "effect/Effect";
import { readCsvFile, withTestWorkspace } from "./helpers/config-utils.ts";

Deno.test("exportObisTablesToCSV - exports tables to CSV without timestamps", async () => {
  await withTestWorkspace(async (tempDir, workspace) => {
    const connection = await Effect.runPromise(workspace.getConnection());

    // Arrange: Create and populate tables to be exported
    await connection.run("CREATE TABLE event (eventID TEXT, year INTEGER);");
    await connection.run("INSERT INTO event VALUES ('evt1', 2023);");
    await connection.run("CREATE TABLE occurrence (occurrenceID TEXT, eventID TEXT);");
    await connection.run("INSERT INTO occurrence VALUES ('occ1', 'evt1');");

    // Act: Execute the export function
    const transformSettings = makeTransformConfig({
      // import: omitted - uses defaults { nullValues: [], dropTable: false }
      inputs: {},
      datasets: [
        { name: "Event", profile: "Event", source: {}, fields: {} },
        { name: "Occurrence", profile: "Occurrence", source: {}, fields: {} },
      ],
      output: makeTransformOutputConfig({
        dir: tempDir,
      }),
    });
    await Effect.runPromise(exportObisTablesToCSV(connection, transformSettings));

    // Assert: Verify the CSV files and their contents
    const eventRows = await readCsvFile<{ eventID: string; year: string }>(`${tempDir}/event.csv`);
    assertEquals(eventRows.length, 1, "event.csv should contain 1 row");
    assertEquals(eventRows[0].eventID, "evt1");
    assertEquals(eventRows[0].year, "2023");

    const occurrenceRows = await readCsvFile<{ occurrenceID: string; eventID: string }>(
      `${tempDir}/occurrence.csv`,
    );
    assertEquals(occurrenceRows.length, 1, "occurrence.csv should contain 1 row");
    assertEquals(occurrenceRows[0].occurrenceID, "occ1");
    assertEquals(occurrenceRows[0].eventID, "evt1");
  });
});

Deno.test("exportObisTablesToCSV - drops null columns when configured", async () => {
  await withTestWorkspace(async (tempDir, workspace) => {
    const connection = await Effect.runPromise(workspace.getConnection());

    // Arrange: Create a table with a column that is entirely NULL
    await connection.run(
      "CREATE TABLE event (eventID TEXT, year INTEGER, month INTEGER, remarks TEXT);",
    );
    await connection.run(
      "INSERT INTO event VALUES ('evt1', 2023, 1, NULL), ('evt2', 2024, 2, NULL);",
    );

    // Act
    const transformSettings = makeTransformConfig({
      // import: omitted - uses defaults { nullValues: [], dropTable: false }
      inputs: {},
      datasets: [{ name: "Event", profile: "Event", source: {}, fields: {} }],
      output: makeTransformOutputConfig({
        dir: tempDir,
        dropNullColumns: true,
      }),
    });
    await Effect.runPromise(exportObisTablesToCSV(connection, transformSettings));

    // Assert
    const rows = await readCsvFile<{
      eventID: string;
      year: string;
      month: string;
      remarks?: string;
    }>(`${tempDir}/event.csv`);

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
  });
});

Deno.test("exportObisTablesToCSV - returns OutputError on file system failure", async () => {
  const invalidOutputDir = "/non_existent_dir/sub_dir";

  await withTestWorkspace(async (_tempDir, workspace) => {
    const connection = await Effect.runPromise(workspace.getConnection());

    // Act
    const transformSettings = makeTransformConfig({
      // import: omitted - uses defaults { nullValues: [], dropTable: false }
      inputs: {},
      datasets: [{ name: "Event", profile: "Event", source: {}, fields: {} }],
      output: {
        dir: invalidOutputDir,
        exportDB: false,
        outputFilesWithTimestamp: false,
        dropNullColumns: false,
      },
    });
    const effect = exportObisTablesToCSV(connection, transformSettings);
    const result = await Effect.runPromise(Effect.flip(effect));

    // Assert
    assertEquals(result._tag, "OutputError", "Should fail with OutputError");
    assertEquals(result.outputPath, invalidOutputDir);
  });
});
