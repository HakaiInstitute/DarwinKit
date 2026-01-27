/**
 * Tests for DatasetRepo
 */

import { assertEquals, assertExists } from "@std/assert";
import { DuckDBInstance } from "@duckdb/node-api";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { dirname, fromFileUrl, join } from "@std/path";

import { DatasetRepo } from "./dataset-repo.ts";
import { DbConnection } from "./connection.ts";

// Get test data path
const testDir = dirname(fromFileUrl(import.meta.url));
const testDataDir = join(testDir, "../../../../test/data");

/**
 * Integration tests using real DuckDB connection
 */
Deno.test("DatasetRepo.layer - import creates table with _row_number", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  try {
    const connectionLayer = Layer.succeed(DbConnection, connection);
    const repoLayer = DatasetRepo.layer.pipe(Layer.provide(connectionLayer));

    const program = Effect.gen(function* () {
      const repo = yield* DatasetRepo;

      // Import test CSV
      const csvPath = join(testDataDir, "FC2022_event.csv");
      yield* repo.import("test_events", csvPath, ["NA", "N/A", ""]);

      // Verify table exists
      const exists = yield* repo.exists("test_events");
      assertEquals(exists, true);

      // Verify row count
      const count = yield* repo.rowCount("test_events");
      assertExists(count);
      assertEquals(count > 0, true);

      // Verify _row_number column exists
      const cols = yield* repo.columns("test_events");
      assertEquals(cols.includes("_row_number"), true);
    });

    await Effect.runPromise(program.pipe(Effect.provide(repoLayer)));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});

Deno.test("DatasetRepo.layer - drop removes table", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  try {
    const connectionLayer = Layer.succeed(DbConnection, connection);
    const repoLayer = DatasetRepo.layer.pipe(Layer.provide(connectionLayer));

    const program = Effect.gen(function* () {
      const repo = yield* DatasetRepo;

      // Import test CSV
      const csvPath = join(testDataDir, "FC2022_event.csv");
      yield* repo.import("drop_test", csvPath, []);

      // Verify exists
      const existsBefore = yield* repo.exists("drop_test");
      assertEquals(existsBefore, true);

      // Drop
      yield* repo.drop("drop_test");

      // Verify gone
      const existsAfter = yield* repo.exists("drop_test");
      assertEquals(existsAfter, false);
    });

    await Effect.runPromise(program.pipe(Effect.provide(repoLayer)));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});

Deno.test("DatasetRepo.layer - rowCount fails for non-existent table", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  try {
    const connectionLayer = Layer.succeed(DbConnection, connection);
    const repoLayer = DatasetRepo.layer.pipe(Layer.provide(connectionLayer));

    const program = Effect.gen(function* () {
      const repo = yield* DatasetRepo;
      yield* repo.rowCount("nonexistent_table");
    });

    const result = await Effect.runPromiseExit(program.pipe(Effect.provide(repoLayer)));

    assertEquals(result._tag, "Failure");
    if (result._tag === "Failure") {
      const error = result.cause;
      // Check that it's a TableNotFoundError
      assertExists(error);
    }
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});

Deno.test("DatasetRepo.layer - exists returns false for non-existent table", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  try {
    const connectionLayer = Layer.succeed(DbConnection, connection);
    const repoLayer = DatasetRepo.layer.pipe(Layer.provide(connectionLayer));

    const program = Effect.gen(function* () {
      const repo = yield* DatasetRepo;
      const exists = yield* repo.exists("nonexistent_table");
      assertEquals(exists, false);
    });

    await Effect.runPromise(program.pipe(Effect.provide(repoLayer)));
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});
