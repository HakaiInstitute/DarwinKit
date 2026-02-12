/**
 * Tests for the typed constraint system
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  type Constraint,
  Constraint as ConstraintSchema,
  mergeConstraints,
  RangeConstraint,
} from "./constraints.ts";
import * as S from "effect/Schema";

// Helper to decode unknown values into Constraint
function decodeConstraint(raw: unknown): Constraint {
  return S.decodeUnknownSync(ConstraintSchema)(raw);
}

// =============================================================================
// Individual Constraint Schema Tests
// =============================================================================

Deno.test("RangeConstraint - decodes valid input", () => {
  const input = { type: "range", min: -90, max: 90, enforcement: "required" };
  const result = S.decodeUnknownSync(RangeConstraint)(input);
  assertEquals(result.type, "range");
  assertEquals(result.min, -90);
  assertEquals(result.max, 90);
  assertEquals(result.enforcement, "required");
  assertEquals(result.inclusive, true); // default
});

Deno.test("RangeConstraint - accepts optional min/max", () => {
  const input = { type: "range", min: 0, enforcement: "recommended" };
  const result = S.decodeUnknownSync(RangeConstraint)(input);
  assertEquals(result.min, 0);
  assertEquals(result.max, undefined);
});

Deno.test("RangeConstraint - rejects non-numeric min", () => {
  assertThrows(() => {
    S.decodeUnknownSync(RangeConstraint)({
      type: "range",
      min: "not-a-number",
      enforcement: "required",
    });
  });
});

Deno.test("RangeConstraint - rejects invalid enforcement", () => {
  assertThrows(() => {
    S.decodeUnknownSync(RangeConstraint)({
      type: "range",
      min: 0,
      enforcement: "invalid",
    });
  });
});

Deno.test("RequiredConstraint - decodes valid input", () => {
  const result = decodeConstraint({
    type: "required",
    enforcement: "required",
    message: "Field is required",
  });
  assertEquals(result.type, "required");
});

Deno.test("UniqueConstraint - decodes valid input", () => {
  const result = decodeConstraint({
    type: "unique",
    enforcement: "required",
  });
  assertEquals(result.type, "unique");
});

Deno.test("PatternConstraint - decodes valid input", () => {
  const result = decodeConstraint({
    type: "pattern",
    pattern: "^[A-Z]+$",
    flags: "i",
    enforcement: "recommended",
  });
  assertEquals(result.type, "pattern");
  if (result.type === "pattern") {
    assertEquals(result.pattern, "^[A-Z]+$");
    assertEquals(result.flags, "i");
  }
});

Deno.test("LengthConstraint - decodes valid input", () => {
  const result = decodeConstraint({
    type: "length",
    minLength: 1,
    maxLength: 255,
    enforcement: "optional",
  });
  assertEquals(result.type, "length");
});

Deno.test("FormatConstraint - decodes valid input", () => {
  const result = decodeConstraint({
    type: "format",
    format: "iso8601",
    enforcement: "required",
    message: "Must be ISO 8601",
  });
  assertEquals(result.type, "format");
  if (result.type === "format") {
    assertEquals(result.format, "iso8601");
  }
});

Deno.test("VocabularyConstraint - decodes valid input", () => {
  const result = decodeConstraint({
    type: "vocabulary",
    vocabularyKey: "basisOfRecord",
    enforcement: "recommended",
  });
  assertEquals(result.type, "vocabulary");
  if (result.type === "vocabulary") {
    assertEquals(result.vocabularyKey, "basisOfRecord");
    assertEquals(result.caseSensitive, false); // default
  }
});

// =============================================================================
// Constraint Union Tests
// =============================================================================

Deno.test("Constraint union - discriminates by type field", () => {
  const range = decodeConstraint({
    type: "range",
    min: 0,
    max: 100,
    inclusive: true,
    enforcement: "required",
  });
  assertEquals(range.type, "range");

  const required = decodeConstraint({ type: "required", enforcement: "required" });
  assertEquals(required.type, "required");
});

Deno.test("Constraint union - rejects unknown constraint types", () => {
  assertThrows(() => {
    decodeConstraint({ type: "nonexistent", enforcement: "required" });
  });
});

Deno.test("Constraint union - rejects missing type field", () => {
  assertThrows(() => {
    decodeConstraint({ enforcement: "required", min: 0 });
  });
});

// =============================================================================
// mergeConstraints Tests
// =============================================================================

Deno.test("mergeConstraints - child vocabulary replaces parent vocabulary", () => {
  const parent: Constraint[] = [
    {
      type: "vocabulary",
      vocabularyKey: "basisOfRecord",
      caseSensitive: false,
      enforcement: "optional",
    },
  ];
  const child: Constraint[] = [
    {
      type: "vocabulary",
      vocabularyKey: "basisOfRecord",
      caseSensitive: true,
      enforcement: "required",
    },
  ];
  const merged = mergeConstraints(parent, child);
  assertEquals(merged.length, 1);
  assertEquals(merged[0].type, "vocabulary");
  if (merged[0].type === "vocabulary") {
    assertEquals(merged[0].enforcement, "required");
    assertEquals(merged[0].caseSensitive, true);
  }
});

Deno.test("mergeConstraints - child range replaces parent range", () => {
  const parent: Constraint[] = [
    { type: "range", min: 0, max: 100, inclusive: true, enforcement: "required" },
  ];
  const child: Constraint[] = [
    { type: "range", min: -90, max: 90, inclusive: true, enforcement: "required" },
  ];
  const merged = mergeConstraints(parent, child);
  assertEquals(merged.length, 1);
  if (merged[0].type === "range") {
    assertEquals(merged[0].min, -90);
    assertEquals(merged[0].max, 90);
  }
});

Deno.test("mergeConstraints - non-overlapping types preserved", () => {
  const parent: Constraint[] = [
    { type: "range", min: 0, max: 100, inclusive: true, enforcement: "required" },
    { type: "required", allowEmpty: false, allowWhitespace: false, enforcement: "required" },
  ];
  const child: Constraint[] = [
    {
      type: "vocabulary",
      vocabularyKey: "basisOfRecord",
      caseSensitive: false,
      enforcement: "required",
    },
  ];
  const merged = mergeConstraints(parent, child);
  assertEquals(merged.length, 3);
  const types = merged.map((c) => c.type);
  assert(types.includes("range"));
  assert(types.includes("required"));
  assert(types.includes("vocabulary"));
});

Deno.test("mergeConstraints - child with multiple same-type constraints replaces parent batch", () => {
  const parent: Constraint[] = [
    { type: "range", min: 0, max: 100, inclusive: true, enforcement: "required" },
  ];
  const child: Constraint[] = [
    { type: "range", min: -90, max: 90, inclusive: true, enforcement: "required" },
    { type: "range", min: 0, max: 11000, inclusive: true, enforcement: "recommended" },
  ];
  const merged = mergeConstraints(parent, child);
  // Both child range constraints kept, parent range replaced
  const ranges = merged.filter((c) => c.type === "range");
  assertEquals(ranges.length, 2);
  if (ranges[0].type === "range" && ranges[1].type === "range") {
    assertEquals(ranges[0].min, -90);
    assertEquals(ranges[1].min, 0);
    assertEquals(ranges[1].max, 11000);
  }
});

Deno.test("mergeConstraints - empty arrays handled", () => {
  const parent: Constraint[] = [];
  const child: Constraint[] = [];
  assertEquals(mergeConstraints(parent, child).length, 0);

  const withParent: Constraint[] = [
    { type: "required", allowEmpty: false, allowWhitespace: false, enforcement: "required" },
  ];
  assertEquals(mergeConstraints(withParent, child).length, 1);
  assertEquals(mergeConstraints(parent, withParent).length, 1);
});
