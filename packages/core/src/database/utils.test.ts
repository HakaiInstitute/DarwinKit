/**
 * Tests for database utilities
 */

import { assertEquals } from "@std/assert";
import { escapeString, formatNullValues, sanitizeTableName } from "./utils.ts";

Deno.test("sanitizeTableName - replaces special characters with underscores", () => {
  assertEquals(sanitizeTableName("my-dataset"), "my_dataset");
  assertEquals(sanitizeTableName("data.csv"), "data_csv");
  assertEquals(sanitizeTableName("events 2024"), "events_2024");
  assertEquals(sanitizeTableName("table@name!"), "table_name_");
});

Deno.test("sanitizeTableName - preserves valid characters", () => {
  assertEquals(sanitizeTableName("valid_name"), "valid_name");
  assertEquals(sanitizeTableName("Table123"), "Table123");
  assertEquals(sanitizeTableName("_underscore"), "_underscore");
});

Deno.test("escapeString - escapes single quotes", () => {
  assertEquals(escapeString("it's fine"), "it''s fine");
  assertEquals(escapeString("don't won't"), "don''t won''t");
  assertEquals(escapeString("normal"), "normal");
  assertEquals(escapeString(""), "");
});

Deno.test("formatNullValues - formats array for DuckDB nullstr", () => {
  assertEquals(formatNullValues(["NA", "N/A", ""]), "'NA', 'N/A', ''");
  assertEquals(formatNullValues(["NULL"]), "'NULL'");
  assertEquals(formatNullValues([]), "");
});

Deno.test("formatNullValues - escapes quotes in values", () => {
  assertEquals(formatNullValues(["it's null"]), "'it''s null'");
});
