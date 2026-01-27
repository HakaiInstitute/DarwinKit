/**
 * Tests for SchemaRepo
 */

import { assertEquals, assertExists } from "@std/assert";
import { DuckDBInstance } from "@duckdb/node-api";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { SchemaRepo } from "./schema-repo.ts";
import { DbConnection } from "./connection.ts";

/**
 * Integration tests using real DuckDB connection
 */
Deno.test("SchemaRepo.layer - createTable creates table with columns", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  try {
    const connectionLayer = Layer.succeed(DbConnection, connection);
    const repoLayer = SchemaRepo.layer.pipe(Layer.provide(connectionLayer));

    const program = Effect.gen(function* () {
      const repo = yield* SchemaRepo;

      // Create table
      yield* repo.createTable("test_table", [
        { name: "id", type: "INTEGER", primaryKey: true },
        { name: "name", type: "TEXT", nullable: false },
        { name: "description", type: "TEXT", nullable: true },
      ]);

      // Verify table exists
      const exists = yield* repo.tableExists("test_table");
      assertEquals(exists, true);

      // Get schema and verify columns
      const schema = yield* repo.getTableSchema("test_table");
      assertEquals(schema.tableName, "test_table");
      assertEquals(schema.columns.length, 3);

      const idCol = schema.columns.find((c) => c.name === "id");
      assertExists(idCol);
      assertEquals(idCol.type.toUpperCase(), "INTEGER");

      const nameCol = schema.columns.find((c) => c.name === "name");
      assertExists(nameCol);
      assertEquals(nameCol.nullable, false);

      const descCol = schema.columns.find((c) => c.name === "description");
      assertExists(descCol);
      assertEquals(descCol.nullable, true);
    });

    await Effect.runPromise(program.pipe(Effect.provide(repoLayer)));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});

Deno.test("SchemaRepo.layer - createEnum creates enum type", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  try {
    const connectionLayer = Layer.succeed(DbConnection, connection);
    const repoLayer = SchemaRepo.layer.pipe(Layer.provide(connectionLayer));

    const program = Effect.gen(function* () {
      const repo = yield* SchemaRepo;

      // Create enum
      yield* repo.createEnum("status_type", ["pending", "active", "completed"]);

      // Create table using the enum
      yield* repo.createTable("tasks", [
        { name: "id", type: "INTEGER", primaryKey: true },
        { name: "status", type: "status_type" },
      ]);

      // Verify table exists (enum creation succeeded if table creation works)
      const exists = yield* repo.tableExists("tasks");
      assertEquals(exists, true);
    });

    await Effect.runPromise(program.pipe(Effect.provide(repoLayer)));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});

Deno.test("SchemaRepo.layer - dropTable removes table", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  try {
    const connectionLayer = Layer.succeed(DbConnection, connection);
    const repoLayer = SchemaRepo.layer.pipe(Layer.provide(connectionLayer));

    const program = Effect.gen(function* () {
      const repo = yield* SchemaRepo;

      // Create table
      yield* repo.createTable("to_drop", [
        { name: "id", type: "INTEGER" },
      ]);

      // Verify exists
      const existsBefore = yield* repo.tableExists("to_drop");
      assertEquals(existsBefore, true);

      // Drop
      yield* repo.dropTable("to_drop");

      // Verify gone
      const existsAfter = yield* repo.tableExists("to_drop");
      assertEquals(existsAfter, false);
    });

    await Effect.runPromise(program.pipe(Effect.provide(repoLayer)));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});

Deno.test("SchemaRepo.layer - getTableSchema fails for non-existent table", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  try {
    const connectionLayer = Layer.succeed(DbConnection, connection);
    const repoLayer = SchemaRepo.layer.pipe(Layer.provide(connectionLayer));

    const program = Effect.gen(function* () {
      const repo = yield* SchemaRepo;
      yield* repo.getTableSchema("nonexistent");
    });

    const result = await Effect.runPromiseExit(program.pipe(Effect.provide(repoLayer)));
    assertEquals(result._tag, "Failure");
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});

Deno.test("SchemaRepo.layer - tableExists returns false for non-existent table", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  try {
    const connectionLayer = Layer.succeed(DbConnection, connection);
    const repoLayer = SchemaRepo.layer.pipe(Layer.provide(connectionLayer));

    const program = Effect.gen(function* () {
      const repo = yield* SchemaRepo;
      const exists = yield* repo.tableExists("nonexistent");
      assertEquals(exists, false);
    });

    await Effect.runPromise(program.pipe(Effect.provide(repoLayer)));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});

Deno.test("SchemaRepo.layer - createTable with foreign key reference", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  try {
    const connectionLayer = Layer.succeed(DbConnection, connection);
    const repoLayer = SchemaRepo.layer.pipe(Layer.provide(connectionLayer));

    const program = Effect.gen(function* () {
      const repo = yield* SchemaRepo;

      // Create parent table
      yield* repo.createTable("events", [
        { name: "eventID", type: "TEXT", primaryKey: true },
        { name: "eventDate", type: "DATE" },
      ]);

      // Create child table with foreign key
      yield* repo.createTable("occurrences", [
        { name: "occurrenceID", type: "TEXT", primaryKey: true },
        {
          name: "eventID",
          type: "TEXT",
          references: { table: "events", column: "eventID" },
        },
      ]);

      // Verify both tables exist
      const eventsExists = yield* repo.tableExists("events");
      const occurrencesExists = yield* repo.tableExists("occurrences");
      assertEquals(eventsExists, true);
      assertEquals(occurrencesExists, true);
    });

    await Effect.runPromise(program.pipe(Effect.provide(repoLayer)));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});
