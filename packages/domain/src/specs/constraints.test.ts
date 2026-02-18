/**
 * Tests for the typed constraint system
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  type Constraint,
  Constraint as ConstraintSchema,
  mergeConstraints,
  Obligation,
  ObligationsMap,
  obligationToEnforcement,
  RangeConstraint,
} from "./constraints.ts";
import type { Field } from "../schemas/validation-profile.ts";
import { normalizeField } from "./field-definition.ts";
import * as S from "effect/Schema";

// Helper to decode unknown values into Constraint
function decodeConstraint(raw: unknown): Constraint {
  return S.decodeUnknownSync(ConstraintSchema)(raw);
}

// =============================================================================
// Individual Constraint Schema Tests
// =============================================================================

Deno.test("RangeConstraint - decodes valid input", () => {
  const input = { type: "range", min: -90, max: 90 };
  const result = S.decodeUnknownSync(RangeConstraint)(input);
  assertEquals(result.type, "range");
  assertEquals(result.min, -90);
  assertEquals(result.max, 90);
  assertEquals(result.inclusive, true); // default
});

Deno.test("RangeConstraint - accepts optional min/max", () => {
  const input = { type: "range", min: 0 };
  const result = S.decodeUnknownSync(RangeConstraint)(input);
  assertEquals(result.min, 0);
  assertEquals(result.max, undefined);
});

Deno.test("RangeConstraint - rejects non-numeric min", () => {
  assertThrows(() => {
    S.decodeUnknownSync(RangeConstraint)({
      type: "range",
      min: "not-a-number",
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
  });
  assertEquals(result.type, "unique");
});

Deno.test("PatternConstraint - decodes valid input", () => {
  const result = decodeConstraint({
    type: "pattern",
    pattern: "^[A-Z]+$",
    flags: "i",
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
  });
  assertEquals(result.type, "length");
});

Deno.test("FormatConstraint - decodes valid input", () => {
  const result = decodeConstraint({
    type: "format",
    format: "iso8601",
    message: "Must be ISO 8601",
  });
  assertEquals(result.type, "format");
  if (result.type === "format") {
    assertEquals(result.format, "iso8601");
  }
});

Deno.test("VocabularyConstraint - decodes valid input with default strictness", () => {
  const result = decodeConstraint({
    type: "vocabulary",
    values: ["PreservedSpecimen", "FossilSpecimen", "HumanObservation"],
  });
  assertEquals(result.type, "vocabulary");
  if (result.type === "vocabulary") {
    assertEquals(result.values, ["PreservedSpecimen", "FossilSpecimen", "HumanObservation"]);
    assertEquals(result.caseSensitive, false); // default
    assertEquals(result.strictness, "recommended"); // default
  }
});

Deno.test("VocabularyConstraint - accepts strict strictness", () => {
  const result = decodeConstraint({
    type: "vocabulary",
    values: ["PreservedSpecimen", "FossilSpecimen", "HumanObservation"],
    strictness: "strict",
  });
  if (result.type === "vocabulary") {
    assertEquals(result.strictness, "strict");
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
  });
  assertEquals(range.type, "range");

  const required = decodeConstraint({ type: "required", enforcement: "required" });
  assertEquals(required.type, "required");
});

Deno.test("Constraint union - rejects unknown constraint types", () => {
  assertThrows(() => {
    decodeConstraint({ type: "nonexistent" });
  });
});

Deno.test("Constraint union - rejects missing type field", () => {
  assertThrows(() => {
    decodeConstraint({ min: 0 });
  });
});

// =============================================================================
// mergeConstraints Tests
// =============================================================================

Deno.test("mergeConstraints - child vocabulary replaces parent vocabulary", () => {
  const parent: Constraint[] = [
    {
      type: "vocabulary",
      values: ["PreservedSpecimen", "FossilSpecimen", "HumanObservation"],
      caseSensitive: false,
      strictness: "recommended",
    },
  ];
  const child: Constraint[] = [
    {
      type: "vocabulary",
      values: ["PreservedSpecimen", "FossilSpecimen", "HumanObservation"],
      caseSensitive: true,
      strictness: "strict",
    },
  ];
  const merged = mergeConstraints(parent, child);
  assertEquals(merged.length, 1);
  assertEquals(merged[0].type, "vocabulary");
  if (merged[0].type === "vocabulary") {
    assertEquals(merged[0].strictness, "strict");
    assertEquals(merged[0].caseSensitive, true);
  }
});

Deno.test("mergeConstraints - child range replaces parent range", () => {
  const parent: Constraint[] = [
    { type: "range", min: 0, max: 100, inclusive: true },
  ];
  const child: Constraint[] = [
    { type: "range", min: -90, max: 90, inclusive: true },
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
    { type: "range", min: 0, max: 100, inclusive: true },
    { type: "required", allowEmpty: false, allowWhitespace: false, enforcement: "required" },
  ];
  const child: Constraint[] = [
    {
      type: "vocabulary",
      values: ["PreservedSpecimen", "FossilSpecimen", "HumanObservation"],
      caseSensitive: false,
      strictness: "recommended",
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
    { type: "range", min: 0, max: 100, inclusive: true },
  ];
  const child: Constraint[] = [
    { type: "range", min: -90, max: 90, inclusive: true },
    { type: "range", min: 0, max: 11000, inclusive: true },
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
    {
      type: "required" as const,
      allowEmpty: false,
      allowWhitespace: false,
      enforcement: "required" as const,
    },
  ];
  assertEquals(mergeConstraints(withParent, child).length, 1);
  assertEquals(mergeConstraints(parent, withParent).length, 1);
});

// =============================================================================
// Obligation Tests
// =============================================================================

Deno.test("Obligation - accepts all 6 valid values", () => {
  const validValues = [
    "required",
    "strongly recommended",
    "recommended",
    "optional",
    "required (if exists)",
    "optional (required for imaging data)",
  ];
  for (const value of validValues) {
    const result = S.decodeUnknownSync(Obligation)(value);
    assertEquals(result, value);
  }
});

Deno.test("Obligation - rejects invalid values", () => {
  assertThrows(() => S.decodeUnknownSync(Obligation)("mandatory"));
  assertThrows(() => S.decodeUnknownSync(Obligation)("true"));
  assertThrows(() => S.decodeUnknownSync(Obligation)("false"));
  assertThrows(() => S.decodeUnknownSync(Obligation)(""));
  assertThrows(() => S.decodeUnknownSync(Obligation)(42));
});

Deno.test("ObligationsMap - decodes valid map with both standards", () => {
  const result = S.decodeUnknownSync(ObligationsMap)({
    obis: "required",
    gbif: "recommended",
  });
  assertEquals(result.obis, "required");
  assertEquals(result.gbif, "recommended");
});

Deno.test("ObligationsMap - accepts partial maps", () => {
  const obisOnly = S.decodeUnknownSync(ObligationsMap)({ obis: "optional" });
  assertEquals(obisOnly.obis, "optional");
  assertEquals(obisOnly.gbif, undefined);

  const empty = S.decodeUnknownSync(ObligationsMap)({});
  assertEquals(empty.obis, undefined);
  assertEquals(empty.gbif, undefined);
});

Deno.test("ObligationsMap - rejects invalid obligation values", () => {
  assertThrows(() =>
    S.decodeUnknownSync(ObligationsMap)({
      obis: "mandatory",
    })
  );
});

// =============================================================================
// normalizeField Obligations Tests
// =============================================================================

function makeTestField(overrides: Partial<Field>): Field {
  return {
    group: "test",
    name: "testField",
    label: "Test Field",
    namespace: "http://test",
    qualName: "test:testField",
    "dc:relation": "http://test",
    "dc:description": "Test field",
    gbif_required: "",
    type: "string",
    obis_required: "",
    ...overrides,
  };
}

Deno.test("normalizeField - populates obligations.obis from obis_required", () => {
  const field = makeTestField({ name: "eventDate", obis_required: "required" });
  const result = normalizeField(field);
  assertEquals(result.obligations?.obis, "required");
});

Deno.test("normalizeField - populates obligations.gbif from gbif_required", () => {
  const field = makeTestField({ name: "eventDate", gbif_required: "true" });
  const result = normalizeField(field);
  assertEquals(result.obligations?.gbif, "required");
});

Deno.test("normalizeField - maps gbif_required 'false' to 'optional'", () => {
  const field = makeTestField({ name: "eventDate", gbif_required: "false" });
  const result = normalizeField(field);
  assertEquals(result.obligations?.gbif, "optional");
});

Deno.test("normalizeField - handles both obis and gbif obligations", () => {
  const field = makeTestField({
    name: "eventDate",
    obis_required: "strongly recommended",
    gbif_required: "true",
  });
  const result = normalizeField(field);
  assertEquals(result.obligations?.obis, "strongly recommended");
  assertEquals(result.obligations?.gbif, "required");
});

Deno.test("normalizeField - omits obligations when no values present", () => {
  const field = makeTestField({ name: "eventDate", obis_required: "", gbif_required: "" });
  const result = normalizeField(field);
  assertEquals(result.obligations, undefined);
});

// =============================================================================
// obligationToEnforcement Tests
// =============================================================================

Deno.test("obligationToEnforcement - maps 'required' to 'required'", () => {
  assertEquals(obligationToEnforcement("required"), "required");
});

Deno.test("obligationToEnforcement - maps 'strongly recommended' to 'recommended'", () => {
  assertEquals(obligationToEnforcement("strongly recommended"), "recommended");
});

Deno.test("obligationToEnforcement - maps 'recommended' to 'optional'", () => {
  assertEquals(obligationToEnforcement("recommended"), "optional");
});

Deno.test("obligationToEnforcement - returns undefined for 'optional'", () => {
  assertEquals(obligationToEnforcement("optional"), undefined);
});

Deno.test("obligationToEnforcement - returns undefined for 'optional (required for imaging data)'", () => {
  assertEquals(obligationToEnforcement("optional (required for imaging data)"), undefined);
});

Deno.test("obligationToEnforcement - returns undefined for 'required (if exists)'", () => {
  assertEquals(obligationToEnforcement("required (if exists)"), undefined);
});

// =============================================================================
// normalizeField String-to-Constraint Tests
// =============================================================================

Deno.test("normalizeField - string 'required' → RequiredConstraint enforcement:required", () => {
  const field = makeTestField({ name: "test", validators: ["required"] });
  const result = normalizeField(field);
  const required = result.constraints.filter((c) => c.type === "required");
  assertEquals(required.length, 1);
  assertEquals(required[0].enforcement, "required");
});

Deno.test("normalizeField - string 'recommended' → RequiredConstraint enforcement:optional (INFO for absence)", () => {
  const field = makeTestField({ name: "test", validators: ["recommended"] });
  const result = normalizeField(field);
  const required = result.constraints.filter((c) => c.type === "required");
  assertEquals(required.length, 1);
  assertEquals(required[0].enforcement, "optional");
});

Deno.test("normalizeField - string 'optional' → no constraint emitted", () => {
  const field = makeTestField({ name: "test", validators: ["optional"] });
  const result = normalizeField(field);
  const required = result.constraints.filter((c) => c.type === "required");
  assertEquals(required.length, 0);
});

Deno.test("normalizeField - string 'unique' → UniqueConstraint", () => {
  const field = makeTestField({ name: "test", validators: ["unique"] });
  const result = normalizeField(field);
  const unique = result.constraints.filter((c) => c.type === "unique");
  assertEquals(unique.length, 1);
});

Deno.test("normalizeField - string 'uniqueIdentifier' → UniqueConstraint", () => {
  const field = makeTestField({ name: "test", validators: ["uniqueIdentifier"] });
  const result = normalizeField(field);
  const unique = result.constraints.filter((c) => c.type === "unique");
  assertEquals(unique.length, 1);
});

Deno.test("normalizeField - string 'date' → FormatConstraint iso8601", () => {
  const field = makeTestField({ name: "test", validators: ["date"] });
  const result = normalizeField(field);
  const format = result.constraints.filter((c) => c.type === "format");
  assertEquals(format.length, 1);
  if (format[0].type === "format") {
    assertEquals(format[0].format, "iso8601");
  }
});

Deno.test("normalizeField - string 'iso8601Date' → FormatConstraint iso8601", () => {
  const field = makeTestField({ name: "test", validators: ["iso8601Date"] });
  const result = normalizeField(field);
  const format = result.constraints.filter((c) => c.type === "format");
  assertEquals(format.length, 1);
  if (format[0].type === "format") {
    assertEquals(format[0].format, "iso8601");
  }
});

Deno.test("normalizeField - string 'url' → FormatConstraint url", () => {
  const field = makeTestField({ name: "test", validators: ["url"] });
  const result = normalizeField(field);
  const format = result.constraints.filter((c) => c.type === "format");
  assertEquals(format.length, 1);
  if (format[0].type === "format") {
    assertEquals(format[0].format, "url");
  }
});

Deno.test("normalizeField - string 'integer' → FormatConstraint integer", () => {
  const field = makeTestField({ name: "test", validators: ["integer"] });
  const result = normalizeField(field);
  const format = result.constraints.filter((c) => c.type === "format");
  assertEquals(format.length, 1);
  if (format[0].type === "format") {
    assertEquals(format[0].format, "integer");
  }
});

Deno.test("normalizeField - string 'decimal' → FormatConstraint decimal-degrees", () => {
  const field = makeTestField({ name: "test", validators: ["decimal"] });
  const result = normalizeField(field);
  const format = result.constraints.filter((c) => c.type === "format");
  assertEquals(format.length, 1);
  if (format[0].type === "format") {
    assertEquals(format[0].format, "decimal-degrees");
  }
});

Deno.test("normalizeField - unknown string validator is skipped with warning", () => {
  const field = makeTestField({ name: "test", validators: ["unknownValidator"] });
  const result = normalizeField(field);
  assertEquals(result.constraints.length, 0);
});

Deno.test("normalizeField - warns when enforcement is stripped from value constraint", () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string) => warnings.push(msg);
  try {
    const field = makeTestField({
      name: "decimalLatitude",
      validators: [
        { type: "range", params: { min: -90, max: 90 }, enforcement: "optional" },
      ],
    });
    const result = normalizeField(field);
    const range = result.constraints.filter((c) => c.type === "range");
    assertEquals(range.length, 1);
    assertEquals(warnings.length, 1);
    assert(warnings[0].includes("Stripping"));
    assert(warnings[0].includes("range"));
    assert(warnings[0].includes("decimalLatitude"));
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test("normalizeField - no warning when value constraint has no enforcement", () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (msg: string) => warnings.push(msg);
  try {
    const field = makeTestField({
      name: "decimalLatitude",
      validators: [
        { type: "range", params: { min: -90, max: 90 } },
      ],
    });
    normalizeField(field);
    assertEquals(warnings.length, 0);
  } finally {
    console.warn = originalWarn;
  }
});

Deno.test("normalizeField - object validator with params flattened to Constraint", () => {
  const field = makeTestField({
    name: "test",
    validators: [
      { type: "range", params: { min: -90, max: 90 } },
    ],
  });
  const result = normalizeField(field);
  const range = result.constraints.filter((c) => c.type === "range");
  assertEquals(range.length, 1);
  if (range[0].type === "range") {
    assertEquals(range[0].min, -90);
    assertEquals(range[0].max, 90);
  }
});
