/**
 * Tests for String Matching Utilities
 */

import { assertEquals, assertGreaterOrEqual } from "@std/assert";
import { findSuggestedValue, levenshteinDistance } from "./string-matching.ts";

const ld = levenshteinDistance;

Deno.test("levenshteinDistance - computes edit distance correctly", () => {
  const cases: Array<[string, string, number]> = [
    // exact matches
    ["", "", 0],
    ["a", "a", 0],
    ["hello", "hello", 0],
    ["eventID", "eventID", 0],
    // empty strings
    ["", "hello", 5],
    ["hello", "", 5],
    // single operations (insert, delete, substitute, transposition)
    ["cat", "cats", 1],
    ["cats", "cat", 1],
    ["cat", "bat", 1],
    ["eventID", "evnetID", 2],
    // multiple operations
    ["kitten", "sitting", 3],
    ["saturday", "sunday", 3],
    ["eventID", "evntID", 1],
    ["latitude", "decimalLatitude", 7],
    // case sensitivity
    ["Event", "event", 1],
    ["EVENTID", "eventid", 7],
    ["EventID", "eventID", 1],
  ];
  for (const [a, b, expected] of cases) {
    assertEquals(ld(a, b), expected, `ld("${a}", "${b}")`);
  }
});

Deno.test("findSuggestedValue - finds closest value within threshold", () => {
  const allowed = ["eventID", "eventDate", "country", "scientificName"];

  assertEquals(findSuggestedValue("evntID", allowed), "eventID");
  assertEquals(findSuggestedValue("eventid", allowed), "eventID");
  assertEquals(findSuggestedValue("cuntry", allowed), "country");
  assertEquals(findSuggestedValue("scientficName", allowed), "scientificName");
});

Deno.test("findSuggestedValue - returns undefined for distant values", () => {
  const allowed = ["eventID", "eventDate", "country"];

  assertEquals(findSuggestedValue("completelyDifferent", allowed), undefined);
  assertEquals(findSuggestedValue("xyz", allowed), undefined);
});

Deno.test("findSuggestedValue - respects custom threshold", () => {
  const allowed = ["eventID"];

  // Distance of 1, threshold of 2 → match
  assertEquals(findSuggestedValue("evntID", allowed, 2), "eventID");
  // Distance of 1, threshold of 1 → no match (must be strictly less)
  assertEquals(findSuggestedValue("evntID", allowed, 1), undefined);
});

Deno.test("findSuggestedValue - empty allowed values returns undefined", () => {
  assertEquals(findSuggestedValue("anything", []), undefined);
});

Deno.test("levenshteinDistance - symmetry", () => {
  const pairs: Array<[string, string]> = [
    ["kitten", "sitting"],
    ["eventID", "evntID"],
    ["", "hello"],
  ];
  for (const [a, b] of pairs) {
    assertEquals(ld(a, b), ld(b, a), `ld("${a}", "${b}") should equal ld("${b}", "${a}")`);
  }
});

Deno.test("levenshteinDistance - triangle inequality", () => {
  const triples: Array<[string, string, string]> = [
    ["cat", "bat", "hat"],
    ["eventID", "evntID", "eventDate"],
  ];
  for (const [a, b, c] of triples) {
    assertGreaterOrEqual(
      ld(a, c),
      0,
      "distances are non-negative",
    );
    // d(a,c) <= d(a,b) + d(b,c)
    const direct = ld(a, c);
    const via = ld(a, b) + ld(b, c);
    assertEquals(
      direct <= via,
      true,
      `triangle inequality: d("${a}","${c}") <= d("${a}","${b}") + d("${b}","${c}")`,
    );
  }
});
