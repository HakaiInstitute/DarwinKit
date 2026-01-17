/**
 * Schema Creation Test
 *
 * Ensures that `createTableFromSchema` correctly generates tables,
 * ENUM types, and constraints from a workspace configuration.
 */

import { DuckDBConnection } from "@duckdb/node-api";
import { createTableFromSchema, Workspace } from "@dwkt/core";
import type { WorkspaceConfig } from "@dwkt/domain";
import { assert, assertEquals, assertExists, assertFalse } from "@std/assert";
import * as Effect from "effect/Effect";

/**
 * Helper function to verify foreign key constraints in DuckDB
 *
 * DuckDB doesn't support PRAGMA foreign_keys(), so we use information_schema
 * to verify FK constraints. The constraint naming convention is:
 * - FK: {source_table}_{source_column}_{target_column}_fkey
 * - PK: {table}_{column}_pkey
 *
 * @param connection - DuckDB connection
 * @param sourceTable - Table containing the foreign key
 * @param sourceColumn - Column with the foreign key constraint
 * @param targetTable - Referenced table
 * @param targetColumn - Referenced column (usually the PK)
 * @returns True if FK exists, false otherwise
 */
async function verifyForeignKey(
  connection: DuckDBConnection,
  sourceTable: string,
  sourceColumn: string,
  targetTable: string,
  targetColumn: string,
): Promise<boolean> {
  const query = `
    SELECT
      tc.constraint_name,
      rc.unique_constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = '${sourceTable.toLowerCase()}';
  `;

  const result = await connection.runAndReadAll(query);
  const fks = result.getRowObjects();

  // Expected FK constraint name: {table}_{sourceCol}_{targetCol}_fkey
  const expectedFKName =
    `${sourceTable.toLowerCase()}_${sourceColumn.toLowerCase()}_${targetColumn.toLowerCase()}_fkey`;

  // Expected referenced PK constraint name: {table}_{column}_pkey
  const expectedPKName = `${targetTable.toLowerCase()}_${targetColumn.toLowerCase()}_pkey`;

  return fks.some((fk) =>
    fk.constraint_name === expectedFKName &&
    fk.unique_constraint_name === expectedPKName
  );
}

/**
 * Get all foreign keys for a table
 *
 * @param connection - DuckDB connection
 * @param tableName - Table to check
 * @returns Array of FK information
 */
async function getForeignKeys(
  connection: DuckDBConnection,
  tableName: string,
): Promise<
  Array<{ constraint_name: string; referenced_table: string; referenced_column: string }>
> {
  const query = `
    SELECT
      tc.constraint_name,
      rc.unique_constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = '${tableName.toLowerCase()}';
  `;

  const result = await connection.runAndReadAll(query);
  const fks = result.getRowObjects();

  // Parse constraint names to extract table and column info
  // FK format: {table}_{sourceCol}_{targetCol}_fkey
  // PK format: {table}_{column}_pkey
  return fks.map((fk) => {
    const pkParts = String(fk.unique_constraint_name).match(/^(.+?)_(.+?)_pkey$/);
    const referencedTable = pkParts?.[1] || "";
    const referencedColumn = pkParts?.[2] || "";

    return {
      constraint_name: String(fk.constraint_name),
      referenced_table: referencedTable,
      referenced_column: referencedColumn,
    };
  });
}

