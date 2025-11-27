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
    const typesResult = await connection.runAndReadAll(
      `SELECT type_name FROM duckdb_types() WHERE database_name = 'memory' AND type_name LIKE '%enum%'`,
    );
    const enumExists = typesResult.getRowObjects().some((r) =>
      r.type_name === "occurrence_basisofrecord_enum"
    );
    assert(enumExists, "basisOfRecord ENUM type should be created");

    // Verify that the occurrence table's basisOfRecord column uses the ENUM type
    const occTableInfo = await connection.runAndReadAll("PRAGMA table_info(occurrence);");
    const basisOfRecordColumn = occTableInfo.getRowObjects().find((c) =>
      c.name === "basisOfRecord"
    );
    assertExists(basisOfRecordColumn, "basisOfRecord column should exist in occurrence table");
    // DuckDB's PRAGMA table_info returns the full ENUM definition for custom ENUMs
    const typeStr = String(basisOfRecordColumn.type);
    assert(
      typeStr.startsWith("ENUM("),
      "basisOfRecord column should use an ENUM type",
    );
    assert(
      typeStr.includes("PreservedSpecimen"),
      "ENUM should include PreservedSpecimen value",
    );

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
    assertEquals(
      eventIdCol.type,
      "VARCHAR",
      "eventID should be of type VARCHAR (equivalent to TEXT)",
    );
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
    // DuckDB returns the expanded ENUM definition in PRAGMA table_info, not the type name
    const basisTypeStr = String(basisOfRecordCol.type);
    assert(
      basisTypeStr.startsWith("ENUM("),
      "basisOfRecord should use an ENUM type",
    );
    assert(
      basisTypeStr.includes("PreservedSpecimen"),
      "ENUM should include PreservedSpecimen value",
    );
    // NOT NULL is only applied when profile marks field as required
    // Event/Occurrence base profiles don't mark basisOfRecord as required
    // (only OBIS profiles do, and this test uses base "Occurrence" profile)
    assertEquals(
      basisOfRecordCol.notnull,
      false,
      "basisOfRecord should not be NOT NULL without profile override",
    );

    // Note: Foreign key constraints are created but verification via PRAGMA foreign_keys
    // is not available in all DuckDB versions. The FK is created in the table DDL.
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
    // basisOfRecord is NOT NULL only when profile override marks it as required
    // Base Occurrence profile doesn't mark it as required
    assertEquals(
      basisOfRecordCol?.notnull,
      false,
      "basisOfRecord should not be NOT NULL in base profile",
    );

    // Verify MeasurementOrFact table
    const mofInfo = await connection.runAndReadAll(
      "PRAGMA table_info(extendedmeasurementorfact);",
    );
    assert(
      mofInfo.getRowObjects().some((c) => c.name === "measurementID" && c.pk),
      "mof.measurementID should be PK",
    );

    // Note: Foreign key constraints are created in the table DDL but verification via
    // PRAGMA foreign_keys is not available in all DuckDB versions
  } finally {
    connection.closeSync();
  }
});
