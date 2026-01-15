/**
 * Integration tests for validation/database/schema-builder.ts
 */

import { assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import { withTestConnection } from "../test-utils.ts";
import { importSchemaToWorkspace } from "./schema-builder.ts";

// ============================================================================
// Schema Builder Tests
// ============================================================================

Deno.test("importSchemaToWorkspace - basic table creation", async () => {
  await withTestConnection(async (connection) => {
    const dataset = {
      name: "test_dataset",
      spec: "dwc-event",
    };

    await Effect.runPromise(
      importSchemaToWorkspace(connection, dataset, [dataset]),
    );

    // Verify table was created by querying information schema
    const result = await connection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'event'",
    );

    const tables = result.getRowObjects();
    assertEquals(tables.length, 1);
    assertEquals(tables[0].table_name, "event");
  });
});

Deno.test("importSchemaToWorkspace - creates _row_number column", async () => {
  await withTestConnection(async (connection) => {
    const dataset = {
      name: "test_dataset",
      spec: "dwc-event",
    };

    await Effect.runPromise(
      importSchemaToWorkspace(connection, dataset, [dataset]),
    );

    // Verify _row_number column exists
    const result = await connection.runAndReadAll(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'event' AND column_name = '_row_number'",
    );

    const columns = result.getRowObjects();
    assertEquals(columns.length, 1);
    assertEquals(columns[0].column_name, "_row_number");
    assertEquals(columns[0].data_type, "INTEGER");
  });
});

Deno.test("importSchemaToWorkspace - handles dataset with no profile", async () => {
  await withTestConnection(async (connection) => {
    const dataset = {
      name: "test_dataset",
      // No spec or profile
    };

    // Should succeed but not create table (logs warning)
    await Effect.runPromise(
      importSchemaToWorkspace(connection, dataset, [dataset]),
    );

    // Verify no table was created
    const result = await connection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'test_dataset'",
    );

    assertEquals(result.getRowObjects().length, 0);
  });
});

Deno.test("importSchemaToWorkspace - drops and recreates existing table", async () => {
  await withTestConnection(async (connection) => {
    const dataset = {
      name: "test_dataset",
      spec: "dwc-event",
    };

    // Create table first time
    await Effect.runPromise(
      importSchemaToWorkspace(connection, dataset, [dataset]),
    );

    // Create table second time (should drop and recreate)
    await Effect.runPromise(
      importSchemaToWorkspace(connection, dataset, [dataset]),
    );

    // Verify table still exists
    const result = await connection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'event'",
    );

    assertEquals(result.getRowObjects().length, 1);
  });
});

Deno.test("importSchemaToWorkspace - sanitizes table names", async () => {
  await withTestConnection(async (connection) => {
    const dataset = {
      name: "Test Dataset (2024)",
      spec: "dwc-event",
    };

    await Effect.runPromise(
      importSchemaToWorkspace(connection, dataset, [dataset]),
    );

    // Table name should be sanitized (event is the profile name, not dataset name)
    const result = await connection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'",
    );

    const tableNames = result.getRowObjects().map((r) => r.table_name);
    // Should have 'event' table from the dwc-event profile
    assertExists(tableNames.find((name: unknown) => name === "event"));
  });
});

Deno.test("importSchemaToWorkspace - creates standard profile columns", async () => {
  await withTestConnection(async (connection) => {
    const dataset = {
      name: "events",
      spec: "dwc-event",
    };

    await Effect.runPromise(
      importSchemaToWorkspace(connection, dataset, [dataset]),
    );

    // Check that common Event fields are present
    const result = await connection.runAndReadAll(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'event' ORDER BY column_name",
    );

    const columnNames = result.getRowObjects().map((r) => r.column_name);

    // Event profile should have these standard Darwin Core fields
    assertExists(columnNames.find((name: unknown) => name === "eventID"));
    assertExists(columnNames.find((name: unknown) => name === "_row_number"));
  });
});

Deno.test("importSchemaToWorkspace - handles multiple datasets", async () => {
  await withTestConnection(async (connection) => {
    const datasets = [
      { name: "events", spec: "dwc-event" },
      { name: "occurrences", spec: "dwc-occurrence" },
    ];

    // Create schemas for both datasets
    for (const dataset of datasets) {
      await Effect.runPromise(
        importSchemaToWorkspace(connection, dataset, datasets),
      );
    }

    // Verify both tables were created
    const result = await connection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_name IN ('event', 'occurrence') ORDER BY table_name",
    );

    const tableNames = result.getRowObjects().map((r) => r.table_name);
    assertEquals(tableNames.length, 2);
    assertExists(tableNames.find((name: unknown) => name === "event"));
    assertExists(tableNames.find((name: unknown) => name === "occurrence"));
  });
});

// Note: Testing ENUM creation, PRIMARY KEY, NOT NULL, and FOREIGN KEY constraints
// requires creating custom validation profiles with specific field configurations.
// These tests would be more complex and are deferred to integration tests that
// use real Darwin Core profiles from the domain package.

Deno.test("importSchemaToWorkspace - creates table for Occurrence profile", async () => {
  await withTestConnection(async (connection) => {
    const dataset = {
      name: "occurrences",
      spec: "dwc-occurrence",
    };

    await Effect.runPromise(
      importSchemaToWorkspace(connection, dataset, [dataset]),
    );

    // Verify occurrence table was created
    const result = await connection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'occurrence'",
    );

    assertEquals(result.getRowObjects().length, 1);

    // Check for common Occurrence fields
    const columns = await connection.runAndReadAll(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'occurrence'",
    );

    const columnNames = columns.getRowObjects().map((r) => r.column_name);
    assertExists(columnNames.find((name: unknown) => name === "occurrenceID"));
    assertExists(columnNames.find((name: unknown) => name === "_row_number"));
  });
});

Deno.test("importSchemaToWorkspace - creates table for Taxon profile", async () => {
  await withTestConnection(async (connection) => {
    const dataset = {
      name: "taxa",
      spec: "dwc-taxon",
    };

    await Effect.runPromise(
      importSchemaToWorkspace(connection, dataset, [dataset]),
    );

    // Verify taxon table was created
    const result = await connection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'taxon'",
    );

    assertEquals(result.getRowObjects().length, 1);

    // Check for common Taxon fields
    const columns = await connection.runAndReadAll(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'taxon'",
    );

    const columnNames = columns.getRowObjects().map((r) => r.column_name);
    assertExists(columnNames.find((name: unknown) => name === "taxonID"));
    assertExists(columnNames.find((name: unknown) => name === "_row_number"));
  });
});
