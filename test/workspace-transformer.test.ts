/**
 * End-to-End Transformation Test
 *
 * Ensures that `Workspace.transformer` correctly orchestrates the entire data
 * transformation pipeline, from reading source CSVs to exporting final
 * CSVs and a persistent database file.
 */

import { DuckDBConnection } from "@duckdb/node-api";
import { ConfigNotFoundError, Workspace } from "@dwkt/core";
import {
  importConfigSchema,
  makeTransformConfig,
  makeTransformOutputConfig,
  makeWorkspaceConfig,
} from "@dwkt/domain";
import { assertEquals, assertExists, assertInstanceOf } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";
import {
  readCsvFile,
  withTestDirectory,
  writeCsvFile,
  writeJsonFile,
} from "./helpers/config-utils.ts";

Deno.test("Workspace.transformer - runs the full end-to-end transformation process", async () => {
  await withTestDirectory(async (workspaceDir) => {
    const outputDir = join(workspaceDir, "output");
    const configPath = join(workspaceDir, "workspace.dwc.json");

    const config = makeWorkspaceConfig({
      version: "1",
      id: "test-workspace",
      name: "Test Workspace",
      description: "A workspace for testing",
      transform: makeTransformConfig({
        // import: override nullValues for this test
        import: importConfigSchema.make({ nullValues: ["NA"] }),
        inputs: {
          source_data: "source_data.csv",
        },
        postImportTransforms: [],
        datasets: [
          {
            name: "Event",
            profile: "Event",
            source: { "source_data": "source_data" },
            fields: {
              "eventID": "source_data.event_id",
              "year": "source_data.event_year",
            },
          },
          {
            name: "Occurrence",
            profile: "Occurrence",
            source: { "source_data": "source_data" },
            fields: {
              "occurrenceID": "source_data.occ_id",
              "eventID": "source_data.event_id",
              "basisOfRecord": "'HumanObservation'",
            },
          },
        ],
        output: makeTransformOutputConfig({
          dir: outputDir,
          exportDB: true,
          exportDbFileName: "final_db",
          dropNullColumns: true,
        }),
      }),
    });

    // 1. Arrange: Write the config and source CSV file to the temp directory
    await writeJsonFile(workspaceDir, "workspace.dwc.json", config);
    await writeCsvFile(workspaceDir, "source_data", [
      { event_id: "evt01", event_year: "2024", occ_id: "occ01" },
    ]);

    // 2. Act: Run the entire transformation process using Workspace API
    const workspace = await Effect.runPromise(Workspace.discover(configPath));
    try {
      await Effect.runPromise(workspace.transformer.run());
    } finally {
      workspace.close();
    }

    // 3. Assert: Verify the output files
    // Assert CSV output
    const eventCsvRows = await readCsvFile<{ eventID: string; year: string }>(
      join(outputDir, "event.csv"),
    );
    assertEquals(eventCsvRows.length, 1);
    assertEquals(eventCsvRows[0].eventID, "evt01");
    assertEquals(eventCsvRows[0].year, "2024");

    const occCsvRows = await readCsvFile<{
      basisOfRecord: string;
      occurrenceID: string;
      eventID: string;
    }>(join(outputDir, "occurrence.csv"));
    assertEquals(occCsvRows.length, 1);
    assertEquals(occCsvRows[0].basisOfRecord, "HumanObservation");
    assertEquals(occCsvRows[0].occurrenceID, "occ01");
    assertEquals(occCsvRows[0].eventID, "evt01");

    // Assert persistent DB output
    const dbPath = join(outputDir, "final_db.duckdb");
    const stat = await Deno.stat(dbPath);
    assertExists(stat.isFile, "Database file should be created");

    // Connect to the created DB and verify its contents
    const dbConnection = await DuckDBConnection.create();
    await dbConnection.run(`ATTACH '${dbPath}' AS persisted_db;`);

    const eventRows = (await dbConnection.runAndReadAll("SELECT * FROM persisted_db.event;"))
      .getRowObjects();
    assertEquals(eventRows.length, 1);
    assertEquals(eventRows[0].eventID, "evt01");
    assertEquals(eventRows[0].year, 2024);

    const occRows = (await dbConnection.runAndReadAll("SELECT * FROM persisted_db.occurrence;"))
      .getRowObjects();
    assertEquals(occRows.length, 1);
    assertEquals(occRows[0].occurrenceID, "occ01");
    assertEquals(occRows[0].basisOfRecord, "HumanObservation");

    dbConnection.closeSync();
  });
});

Deno.test("Workspace.discover - returns ConfigNotFoundError for non-existent config", async () => {
  const nonExistentConfigPath = "/path/to/nothing/workspace.dwc.json";
  const result = await Effect.runPromise(Effect.flip(Workspace.discover(nonExistentConfigPath)));

  assertInstanceOf(result, ConfigNotFoundError);
});
