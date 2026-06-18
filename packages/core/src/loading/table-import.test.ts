/**
 * Tests for CSV and Parquet import.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import { importCsv, importParquet } from "./table-import.ts";

Deno.test("importCsv - binds a path containing an apostrophe and applies nullstr", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  // The apostrophe in the directory name would break an interpolated SQL string.
  const dir = await Deno.makeTempDir({ prefix: "dwkt-o'brien-" });
  const csvPath = `${dir}/events.csv`;
  try {
    await Deno.writeTextFile(csvPath, "eventID,locality\nE1,Bamfield\nE2,NA\n");
    await Effect.runPromise(importCsv(connection, "raw_events", csvPath, ["NA"]));
    const result = await connection.runAndReadAll(
      `SELECT eventID, locality, _row_number FROM "raw_events" ORDER BY _row_number`,
    );
    const rows = result.getRowObjects();
    assertEquals(rows.length, 2);
    assertEquals(String(rows[0].eventID), "E1");
    assertEquals(rows[1].locality, null); // "NA" treated as null via nullstr
    assertEquals(Number(rows[0]._row_number), 1);
  } finally {
    connection.closeSync();
    instance.closeSync();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("importParquet - loads a parquet file with a 1-based _row_number", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  const dir = await Deno.makeTempDir();
  const parquetPath = `${dir}/events.parquet`;

  try {
    // Produce a parquet file using DuckDB itself.
    await connection.run(
      `COPY (SELECT * FROM (VALUES ('E1', 48.5), ('E2', 49.0)) AS t(eventID, decimalLatitude))
       TO '${parquetPath}' (FORMAT parquet)`,
    );

    await Effect.runPromise(importParquet(connection, "raw_events", parquetPath));

    const result = await connection.runAndReadAll(
      `SELECT eventID, _row_number FROM "raw_events" ORDER BY _row_number`,
    );
    const rows = result.getRowObjects();

    assertEquals(rows.length, 2);
    assertEquals(String(rows[0].eventID), "E1");
    assertEquals(Number(rows[0]._row_number), 1);
    assertEquals(Number(rows[1]._row_number), 2);
  } finally {
    connection.closeSync();
    instance.closeSync();
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("importCsv - allVarchar loads every column as VARCHAR", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  const csv = await Deno.makeTempFile({ suffix: ".csv" });
  try {
    await Deno.writeTextFile(csv, "id,count\nA,1\nB,2\n");
    await Effect.runPromise(importCsv(connection, "raw_t", csv, [], { allVarchar: true }));
    const types = await connection.runAndReadAll(
      "SELECT column_type FROM (DESCRIBE raw_t) WHERE column_name = 'count'",
    );
    const rows = types.getRowObjects();
    assertEquals(String(rows[0].column_type), "VARCHAR");
  } finally {
    connection.closeSync();
    instance.closeSync();
    await Deno.remove(csv);
  }
});

Deno.test("importCsv - default still auto-detects numeric columns", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  const csv = await Deno.makeTempFile({ suffix: ".csv" });
  try {
    await Deno.writeTextFile(csv, "id,count\nA,1\nB,2\n");
    await Effect.runPromise(importCsv(connection, "raw_t", csv, []));
    const types = await connection.runAndReadAll(
      "SELECT column_type FROM (DESCRIBE raw_t) WHERE column_name = 'count'",
    );
    const rows = types.getRowObjects();
    assertEquals(String(rows[0].column_type), "BIGINT");
  } finally {
    connection.closeSync();
    instance.closeSync();
    await Deno.remove(csv);
  }
});
