/**
 * Data Population Test
 *
 * Ensures that `populateSchemaFromDataTables` correctly populates schema
 * tables with data from source tables using SQL transformations defined
 * in the workspace configuration.
 */

import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import { DuckDBConnection } from "@duckdb/node-api";
import { createTableFromSchema, populateSchemaFromDataTables } from "@dwkt/core";
import type { WorkspaceConfig } from "@dwkt/domain";

Deno.test("populateSchemaFromDataTables - populates schema from source tables", async () => {
  // 1. Setup: In-memory DuckDB and test configuration
  const connection = await DuckDBConnection.create();

  const config: WorkspaceConfig = {
    version: "1",
    name: "Data Population Test Workspace",
    id: "data-population-test-workspace",
    createdAt: new Date(),
    updatedAt: new Date(),
    transform: {
      nullValues: [],
      inputs: {},
      postImportTransforms: [],
      datasets: [
        {
          name: "Event",
          profile: "dwc-event",
          source: {
            "source_events": "source_events",
          },
          fields: {
            "eventID": "source_events.event_id",
            "year": "source_events.event_year",
            "eventDate": "source_events.full_date",
          },
        },
        {
          name: "Occurrence",
          profile: "dwc-occurrence",
          source: {
            "source_occurrences": "source_occurrences",
          },
          fields: {
            "occurrenceID": "source_occurrences.occ_id",
            "eventID": "source_occurrences.event_fk",
            "basisOfRecord": "source_occurrences.record_type",
            "scientificName": "'Puma concolor'", // Example of a static value
          },
        },
      ],
      output: {
        outputDir: "/tmp/output",
        exportDB: false,
      },
    },
  };

  try {
    // 2. Arrange: Create source tables, data, and target schema
    // Create source tables with mock data
    await connection.run(
      "CREATE TABLE source_events (event_id TEXT, event_year INTEGER, full_date TEXT);",
    );
    await connection.run(
      "INSERT INTO source_events VALUES ('evt1', 2023, '2023-01-15');",
    );
    await connection.run(
      "CREATE TABLE source_occurrences (occ_id TEXT, event_fk TEXT, record_type TEXT);",
    );
    await connection.run(
      "INSERT INTO source_occurrences VALUES ('occ1', 'evt1', 'HumanObservation');",
    );

    // Create the target schema tables (they will be empty)
    await Effect.runPromise(createTableFromSchema(connection, config));

    // 3. Act: Execute the data population function
    const effect = populateSchemaFromDataTables(connection, config);
    await Effect.runPromise(effect);

    // 4. Assert: Verify the data was populated and transformed correctly
    // Check Event table data
    const eventResult = await connection.runAndReadAll("SELECT * FROM event;");
    const eventRows = eventResult.getRowObjects();
    assertEquals(eventRows.length, 1, "Event table should have one row");
    const eventRow = eventRows[0];
    assertEquals(eventRow.eventID, "evt1");
    assertEquals(eventRow.year, 2023);
    assertEquals(eventRow.eventDate, "2023-01-15");

    // Check Occurrence table data
    const occurrenceResult = await connection.runAndReadAll("SELECT * FROM occurrence;");
    const occurrenceRows = occurrenceResult.getRowObjects();
    assertEquals(occurrenceRows.length, 1, "Occurrence table should have one row");
    const occurrenceRow = occurrenceRows[0];
    assertEquals(occurrenceRow.occurrenceID, "occ1");
    assertEquals(occurrenceRow.eventID, "evt1", "Foreign key should be populated");
    assertEquals(
      occurrenceRow.basisOfRecord,
      "HumanObservation",
      "basisOfRecord should be mapped correctly",
    );
    assertEquals(
      occurrenceRow.scientificName,
      "Puma concolor",
      "Static value should be inserted",
    );
  } finally {
    // 5. Teardown
    connection.closeSync();
  }
});
