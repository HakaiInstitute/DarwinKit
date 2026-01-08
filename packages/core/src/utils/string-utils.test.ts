/**
 * Tests for String Matching Utilities
 */

import { assertEquals } from "@std/assert";
import { levenshteinDistance } from "./string-utils.ts";

const ld = levenshteinDistance;

Deno.test("levenshteinDistance - exact matches", () => {
  assertEquals(ld("", ""), 0);
  assertEquals(ld("a", "a"), 0);
  assertEquals(ld("hello", "hello"), 0);
  assertEquals(ld("eventID", "eventID"), 0);
});

Deno.test("levenshteinDistance - empty strings", () => {
  assertEquals(ld("", "hello"), 5);
  assertEquals(ld("hello", ""), 5);
  assertEquals(ld("", ""), 0);
});

Deno.test("levenshteinDistance - single character operations", () => {
  // Insertion
  assertEquals(ld("cat", "cats"), 1);
  assertEquals(ld("event", "events"), 1);

  // Deletion
  assertEquals(ld("cats", "cat"), 1);
  assertEquals(ld("events", "event"), 1);

  // Substitution
  assertEquals(ld("cat", "bat"), 1);

  // Transposition (counted as 2 operations in Levenshtein)
  assertEquals(ld("eventID", "evnetID"), 2);
});

Deno.test("levenshteinDistance - multiple operations", () => {
  assertEquals(ld("kitten", "sitting"), 3);
  assertEquals(ld("saturday", "sunday"), 3);
  assertEquals(ld("eventID", "evntID"), 1); // Missing 'e'
  assertEquals(ld("latitude", "decimalLatitude"), 7); // "decimal" prefix
});

Deno.test("levenshteinDistance - case sensitivity", () => {
  // Function is case-sensitive by default
  assertEquals(ld("Event", "event"), 1);
  assertEquals(ld("EVENTID", "eventid"), 7);
  assertEquals(ld("EventID", "eventID"), 1);
});
