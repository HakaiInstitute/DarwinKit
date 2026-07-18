/**
 * Data Population Test
 *
 * Ensures that `populateSchemaFromDataTables` correctly populates schema
 * tables with data from source tables using SQL transformations defined
 * in the workspace configuration.
 */

import { DuckDBConnection } from "@duckdb/node-api";
import { createTableFromSchema, populateSchemaFromDataTables } from "@dwkit/core/transform";
import type { WorkspaceConfig } from "@dwkit/domain/schemas";
import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";

Deno.test("populateSchemaFromDataTables - populates schema from source tables", async () => {
  const connection = await DuckDBConnection.create();

  const config: WorkspaceConfig = {
    version: "1",
    standard: { base: "darwin-core", variant: "obis" },
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
          class: "Event",
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
          class: "Occurrence",
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

    await Effect.runPromise(createTableFromSchema(connection, config));

    const effect = populateSchemaFromDataTables(connection, config);
    await Effect.runPromise(effect);

    const eventResult = await connection.runAndReadAll("SELECT * FROM event;");
    const eventRows = eventResult.getRowObjects();
    assertEquals(eventRows.length, 1, "Event table should have one row");
    const eventRow = eventRows[0];
    assertEquals(eventRow.eventID, "evt1");
    // Output tables are all-VARCHAR (no enforcement DDL); year comes back as text
    // until the persisted-DB export casts it (see exportToPersistentDB).
    assertEquals(eventRow.year, "2023");
    assertEquals(eventRow.eventDate, "2023-01-15");

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
    connection.closeSync();
  }
});

Deno.test("populateSchemaFromDataTables - assigns sequential _row_number values", async () => {
  const connection = await DuckDBConnection.create();
  const config: WorkspaceConfig = {
    version: "1",
    standard: { base: "darwin-core", variant: "obis" },
    name: "rownum",
    id: "rownum",
    createdAt: new Date(),
    updatedAt: new Date(),
    transform: {
      nullValues: [],
      inputs: {},
      postImportTransforms: [],
      datasets: [{
        name: "Event",
        class: "Event",
        source: { source_events: "source_events" },
        fields: { eventID: "source_events.event_id" },
      }],
      output: { outputDir: "/tmp/output", exportDB: false },
    },
  };
  try {
    await connection.run("CREATE TABLE source_events (event_id TEXT);");
    await connection.run("INSERT INTO source_events VALUES ('evt1'), ('evt2');");
    await Effect.runPromise(createTableFromSchema(connection, config));
    await Effect.runPromise(populateSchemaFromDataTables(connection, config));

    const rows = (await connection.runAndReadAll(
      "SELECT _row_number FROM event ORDER BY _row_number",
    )).getRowObjects();
    assertEquals(rows.map((r) => Number(r._row_number)), [1, 2]);
  } finally {
    connection.closeSync();
  }
});
