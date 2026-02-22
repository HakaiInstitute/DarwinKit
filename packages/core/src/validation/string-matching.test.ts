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

Deno.test("findClosestMatches - options and sorting", async (t) => {
  await t.step("respects maxDistance", () => {
    const matchesDefault = findClosestMatches("lat", DARWIN_CORE_FIELDS);
    const matchesStrict = findClosestMatches("lat", DARWIN_CORE_FIELDS, { maxDistance: 1 });
    assertLessOrEqual(matchesStrict.length, matchesDefault.length);
  });

  await t.step("respects maxSuggestions", () => {
    const matches1 = findClosestMatches("event", DARWIN_CORE_FIELDS, { maxSuggestions: 1 });
    assertEquals(matches1.length, 1);
  });

  await t.step("sorted by distance then length", () => {
    const matches = findClosestMatches("eventd", DARWIN_CORE_FIELDS);
    for (let i = 1; i < matches.length; i++) {
      assertLessOrEqual(matches[i - 1].distance, matches[i].distance);
    }

    const byLength = findClosestMatches("a", ["abc", "abcdef", "ab"], { maxDistance: 2 });
    assertGreaterOrEqual(byLength.length, 2);
    assertEquals(byLength[0].value, "ab");
    assertEquals(byLength[1].value, "abc");
  });

  await t.step("no matches for empty input, empty options, or beyond threshold", () => {
    assertEquals(findClosestMatches("xyz", DARWIN_CORE_FIELDS, { maxDistance: 1 }).length, 0);
    assertEquals(findClosestMatches("", DARWIN_CORE_FIELDS).length, 0);
    assertEquals(findClosestMatches("eventID", []).length, 0);
  });

  await t.step("case sensitivity and separator normalization toggles", () => {
    assertEquals(
      findClosestMatches("eventid", DARWIN_CORE_FIELDS, { caseInsensitive: true })[0]?.distance,
      0,
    );
    assertGreater(
      findClosestMatches("eventid", DARWIN_CORE_FIELDS, { caseInsensitive: false })[0]?.distance,
      0,
    );
    assertEquals(
      findClosestMatches("event_id", DARWIN_CORE_FIELDS, { normalizeSeparators: true })[0]
        ?.distance,
      0,
    );
    assertGreater(
      findClosestMatches("event_id", DARWIN_CORE_FIELDS, { normalizeSeparators: false })[0]
        ?.distance,
      0,
    );
  });
});

Deno.test("findSuggestions - returns just string values", () => {
  const suggestions = findSuggestions("eventid", DARWIN_CORE_FIELDS);

  // Should return array of strings
  assert(Array.isArray(suggestions));
  assertEquals(typeof suggestions[0], "string");

  // Should match eventID
  assertEquals(suggestions[0], "eventID");
});

Deno.test("hasCloseMatch", async (t) => {
  await t.step("returns true for close matches", () => {
    for (const input of ["eventID", "eventid", "evntID", "event_id"]) {
      assert(hasCloseMatch(input, DARWIN_CORE_FIELDS), input);
    }
  });

  await t.step("returns false for distant or unknown inputs", () => {
    for (const input of ["xyz", "completely_different", "evt"]) {
      assertFalse(hasCloseMatch(input, DARWIN_CORE_FIELDS), input);
    }
  });
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

Deno.test("Real-world scenario: no false positives for unrelated inputs", () => {
  for (const input of ["foobar", "test123", "randomField", "notAField"]) {
    const suggestions = findSuggestions(input, DARWIN_CORE_FIELDS);
    assertLessOrEqual(suggestions.length, 1, `unexpected matches for '${input}'`);
  }
});

Deno.test("Edge cases", async (t) => {
  await t.step("single character field names", () => {
    const matches = findClosestMatches("a", ["a", "b", "c"]);
    assertGreaterOrEqual(matches.length, 1);
    assertEquals(matches[0].value, "a");
    assertEquals(matches[0].distance, 0);
  });

  await t.step("very long field names", () => {
    const matches = findClosestMatches("a".repeat(99), ["a".repeat(100), "b".repeat(100)]);
    assertGreaterOrEqual(matches.length, 1);
    assertEquals(matches[0].value, "a".repeat(100));
    assertEquals(matches[0].distance, 1);
  });

  await t.step("special characters normalized", () => {
    const matches = findClosestMatches("field-name", [
      "field-name",
      "field_name",
      "field.name",
      "fieldName",
    ]);
    assertGreaterOrEqual(matches.length, 1);
    assertEquals(matches[0].distance, 0);
  });

  await t.step("unicode characters", () => {
    const matches = findClosestMatches("evenement", ["événement", "événementID", "country"]);
    assertGreaterOrEqual(matches.length, 1);
  });
});
