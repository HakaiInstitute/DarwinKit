/**
 * Tests for String Matching Utilities
 */

import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertFalse,
  assertGreater,
  assertGreaterOrEqual,
  assertLessOrEqual,
} from "@std/assert";
import {
  findClosestMatches,
  findSuggestions,
  hasCloseMatch,
  levenshteinDistance,
} from "./string-matching.ts";

// Test data: real Darwin Core field names from example config
const DARWIN_CORE_FIELDS = [
  "eventID",
  "eventDate",
  "eventType",
  "parentEventID",
  "decimalLatitude",
  "decimalLongitude",
  "country",
  "countryCode",
  "stateProvince",
  "institutionCode",
  "institutionID",
  "occurrenceID",
  "scientificName",
  "basisOfRecord",
] as const;

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

Deno.test("findClosestMatches - normalization (case + separators) → distance 0", () => {
  const inputs = ["eventID", "eventid", "EVENTID", "EventId", "eVeNtId", "event_id"];
  for (const input of inputs) {
    const matches = findClosestMatches(input, DARWIN_CORE_FIELDS);
    assertGreaterOrEqual(matches.length, 1, input);
    assertEquals(matches[0].value, "eventID", input);
    assertEquals(matches[0].distance, 0, input);
  }
});

Deno.test("findClosestMatches - single character typo", () => {
  // User types "evntID" (missing 'e')
  const matches = findClosestMatches("evntID", DARWIN_CORE_FIELDS);

  assertGreaterOrEqual(matches.length, 1);
  assertEquals(matches[0].value, "eventID");
  assertEquals(matches[0].distance, 1);
});

Deno.test("findClosestMatches - multiple close matches", () => {
  // "event" matches multiple fields (with higher maxDistance)
  const matches = findClosestMatches("event", DARWIN_CORE_FIELDS, {
    maxDistance: 4,
    maxSuggestions: 3,
  });

  // Should find eventID first (distance 2), then others
  assertGreaterOrEqual(matches.length, 1);
  assertEquals(matches[0].value, "eventID");

  // Additional event* fields should be in the results
  const values = matches.map((m) => m.value);
  const hasEventFields = values.some((v) => v.startsWith("event"));
  assert(hasEventFields);
});

Deno.test("findClosestMatches - respects maxDistance", () => {
  // "lat" is far from most fields
  const matchesDefault = findClosestMatches("lat", DARWIN_CORE_FIELDS);
  const matchesStrict = findClosestMatches("lat", DARWIN_CORE_FIELDS, {
    maxDistance: 1,
  });

  // With default distance (2), might find some matches
  // With strict distance (1), should find fewer or none
  assertLessOrEqual(matchesStrict.length, matchesDefault.length);
});

Deno.test("findClosestMatches - respects maxSuggestions", () => {
  const matches1 = findClosestMatches("event", DARWIN_CORE_FIELDS, {
    maxSuggestions: 1,
  });
  const matches5 = findClosestMatches("event", DARWIN_CORE_FIELDS, {
    maxSuggestions: 5,
  });

  assertEquals(matches1.length, 1);
  assertLessOrEqual(matches5.length, 5);
  assertGreaterOrEqual(matches5.length, matches1.length);
});

Deno.test("findClosestMatches - sorting by distance", () => {
  const matches = findClosestMatches("eventd", DARWIN_CORE_FIELDS);

  // Should be sorted by distance (closest first)
  for (let i = 1; i < matches.length; i++) {
    assertLessOrEqual(
      matches[i - 1].distance,
      matches[i].distance,
      "Matches should be sorted by distance",
    );
  }
});

Deno.test("findClosestMatches - sorting by length for same distance", () => {
  // Create test data where multiple fields have same distance
  const testFields = ["abc", "abcdef", "ab"];
  const matches = findClosestMatches("a", testFields, { maxDistance: 2 });

  // For same distance, shorter strings should come first
  assertGreaterOrEqual(matches.length, 2);
  assertEquals(matches[0].value, "ab"); // distance 1, shortest
  assertEquals(matches[1].value, "abc"); // distance 2, shorter
  // abcdef has distance 5, which is > maxDistance of 2, so it won't be included
});

