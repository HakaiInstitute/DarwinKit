/**
 * Schema Creation Test
 *
 * Ensures that `createTableFromSchema` correctly generates tables,
 * ENUM types, and constraints from a workspace configuration.
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import { DuckDBConnection } from "@duckdb/node-api";
import { expect, vi } from "vitest";
import { createTableFromSchema, TransformationError } from "@dwkt/core";
import type { WorkspaceConfig } from "@dwkt/domain";

interface TableInfoRow {
  name: string;
  type: string;
  notnull: boolean;
  pk: boolean;
}

interface ForeignKeyInfoRow {
  table: string;
  from: string;
  to: string;
}

Deno.test("createTableFromSchema - creates tables, enums, and constraints", async () => {
  // 1. Setup: In-memory DuckDB and test configuration
  const connection = await DuckDBConnection.create();

  const config: WorkspaceConfig = {
    version: "1",
    name: "",
    id: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    transform: {
      nullValues: [],
      output: {
        outputDir: "",
        exportDB: false,
      },
      inputs: {},
      postImportTransforms: [],
      datasets: [
        {
          name: "Event",
          profile: "Event",
          source: { test: "" },
          fields: {},
        },
        {
          name: "Occurrence",
          profile: "Occurrence",
          source: { test: "" },
          fields: {},
        },
      ],
    },
  };

  try {
    // 2. Execute the function
    const effect = createTableFromSchema(connection, config);
    await Effect.runPromise(effect);

    // 3. Verify the results
    // Check if ENUM type for basisOfRecord was created for the Occurrence table
    const enumResult = await connection.runAndReadAll(
      `SELECT enum_range(enum_first(NULL::occurrence_basisofrecord_enum))`,
    );
    const enums = JSON.parse(enumResult.getRowObjects()[0].toString())[
      "enum_range(enum_first(NULL::occurrence_basisofrecord_enum))"
    ];
    assertExists(enums, "basisOfRecord ENUM type should be created");
    assertEquals(enums.length, 12, "Should have 12 values for basisOfRecord enum");

    // Check Event table schema
    const eventTableInfo = await connection.runAndReadAll("PRAGMA table_info(event);");
    const eventColumns = eventTableInfo.getRowObjects().map((c) => ({
      name: c.name,
      type: c.type,
      notnull: c.notnull,
      pk: c.pk,
    }));

    const eventIdCol = eventColumns.find((c) => c.name === "eventID");
    assertExists(eventIdCol, "eventID column should exist in event table");
    assertEquals(eventIdCol.type, "TEXT", "eventID should be of type TEXT");
    assertEquals(eventIdCol.pk, true, "eventID should be the primary key");

    const yearCol = eventColumns.find((c) => c.name === "year");
    assertExists(yearCol, "year column should exist in event table");
    assertEquals(yearCol.type, "INTEGER", "year should be of type INTEGER");

    // Check Occurrence table schema
    const occurrenceTableInfo = await connection.runAndReadAll(
      "PRAGMA table_info(occurrence);",
    );
    const occurrenceColumns = occurrenceTableInfo.getRowObjects().map((c) => ({
      name: c.name,
      type: c.type,
      notnull: c.notnull,
      pk: c.pk,
    }));

    const occurrenceIdCol = occurrenceColumns.find((c) => c.name === "occurrenceID");
    assertExists(occurrenceIdCol, "occurrenceID column should exist");
    assertEquals(occurrenceIdCol.pk, true, "occurrenceID should be primary key");

    const basisOfRecordCol = occurrenceColumns.find((c) => c.name === "basisOfRecord");
    assertExists(basisOfRecordCol, "basisOfRecord column should exist");
    assertEquals(
      basisOfRecordCol.type,
      "OCCURRENCE_BASISOFRECORD_ENUM",
      "basisOfRecord should use the created ENUM type",
    );
    assertEquals(basisOfRecordCol.notnull, true, "basisOfRecord should be NOT NULL");

    // Check foreign key constraint (DuckDB stores this in a separate pragma)
    const foreignKeys = await connection.runAndReadAll("PRAGMA foreign_keys(occurrence);");
    const fk = foreignKeys.getRowObjects()[0];
    assertExists(fk, "Foreign key from occurrence to event should exist");
    assertEquals(fk.table, "event", "Foreign key should reference the event table");
    assertEquals(fk.from, "eventID", "Foreign key should be on the eventID column");
    assertEquals(fk.to, "eventID", "Foreign key should reference the eventID column");
  } finally {
    // 4. Teardown
    connection.closeSync();
  }
});

Deno.test("createTableFromSchema - does nothing for empty datasets", async () => {
  const connection = await DuckDBConnection.create();

  const config: WorkspaceConfig = {
    version: "1",
    name: "",
    id: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    transform: {
      nullValues: [],
      datasets: [], // No datasets
      output: {
        outputDir: "",
        exportDB: false,
      },
      inputs: {},
      postImportTransforms: [],
    },
  };

  // Mock the connection.run to spy on it
  const runSpy = vi.spyOn(connection, "run");

  try {
    await Effect.runPromise(createTableFromSchema(connection, config));

    // Verify that no SQL was executed
    expect(runSpy).not.toHaveBeenCalled();
  } finally {
    runSpy.mockRestore();
    connection.closeSync();
  }
});

Deno.test("createTableFromSchema - returns TransformationError on SQL failure", async () => {
  const connection = await DuckDBConnection.create();

  const config: WorkspaceConfig = {
    version: "1",
    name: "",
    id: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    transform: {
      nullValues: [],
      inputs: {},
      postImportTransforms: [],
      datasets: [
        {
          name: "InvalidTable",
          // Using a profile that will generate invalid SQL (e.g., bad type)
          profile: "Occurrence",
          source: {},
          fields: {},
        },
      ],
      output: {
        outputDir: "",
        exportDB: false,
      },
    },
  };

  // Mock connection.run to throw an error
  const dbError = new Error("Syntax error");
  const runSpy = vi.spyOn(connection, "run").mockRejectedValue(dbError);

  try {
    const result = await Effect.runPromise(Effect.flip(createTableFromSchema(connection, config)));

    // Assert that the effect failed with the correct error type
    assert(result instanceof TransformationError, "Should fail with TransformationError");
    assertEquals(result.message, "Failed to create ENUM types for table 'occurrence'");
    assertEquals(result.cause, dbError);
  } finally {
    runSpy.mockRestore();
    connection.closeSync();
  }
});

Deno.test("createTableFromSchema - handles complex schema with multiple tables and FKs", async () => {
  const connection = await DuckDBConnection.create();

  const config: WorkspaceConfig = {
    version: "1",
    name: "",
    id: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    transform: {
      nullValues: [],
      inputs: {},
      postImportTransforms: [],
      datasets: [
        { name: "Event", profile: "Event", source: { test: "" }, fields: {} },
        { name: "Occurrence", profile: "Occurrence", source: { test: "" }, fields: {} },
        {
          name: "MeasurementOrFact",
          profile: "ExtendedMeasurementOrFact",
          source: { test: "" },
          fields: {},
        },
      ],
      output: {
        outputDir: "",
        exportDB: false,
      },
    },
  };

  try {
    await Effect.runPromise(createTableFromSchema(connection, config));

    // Verify Event table
    const eventInfo = await connection.runAndReadAll("PRAGMA table_info(event);");
    assert(
      eventInfo.getRowObjects().some((c) => c.name === "eventID" && c.pk),
      "event.eventID should be PK",
    );

    // Verify Occurrence table
    const occInfo = await connection.runAndReadAll("PRAGMA table_info(occurrence);");
    assert(
      occInfo.getRowObjects().some((c) => c.name === "occurrenceID" && c.pk),
      "occurrence.occurrenceID should be PK",
    );
    const basisOfRecordCol = occInfo.getRowObjects().find((c) => c.name === "basisOfRecord");
    assertExists(basisOfRecordCol, "basisOfRecord column should exist");
    assertEquals(basisOfRecordCol?.notnull, true, "basisOfRecord should be NOT NULL");

    // Verify MeasurementOrFact table
    const mofInfo = await connection.runAndReadAll(
      "PRAGMA table_info(extendedmeasurementorfact);",
    );
    assert(
      mofInfo.getRowObjects().some((c) => c.name === "measurementID" && c.pk),
      "mof.measurementID should be PK",
    );

    // Verify Foreign Keys
    // 1. From Occurrence to Event
    const occFks = await connection.runAndReadAll("PRAGMA foreign_keys(occurrence);");
    const occFkToEvent = occFks.getRowObjects().find((fk) => fk.table === "event");
    assertExists(occFkToEvent, "Occurrence should have a foreign key to Event");
    assertEquals(occFkToEvent?.from, "eventID");
    assertEquals(occFkToEvent?.to, "eventID");

    // 2. From MeasurementOrFact to Event
    const mofFks = await connection.runAndReadAll(
      "PRAGMA foreign_keys(extendedmeasurementorfact);",
    );
    const mofFkToEvent = mofFks.getRowObjects().find((fk) => fk.table === "event");
    assertExists(mofFkToEvent, "MeasurementOrFact should have a foreign key to Event");
    assertEquals(mofFkToEvent?.from, "eventID");
    assertEquals(mofFkToEvent?.to, "eventID");
  } finally {
    connection.closeSync();
  }
});