Deno.test("createTableFromSchema - creates tables and constraints with ENUMs", async () => {
  // 1. Setup: Test configuration
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

  const workspace = Workspace.create(config);

  try {
    // 2. Execute the function
    const effect = createTableFromSchema(workspace);
    await Effect.runPromise(effect);

    // Get connection for verification
    const connection = await Effect.runPromise(workspace.getConnection());

    // 3. Verify the results
    // Verify that ENUMs are created for controlled vocabulary fields
    const enumsResult = await connection.runAndReadAll(
      "SELECT type_name FROM duckdb_types() WHERE type_name LIKE 'occurrence_%_enum'",
    );
    const enumTypes = enumsResult.getRowObjects().map((r) => r.type_name);
    assert(
      enumTypes.includes("occurrence_basisofrecord_enum"),
      "Should create ENUM for basisOfRecord controlled vocabulary",
    );

    // Verify that the occurrence table's basisOfRecord column uses the ENUM type
    const occTableInfo = await connection.runAndReadAll("PRAGMA table_info(occurrence);");
    const basisOfRecordColumn = occTableInfo.getRowObjects().find((c) =>
      c.name === "basisOfRecord"
    );
    assertExists(basisOfRecordColumn, "basisOfRecord column should exist in occurrence table");
    // DuckDB returns the full ENUM definition (e.g., "ENUM('value1', 'value2', ...)")
    // so we just check that it starts with "ENUM("
    const typeStr = String(basisOfRecordColumn.type);
    assert(
      typeStr.startsWith("ENUM("),
      `basisOfRecord should use ENUM type, got: ${typeStr}`,
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
    assert(eventIdCol.pk, "eventID should be the primary key");

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
    assert(occurrenceIdCol.pk, "occurrenceID should be primary key");

    const basisOfRecordCol = occurrenceColumns.find((c) => c.name === "basisOfRecord");
    assertExists(basisOfRecordCol, "basisOfRecord column should exist");
    // DuckDB returns the full ENUM definition, so check that it starts with "ENUM("
    const basisTypeStr = String(basisOfRecordCol.type);
    assert(
      basisTypeStr.startsWith("ENUM("),
      `basisOfRecord should use ENUM type, got: ${basisTypeStr}`,
    );
    // NOT NULL is only applied when profile marks field as required
    // Event/Occurrence base profiles don't mark basisOfRecord as required
    // (only OBIS profiles do, and this test uses base "Occurrence" profile)
    assertEquals(
      basisOfRecordCol.notnull,
      false,
      "basisOfRecord should not be NOT NULL without profile override",
    );

    // Verify Foreign Key constraint from occurrence.eventID to event.eventID
    const hasForeignKey = await verifyForeignKey(
      connection,
      "occurrence",
      "eventID",
      "event",
      "eventID",
    );
    assert(hasForeignKey, "Occurrence should have a foreign key to Event via eventID");
  } finally {
    // 4. Teardown
    workspace.close();
  }
});

Deno.test("createTableFromSchema - handles complex schema with multiple tables and FKs", async () => {
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

  const workspace = Workspace.create(config);

  try {
    await Effect.runPromise(createTableFromSchema(workspace));

    // Get connection for verification
    const connection = await Effect.runPromise(workspace.getConnection());

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

    // Verify Foreign Keys
    // 1. From Occurrence to Event
    const occHasEventFK = await verifyForeignKey(
      connection,
      "occurrence",
      "eventID",
      "event",
      "eventID",
    );
    assert(occHasEventFK, "Occurrence should have a foreign key to Event");

    // 2. From ExtendedMeasurementOrFact to Event
    const mofHasEventFK = await verifyForeignKey(
      connection,
      "extendedmeasurementorfact",
      "eventID",
      "event",
      "eventID",
    );
    assert(mofHasEventFK, "ExtendedMeasurementOrFact should have a foreign key to Event");

    // 3. From ExtendedMeasurementOrFact to Occurrence
    const mofHasOccurrenceFK = await verifyForeignKey(
      connection,
      "extendedmeasurementorfact",
      "occurrenceID",
      "occurrence",
      "occurrenceID",
    );
    assert(
      mofHasOccurrenceFK,
      "ExtendedMeasurementOrFact should have a foreign key to Occurrence",
    );
  } finally {
    workspace.close();
  }
});

Deno.test("createTableFromSchema - comprehensive FK verification", async () => {
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
      ],
      output: {
        outputDir: "",
        exportDB: false,
      },
    },
  };

  const workspace = Workspace.create(config);

  try {
    await Effect.runPromise(createTableFromSchema(workspace));

    // Get connection for verification
    const connection = await Effect.runPromise(workspace.getConnection());

    // Test 1: Verify specific FK exists
    const hasFK = await verifyForeignKey(
      connection,
      "occurrence",
      "eventID",
      "event",
      "eventID",
    );
    assert(hasFK, "Should detect existing FK from occurrence to event");

    // Test 2: Verify non-existent FK returns false
    const hasInvalidFK = await verifyForeignKey(
      connection,
      "occurrence",
      "nonExistentColumn",
      "event",
      "eventID",
    );
    assertFalse(hasInvalidFK, "Should return false for non-existent FK");

    // Test 3: Get all FKs for a table
    const occurrenceFKs = await getForeignKeys(connection, "occurrence");
    assertEquals(occurrenceFKs.length, 1, "Occurrence should have exactly 1 FK");
    assertEquals(occurrenceFKs[0].referenced_table, "event", "FK should reference event table");
    assertEquals(
      occurrenceFKs[0].referenced_column,
      "eventid",
      "FK should reference eventID column (lowercase in constraint)",
    );

    // Test 4: Verify table with no FKs
    const eventFKs = await getForeignKeys(connection, "event");
    assertEquals(eventFKs.length, 0, "Event table should have no foreign keys");

    // Test 5: Verify FK constraint naming follows convention
    const expectedConstraintName = "occurrence_eventid_eventid_fkey";
    assertEquals(
      occurrenceFKs[0].constraint_name,
      expectedConstraintName,
      "FK constraint should follow naming convention",
    );
  } finally {
    workspace.close();
  }
});