Deno.test("findClosestMatches - no matches beyond threshold", () => {
  const matches = findClosestMatches("xyz", DARWIN_CORE_FIELDS, {
    maxDistance: 1,
  });

  // "xyz" is very different from Darwin Core fields
  // With maxDistance=1, should find no matches
  assertEquals(matches.length, 0);
});

Deno.test("findClosestMatches - empty input", () => {
  const matches = findClosestMatches("", DARWIN_CORE_FIELDS);

  // Empty string has large distance from all fields
  // Should return no matches with default maxDistance
  assertEquals(matches.length, 0);
});

Deno.test("findClosestMatches - empty options", () => {
  const matches = findClosestMatches("eventID", []);

  assertEquals(matches.length, 0);
});

Deno.test("findClosestMatches - case-sensitive mode", () => {
  const matchesCaseInsensitive = findClosestMatches("eventid", DARWIN_CORE_FIELDS, {
    caseInsensitive: true,
  });

  const matchesCaseSensitive = findClosestMatches("eventid", DARWIN_CORE_FIELDS, {
    caseInsensitive: false,
  });

  // Case-insensitive should find exact match
  assertEquals(matchesCaseInsensitive[0]?.distance, 0);

  // Case-sensitive should have distance based on case differences
  if (matchesCaseSensitive.length > 0) {
    assertGreater(matchesCaseSensitive[0].distance, 0);
  }
});

Deno.test("findClosestMatches - separator normalization disabled", () => {
  const matchesNormalized = findClosestMatches("event_id", DARWIN_CORE_FIELDS, {
    normalizeSeparators: true,
  });

  const matchesNotNormalized = findClosestMatches("event_id", DARWIN_CORE_FIELDS, {
    normalizeSeparators: false,
  });

  // With normalization, should match exactly
  assertEquals(matchesNormalized[0]?.distance, 0);

  // Without normalization, distance should be higher
  if (matchesNotNormalized.length > 0) {
    assertGreater(matchesNotNormalized[0].distance, 0);
  }
});

Deno.test("findSuggestions - returns just string values", () => {
  const suggestions = findSuggestions("eventid", DARWIN_CORE_FIELDS);

  // Should return array of strings
  assert(Array.isArray(suggestions));
  assertEquals(typeof suggestions[0], "string");

  // Should match eventID
  assertEquals(suggestions[0], "eventID");
});

Deno.test("hasCloseMatch - returns true for close matches", () => {
  assert(hasCloseMatch("eventID", DARWIN_CORE_FIELDS));
  assert(hasCloseMatch("eventid", DARWIN_CORE_FIELDS));
  assert(hasCloseMatch("evntID", DARWIN_CORE_FIELDS));
  assert(hasCloseMatch("event_id", DARWIN_CORE_FIELDS));
});

Deno.test("hasCloseMatch - returns false for no matches", () => {
  assertFalse(hasCloseMatch("xyz", DARWIN_CORE_FIELDS));
  assertFalse(hasCloseMatch("completely_different", DARWIN_CORE_FIELDS));
});

Deno.test("hasCloseMatch - respects maxDistance", () => {
  // "evt" is 3 edits away from "eventID" (after normalization: "evt" -> "eventid")
  const hasMatchDefault = hasCloseMatch("evt", DARWIN_CORE_FIELDS);

  assertFalse(hasMatchDefault);

  const hasMatchStrict = hasCloseMatch("evt", DARWIN_CORE_FIELDS, {
    maxDistance: 1,
  });

  // Default (maxDistance: 2) might not find it either, but strict definitely won't
  assertFalse(hasMatchStrict);
});

