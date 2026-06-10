/**
 * Tests for Parquet import.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import { importParquet } from "./table-import.ts";

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
