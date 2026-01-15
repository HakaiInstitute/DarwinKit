/**
 * Tests for String Matching Utilities
 */

import { assertEquals } from "@std/assert";
import { levenshteinDistance } from "./string-utils.ts";

// ============================================================================
// levenshteinDistance Tests
// ============================================================================

type LevenshteinDistanceTestCase = {
  description: string;
  string1: string;
  string2: string;
  expected: number;
};

const levenshteinDistanceTestCases: LevenshteinDistanceTestCase[] = [
  // Exact matches
  {
    description: "exact match: empty strings",
    string1: "",
    string2: "",
    expected: 0,
  },
  {
    description: "exact match: single character",
    string1: "a",
    string2: "a",
    expected: 0,
  },
  {
    description: "exact match: word",
    string1: "hello",
    string2: "hello",
    expected: 0,
  },
  {
    description: "exact match: Darwin Core field",
    string1: "eventID",
    string2: "eventID",
    expected: 0,
  },

  // Empty string operations
  {
    description: "empty to non-empty string",
    string1: "",
    string2: "hello",
    expected: 5,
  },
  {
    description: "non-empty to empty string",
    string1: "hello",
    string2: "",
    expected: 5,
  },

  // Single character operations - Insertion
  {
    description: "insertion: append character",
    string1: "cat",
    string2: "cats",
    expected: 1,
  },
  {
    description: "insertion: append to Darwin Core field",
    string1: "event",
    string2: "events",
    expected: 1,
  },

  // Single character operations - Deletion
  {
    description: "deletion: remove trailing character",
    string1: "cats",
    string2: "cat",
    expected: 1,
  },
  {
    description: "deletion: remove from Darwin Core field",
    string1: "events",
    string2: "event",
    expected: 1,
  },

  // Single character operations - Substitution
  {
    description: "substitution: single character",
    string1: "cat",
    string2: "bat",
    expected: 1,
  },

  // Transposition (counted as 2 operations in Levenshtein)
  {
    description: "transposition: adjacent characters",
    string1: "eventID",
    string2: "evnetID",
    expected: 2,
  },

  // Multiple operations
  {
    description: "multiple ops: classic example 'kitten' to 'sitting'",
    string1: "kitten",
    string2: "sitting",
    expected: 3,
  },
  {
    description: "multiple ops: 'saturday' to 'sunday'",
    string1: "saturday",
    string2: "sunday",
    expected: 3,
  },
  {
    description: "multiple ops: missing middle character",
    string1: "eventID",
    string2: "evntID",
    expected: 1,
  },
  {
    description: "multiple ops: prefix addition",
    string1: "latitude",
    string2: "decimalLatitude",
    expected: 7,
  },

  // Case sensitivity
  {
    description: "case sensitive: first letter",
    string1: "Event",
    string2: "event",
    expected: 1,
  },
  {
    description: "case sensitive: full uppercase vs lowercase",
    string1: "EVENTID",
    string2: "eventid",
    expected: 7,
  },
  {
    description: "case sensitive: mixed case difference",
    string1: "EventID",
    string2: "eventID",
    expected: 1,
  },
];

Deno.test("levenshteinDistance", async (t) => {
  for (const testCase of levenshteinDistanceTestCases) {
    await t.step(testCase.description, () => {
      const result = levenshteinDistance(testCase.string1, testCase.string2);
      assertEquals(result, testCase.expected);
    });
  }
});
