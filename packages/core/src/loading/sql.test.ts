/**
 * Tests for SQL utilities
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import { formatNullValues, queryRows, sanitizeTableName } from "./sql.ts";

Deno.test("sanitizeTableName - replaces special chars, preserves valid ones", () => {
  const cases: Array<[string, string]> = [
    ["my-dataset", "my_dataset"],
    ["data.csv", "data_csv"],
    ["events 2024", "events_2024"],
    ["table@name!", "table_name_"],
    ["valid_name", "valid_name"],
    ["Table123", "Table123"],
    ["_underscore", "_underscore"],
  ];
  for (const [input, expected] of cases) {
    assertEquals(sanitizeTableName(input), expected, input);
  }
});

Deno.test("formatNullValues - formats and escapes for DuckDB nullstr", () => {
  const cases: Array<[string[], string]> = [
    [["NA", "N/A", ""], "'NA', 'N/A', ''"],
    [["NULL"], "'NULL'"],
    [[], ""],
    [["it's null"], "'it''s null'"],
  ];
  for (const [input, expected] of cases) {
    assertEquals(formatNullValues(input), expected, JSON.stringify(input));
  }
});

Deno.test("queryRows - binds positional parameters (handles embedded quotes)", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  try {
    await connection.run(
      "CREATE TABLE t AS SELECT * FROM (VALUES ('O''Brien'), ('Smith')) AS v(name)",
    );
    const rows = await Effect.runPromise(
      queryRows(connection, "SELECT name FROM t WHERE name = ?", ["O'Brien"]),
    );
    assertEquals(rows.length, 1);
    assertEquals(rows[0].name, "O'Brien");
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});
