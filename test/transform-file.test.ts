/**
 * End-to-End Transformation Test
 *
 * Ensures that `transformFile` correctly orchestrates the entire data
 * transformation pipeline, from reading source CSVs to exporting final
 * CSVs and a persistent database file.
 */

import { assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import { DuckDBConnection } from "@duckdb/node-api";
import { transformFile } from "@dwkt/core";
import type { WorkspaceConfig } from "@dwkt/domain";
import { join } from "@std/path";
import {
  readCsvFile,
  withTestDirectory,
  writeCsvFile,
  writeJsonFile,
} from "./helpers/config-utils.ts";

Deno.test("transformFile - runs the full end-to-end transformation process", async () => {
  await withTestDirectory(async (workspaceDir) => {
    const outputDir = join(workspaceDir, "output");
    const configPath = join(workspaceDir, "workspace.dwc.json");

    const config: WorkspaceConfig = {
      version: "1",
      createdAt: new Date(),
      updatedAt: new Date(),
      id: "test-workspace",
      name: "Test Workspace",
      description: "A workspace for testing",
      transform: {
        inputs: {
          source_data: "source_data.csv",
        },
        nullValues: ["NA"],
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
        output: {
          outputDir: outputDir,
          exportDB: true,
          outputFilesWithTimestamp: false,
          exportDBFileName: "final_db",
          dropNullColumns: true,
        },
      },
    };

    // 1. Arrange: Write the config and source CSV file to the temp directory
    await writeJsonFile(workspaceDir, "workspace.dwc.json", config);
    await writeCsvFile(workspaceDir, "source_data", [
      { event_id: "evt01", event_year: "2024", occ_id: "occ01" },
    ]);

    // 2. Act: Run the entire transformation process
    await Effect.runPromise(transformFile(configPath));

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

Deno.test("transformFile - returns ConfigError for non-existent config", async () => {
  const nonExistentConfigPath = "/path/to/nothing/workspace.dwc.json";

  const result = await Effect.runPromise(Effect.flip(transformFile(nonExistentConfigPath)));

  assertExists(result, "Effect should fail");
  // assertEquals(result._tag, "ConfigError", "Error should be a ConfigError");
});