Deno.test("Real-world scenario: common typos", () => {
  const typos = [
    { input: "eventid", expected: "eventID", maxDistance: 2 },
    { input: "event_id", expected: "eventID", maxDistance: 2 },
    { input: "EventID", expected: "eventID", maxDistance: 2 },
    { input: "evntID", expected: "eventID", maxDistance: 2 },
    { input: "eventDate", expected: "eventDate", maxDistance: 2 },
    { input: "event_date", expected: "eventDate", maxDistance: 2 },
    { input: "country_code", expected: "countryCode", maxDistance: 2 },
    { input: "scientficName", expected: "scientificName", maxDistance: 2 }, // Missing 'i'
  ];

  for (const { input, expected, maxDistance } of typos) {
    const suggestions = findSuggestions(input, DARWIN_CORE_FIELDS, {
      maxDistance,
    });

    assertArrayIncludes(
      suggestions,
      [expected],
      `Expected '${expected}' in suggestions for '${input}', got: ${suggestions.join(", ")}`,
    );

    // Expected should be the first suggestion (closest match)
    assertEquals(
      suggestions[0],
      expected,
      `Expected '${expected}' to be first suggestion for '${input}', got: ${suggestions[0]}`,
    );
  }
});

Deno.test("Real-world scenario: prefix matching", () => {
  // User types partial field names - need higher maxDistance for prefixes
  // Note: Levenshtein distance counts insertions, so "decimal" -> "decimalLatitude" = 8 inserts
  const partials = [
    { input: "event", expectedContains: ["eventID"], maxDistance: 4 },
    { input: "decimal", expectedContains: ["decimalLatitude"], maxDistance: 10 },
    { input: "institution", expectedContains: ["institutionCode"], maxDistance: 10 },
  ];

  for (const { input, expectedContains, maxDistance } of partials) {
    const suggestions = findSuggestions(input, DARWIN_CORE_FIELDS, {
      maxDistance,
      maxSuggestions: 5,
    });

    for (const expected of expectedContains) {
      assertArrayIncludes(
        suggestions,
        [expected],
        `Expected '${expected}' in suggestions for prefix '${input}', got: ${
          suggestions.join(", ")
        }`,
      );
    }
  }
});

Deno.test("Real-world scenario: no false positives", () => {
  // Completely unrelated field names should not match
  const unrelated = ["foobar", "test123", "randomField", "notAField"];

  for (const input of unrelated) {
    const suggestions = findSuggestions(input, DARWIN_CORE_FIELDS);

    // Should either find no matches, or only very weak matches
    assertLessOrEqual(
      suggestions.length,
      1,
      `Should not find many matches for unrelated field '${input}'`,
    );
  }
});

Deno.test("Edge case: single character field names", () => {
  const fields = ["a", "b", "c"];
  const matches = findClosestMatches("a", fields);

  // With maxDistance=2, all three single chars are within range
  // 'a' matches 'a' exactly (distance 0)
  // 'a' matches 'b' and 'c' with distance 1
  assertGreaterOrEqual(matches.length, 1);
  assertEquals(matches[0].value, "a");
  assertEquals(matches[0].distance, 0);
});

Deno.test("Edge case: very long field names", () => {
  const fields = ["a".repeat(100), "b".repeat(100)];
  const matches = findClosestMatches("a".repeat(99), fields);

  assertGreaterOrEqual(matches.length, 1);
  assertEquals(matches[0].value, "a".repeat(100));
  assertEquals(matches[0].distance, 1);
});

Deno.test("Edge case: special characters in field names", () => {
  const fields = ["field-name", "field_name", "field.name", "fieldName"];
  const matches = findClosestMatches("field-name", fields);

  // With normalization, all of these become "fieldname" so they all match
  assertGreaterOrEqual(matches.length, 1);
  assertEquals(matches[0].distance, 0);

  // The first match should be "field-name" (exact match) or one of the normalized equivalents
  const firstMatch = matches[0].value;
  assertArrayIncludes(
    ["field-name", "field_name", "fieldName"],
    [firstMatch],
  );
});

Deno.test("Edge case: unicode characters", () => {
  const fields = ["événement", "événementID", "country"];
  const matches = findClosestMatches("evenement", fields);

  // Should match événement (with accent) reasonably well
  assertGreaterOrEqual(matches.length, 1);
});
