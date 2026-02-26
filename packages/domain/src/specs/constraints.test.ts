/**
 * Tests for the typed constraint system
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import * as S from "effect/Schema";
import type { RawField } from "../schemas/validation-profile.ts";
import {
  type Constraint,
  ConstraintSchema,
  FormatConstraint,
  mergeProfileConstraints,
  Obligation,
  ObligationsMap,
  obligationToRequirement,
  overrideConstraints,
  RangeConstraint,
  RequiredConstraint,
} from "./constraints.ts";
import { normalizeField } from "./field-definition.ts";
import {
  rangeConstraint,
  requiredConstraint as reqConstraint,
} from "../../../../test/helpers/constraint-factories.ts";

// Helper to decode unknown values into Constraint
function decodeConstraint(raw: unknown): Constraint {
  return S.decodeUnknownSync(ConstraintSchema)(raw);
}

// =============================================================================
// Individual Constraint Schema Tests
// =============================================================================

Deno.test("ConstraintSchema - decodes all constraint types", () => {
  const cases: Array<
    { input: Record<string, unknown>; expectedTag: string; check?: (c: Constraint) => void }
  > = [
    {
      input: { type: "range", min: -90, max: 90 },
      expectedTag: "range",
      check: (c) => {
        assert(c instanceof RangeConstraint);
        assertEquals(c.min, -90);
        assertEquals(c.max, 90);
        assertEquals(c.inclusive, true);
      },
    },
    {
      input: { type: "range", min: 0 },
      expectedTag: "range",
      check: (c) => {
        assert(c instanceof RangeConstraint);
        assertEquals(c.min, 0);
        assertEquals(c.max, undefined);
        assertEquals(c.inclusive, true);
      },
    },
    {
      input: { type: "required" },
      expectedTag: "required",
      check: (c) => {
        assert(c instanceof RequiredConstraint);
        assertEquals(c.level, "required");
        assertEquals(c.allowEmpty, false);
        assertEquals(c.allowWhitespace, false);
      },
    },
    {
      input: { type: "required", level: "required", message: "Field is required" },
      expectedTag: "required",
      check: (c) => {
        assert(c instanceof RequiredConstraint);
        assertEquals(c.level, "required");
      },
    },
    {
      input: { type: "required", level: "recommended" },
      expectedTag: "required",
      check: (c) => {
        assert(c instanceof RequiredConstraint);
        assertEquals(c.level, "recommended");
      },
    },
    { input: { type: "unique" }, expectedTag: "unique" },
    {
      input: { type: "pattern", pattern: "^[A-Z]+$", flags: "i" },
      expectedTag: "pattern",
      check: (c) => {
        assertEquals((c as { pattern: string }).pattern, "^[A-Z]+$");
        assertEquals((c as { flags: string }).flags, "i");
      },
    },
    { input: { type: "length", minLength: 1, maxLength: 255 }, expectedTag: "length" },
    {
      input: { type: "format", format: "iso8601", message: "Must be ISO 8601" },
      expectedTag: "format",
      check: (c) => assertEquals((c as FormatConstraint).format, "iso8601"),
    },
  ];

  for (const { input, expectedTag, check } of cases) {
    const result = decodeConstraint(input);
    assertEquals(result._tag, expectedTag, `type: ${input.type}`);
    check?.(result);
  }
});

Deno.test("ConstraintSchema - rejects invalid inputs", () => {
  assertThrows(() => decodeConstraint({ type: "range", min: "not-a-number" }));
  assertThrows(() => decodeConstraint({ type: "nonexistent" }));
  assertThrows(() => decodeConstraint({ min: 0 }));
});

Deno.test("ConstraintSchema - rejects RangeConstraint with no bounds", () => {
  assertThrows(() => decodeConstraint({ type: "range" }));
  assertThrows(() => decodeConstraint({ type: "range", inclusive: true }));
  // At least one bound is fine
  decodeConstraint({ type: "range", min: 0 });
  decodeConstraint({ type: "range", max: 100 });
});

Deno.test("ConstraintSchema - rejects LengthConstraint with no bounds", () => {
  assertThrows(() => decodeConstraint({ type: "length" }));
  assertThrows(() => decodeConstraint({ type: "length", message: "oops" }));
  // At least one bound is fine
  decodeConstraint({ type: "length", minLength: 1 });
  decodeConstraint({ type: "length", maxLength: 255 });
});

Deno.test("Constraint union - discriminates by _tag field", () => {
  const range = decodeConstraint({ type: "range", min: 0, max: 100, inclusive: true });
  assertEquals(range._tag, "range");

  const required = decodeConstraint({ type: "required", level: "required" });
  assertEquals(required._tag, "required");
});

// =============================================================================
// overrideConstraints Tests
// =============================================================================

Deno.test("overrideConstraints - child range replaces parent range", () => {
  const parent: Constraint[] = [
    new RangeConstraint({ min: 0, max: 100, inclusive: true }),
  ];
  const child: Constraint[] = [
    new RangeConstraint({ min: -90, max: 90, inclusive: true }),
  ];
  const merged = overrideConstraints(parent, child);
  assertEquals(merged.length, 1);
  assertEquals((merged[0] as RangeConstraint).min, -90);
  assertEquals((merged[0] as RangeConstraint).max, 90);
});

Deno.test("overrideConstraints - non-overlapping types preserved", () => {
  const parent: Constraint[] = [
    new RangeConstraint({ min: 0, max: 100, inclusive: true }),
    new RequiredConstraint({ level: "required", allowEmpty: false, allowWhitespace: false }),
  ];
  const child: Constraint[] = [
    new FormatConstraint({ format: "iso8601" }),
  ];
  const merged = overrideConstraints(parent, child);
  assertEquals(merged.length, 3);
  const tags = merged.map((c) => c._tag);
  assert(tags.includes("range"));
  assert(tags.includes("required"));
  assert(tags.includes("format"));
});

Deno.test("overrideConstraints - child with multiple same-type constraints replaces parent batch", () => {
  const parent: Constraint[] = [
    new RangeConstraint({ min: 0, max: 100, inclusive: true }),
  ];
  const child: Constraint[] = [
    new RangeConstraint({ min: -90, max: 90, inclusive: true }),
    new RangeConstraint({ min: 0, max: 11000, inclusive: true }),
  ];
  const merged = overrideConstraints(parent, child);
  const ranges = merged.filter((c) => c._tag === "range") as RangeConstraint[];
  assertEquals(ranges.length, 2);
  assertEquals(ranges[0].min, -90);
  assertEquals(ranges[1].min, 0);
  assertEquals(ranges[1].max, 11000);
});

Deno.test("overrideConstraints - empty arrays handled", () => {
  const parent: Constraint[] = [];
  const child: Constraint[] = [];
  assertEquals(overrideConstraints(parent, child).length, 0);

  const withParent: Constraint[] = [
    new RequiredConstraint({ level: "required", allowEmpty: false, allowWhitespace: false }),
  ];
  assertEquals(overrideConstraints(withParent, child).length, 1);
  assertEquals(overrideConstraints(parent, withParent).length, 1);
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

Deno.test("ObligationsMap", async (t) => {
  await t.step("decodes valid map with both standards", () => {
    const result = S.decodeUnknownSync(ObligationsMap)({ obis: "required", gbif: "recommended" });
    assertEquals(result.obis, "required");
    assertEquals(result.gbif, "recommended");
  });

  await t.step("accepts partial and empty maps", () => {
    const obisOnly = S.decodeUnknownSync(ObligationsMap)({ obis: "optional" });
    assertEquals(obisOnly.obis, "optional");
    assertEquals(obisOnly.gbif, undefined);

    const empty = S.decodeUnknownSync(ObligationsMap)({});
    assertEquals(empty.obis, undefined);
  });

  await t.step("rejects invalid obligation values", () => {
    assertThrows(() => S.decodeUnknownSync(ObligationsMap)({ obis: "mandatory" }));
  });
});

// =============================================================================
// normalizeField Obligations Tests
// =============================================================================

function makeTestField(overrides: Partial<RawField>): RawField {
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

Deno.test("normalizeField - populates obligations from obis/gbif required fields", () => {
  const cases: Array<{
    label: string;
    overrides: Partial<RawField>;
    expected: { obis?: string; gbif?: string } | undefined;
  }> = [
    {
      label: "obis_required → obligations.obis",
      overrides: { name: "eventDate", obis_required: "required" },
      expected: { obis: "required" },
    },
    {
      label: "gbif_required 'true' → obligations.gbif 'required'",
      overrides: { name: "eventDate", gbif_required: "true" },
      expected: { gbif: "required" },
    },
    {
      label: "gbif_required 'false' → obligations.gbif 'optional'",
      overrides: { name: "eventDate", gbif_required: "false" },
      expected: { gbif: "optional" },
    },
    {
      label: "both obis and gbif",
      overrides: {
        name: "eventDate",
        obis_required: "strongly recommended",
        gbif_required: "true",
      },
      expected: { obis: "strongly recommended", gbif: "required" },
    },
    {
      label: "empty strings → no obligations",
      overrides: { name: "eventDate", obis_required: "", gbif_required: "" },
      expected: undefined,
    },
  ];

  for (const { label, overrides, expected } of cases) {
    const { field } = normalizeField(makeTestField(overrides));
    if (expected === undefined) {
      assertEquals(field.obligations, undefined, label);
    } else {
      if (expected.obis !== undefined) assertEquals(field.obligations?.obis, expected.obis, label);
      if (expected.gbif !== undefined) assertEquals(field.obligations?.gbif, expected.gbif, label);
    }
  }
});

// =============================================================================
// obligationToRequirement Tests
// =============================================================================

Deno.test("obligationToRequirement - maps obligations to requirement levels", () => {
  const cases: Array<[Parameters<typeof obligationToRequirement>[0], string | undefined]> = [
    ["required", "required"],
    ["strongly recommended", "recommended"],
    ["recommended", "optional"],
    ["optional", undefined],
    ["optional (required for imaging data)", undefined],
    ["required (if exists)", undefined],
  ];
  for (const [input, expected] of cases) {
    assertEquals(obligationToRequirement(input), expected, input);
  }
});

// =============================================================================
// normalizeField String-to-Constraint Tests
// =============================================================================

Deno.test("normalizeField - converts string validators to typed constraints", () => {
  const cases: Array<{
    validator: string;
    expectedTag: string | null;
    check?: (c: Constraint) => void;
  }> = [
    {
      validator: "required",
      expectedTag: "required",
      check: (c) => assertEquals((c as RequiredConstraint).level, "required"),
    },
    {
      validator: "recommended",
      expectedTag: "required",
      check: (c) => assertEquals((c as RequiredConstraint).level, "optional"),
    },
    { validator: "optional", expectedTag: null },
    { validator: "unique", expectedTag: "unique" },
    { validator: "uniqueIdentifier", expectedTag: "unique" },
    {
      validator: "date",
      expectedTag: "format",
      check: (c) => assertEquals((c as FormatConstraint).format, "iso8601"),
    },
    {
      validator: "iso8601Date",
      expectedTag: "format",
      check: (c) => assertEquals((c as FormatConstraint).format, "iso8601"),
    },
    {
      validator: "url",
      expectedTag: "format",
      check: (c) => assertEquals((c as FormatConstraint).format, "url"),
    },
    {
      validator: "integer",
      expectedTag: "format",
      check: (c) => assertEquals((c as FormatConstraint).format, "integer"),
    },
    {
      validator: "decimal",
      expectedTag: "format",
      check: (c) => assertEquals((c as FormatConstraint).format, "decimal-degrees"),
    },
    { validator: "unknownValidator", expectedTag: null },
  ];

  for (const { validator, expectedTag, check } of cases) {
    const { field } = normalizeField(makeTestField({ name: "test", validators: [validator] }));
    if (expectedTag === null) {
      assertEquals(
        field.constraints.filter((c) => c._tag !== "required" || validator === "optional")
          .length === 0,
        true,
        validator,
      );
    } else {
      const matches = field.constraints.filter((c) => c._tag === expectedTag);
      assertEquals(matches.length, 1, `${validator} → ${expectedTag}`);
      check?.(matches[0]);
    }
  }
});

Deno.test("normalizeField - strips requirement from value constraint silently", () => {
  const testField = makeTestField({
    name: "decimalLatitude",
    validators: [
      { type: "range", params: { min: -90, max: 90 }, requirement: "optional" },
    ],
  });
  const { field } = normalizeField(testField);
  const range = field.constraints.filter((c) => c._tag === "range");
  assertEquals(range.length, 1);
});

// =============================================================================
// mergeProfileConstraints Tests
// =============================================================================

Deno.test("mergeProfileConstraints", async (t) => {
  const req = reqConstraint;
  const range = rangeConstraint;

  const cases = [
    {
      label: "keeps strictest required (required > recommended)",
      parent: [req("required")],
      child: [req("recommended")],
      expectedTags: ["required"],
      checkRequired: "required" as const,
    },
    {
      label: "allows strengthening (recommended → required)",
      parent: [req("recommended")],
      child: [req("required")],
      expectedTags: ["required"],
      checkRequired: "required" as const,
    },
    {
      label: "child cannot weaken parent's required",
      parent: [req("required")],
      child: [req("optional")],
      expectedTags: ["required"],
      checkRequired: "required" as const,
    },
    {
      label: "replaces value constraints normally",
      parent: [range(-90, 90)],
      child: [range(-45, 45)],
      expectedTags: ["range"],
      checkRange: -45,
    },
    {
      label: "child introduces required where parent has none",
      parent: [range(-90, 90)],
      child: [req("required")],
      expectedTags: ["range", "required"],
      checkRequired: "required" as const,
    },
  ];

  for (const { label, parent, child, expectedTags, checkRequired, checkRange } of cases) {
    await t.step(label, () => {
      const result = mergeProfileConstraints(parent, child);
      assertEquals(result.map((c) => c._tag).sort(), [...expectedTags].sort(), label);
      if (checkRequired) {
        const req = result.filter((c) => c._tag === "required") as RequiredConstraint[];
        assertEquals(req[0].level, checkRequired);
      }
      if (checkRange !== undefined) {
        assertEquals((result.find((c) => c._tag === "range") as RangeConstraint).min, checkRange);
      }
    });
  }
});

// =============================================================================
// Inverted Bounds & Invalid Regex Tests
// =============================================================================

Deno.test("RangeConstraintSchema - rejects min > max", () => {
  assertThrows(
    () => S.decodeUnknownSync(ConstraintSchema)({ type: "range", min: 100, max: 0 }),
    Error,
  );
});

Deno.test("LengthConstraintSchema - rejects minLength > maxLength", () => {
  assertThrows(
    () => S.decodeUnknownSync(ConstraintSchema)({ type: "length", minLength: 100, maxLength: 5 }),
    Error,
  );
});

Deno.test("PatternConstraintSchema - rejects invalid regex", () => {
  assertThrows(
    () => S.decodeUnknownSync(ConstraintSchema)({ type: "pattern", pattern: "[unclosed" }),
    Error,
  );
});

Deno.test("normalizeField - object validator with params flattened to Constraint (no warning)", () => {
  const testField = makeTestField({
    name: "test",
    validators: [{ type: "range", params: { min: -90, max: 90 } }],
  });
  const { field, warnings } = normalizeField(testField);
  const range = field.constraints.filter((c) => c._tag === "range");
  assertEquals(range.length, 1);
  assertEquals((range[0] as RangeConstraint).min, -90);
  assertEquals((range[0] as RangeConstraint).max, 90);
  assertEquals(warnings.length, 0, "no warning when no requirement on value constraint");
});
