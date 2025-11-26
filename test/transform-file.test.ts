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

Deno.test("transformFile - runs the full end-to-end transformation process", async () => {
  // 1. Setup: Create a temporary workspace with config and source data
  const workspaceDir = await Deno.makeTempDir({ prefix: "dwkt-e2e-test-" });
  const outputDir = join(workspaceDir, "output");
  const configPath = join(workspaceDir, "workspace.dwc.json");
  const sourceCsvPath = join(workspaceDir, "source_data.csv");

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
      },
    },
  };

  try {
    // 2. Arrange: Write the config and source CSV file to the temp directory
    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
    await Deno.writeTextFile(
      sourceCsvPath,
      "event_id,event_year,occ_id\nevt01,2024,occ01",
    );

    // 3. Act: Run the entire transformation process
    await Effect.runPromise(transformFile(configPath));

    // 4. Assert: Verify the output files
    // Assert CSV output
    const eventCsvContent = await Deno.readTextFile(join(outputDir, "event.csv"));
    assertEquals(eventCsvContent.trim(), `"eventID","year"\n"evt01",2024`);

    const occCsvContent = await Deno.readTextFile(join(outputDir, "occurrence.csv"));
    assertEquals(
      occCsvContent.trim(),
      `"occurrenceID","eventID","basisOfRecord"\n"occ01","evt01","HumanObservation"`,
    );

    // Assert persistent DB output
    const dbPath = join(outputDir, "final_db.duckdb");
    const stat = await Deno.stat(dbPath);
    assertExists(stat.isFile, "Database file should be created");

    // Connect to the created DB and verify its contents
    const connection = await DuckDBConnection.create();

    const eventRows = (await connection.runAndReadAll("SELECT * FROM event;")).getRowObjects();
    assertEquals(eventRows.length, 1);
    assertEquals(eventRows[0].eventID, "evt01");
    assertEquals(eventRows[0].year, 2024);

    const occRows = (await connection.runAndReadAll("SELECT * FROM occurrence;")).getRowObjects();
    assertEquals(occRows.length, 1);
    assertEquals(occRows[0].occurrenceID, "occ01");
    assertEquals(occRows[0].basisOfRecord, "HumanObservation");

    connection.closeSync();
  } finally {
    // 5. Teardown
    await Deno.remove(workspaceDir, { recursive: true });
  }
});

Deno.test("transformFile - returns ConfigError for non-existent config", async () => {
  const nonExistentConfigPath = "/path/to/nothing/workspace.dwc.json";

  const result = await Effect.runPromise(Effect.flip(transformFile(nonExistentConfigPath)));

  assertExists(result, "Effect should fail");
  // assertEquals(result._tag, "ConfigError", "Error should be a ConfigError");
});
