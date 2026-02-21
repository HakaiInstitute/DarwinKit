/**
 * Tests for constraint presets
 */

import { assert, assertEquals } from "@std/assert";
import { CONSTRAINT_PRESETS, getPreset } from "./constraint-presets.ts";

Deno.test("getPreset - returns constraints for known preset", () => {
  const constraints = getPreset("latitude");
  assert(constraints !== undefined, "latitude preset should exist");
  assert(constraints!.length >= 1, "latitude preset should have at least 1 constraint");

  // Should include range constraint for -90 to 90
  const rangeConstraint = constraints!.find((c) => c._tag === "range");
  assert(rangeConstraint !== undefined, "latitude preset should include range constraint");
  if (rangeConstraint?._tag === "range") {
    assertEquals(rangeConstraint.min, -90);
    assertEquals(rangeConstraint.max, 90);
  }
});

Deno.test("getPreset - returns undefined for unknown preset", () => {
  const constraints = getPreset("nonexistent");
  assertEquals(constraints, undefined);
});

Deno.test("getPreset - longitude preset has correct range", () => {
  const constraints = getPreset("longitude")!;
  const rangeConstraint = constraints.find((c) => c._tag === "range");
  assert(rangeConstraint !== undefined);
  if (rangeConstraint?._tag === "range") {
    assertEquals(rangeConstraint.min, -180);
    assertEquals(rangeConstraint.max, 180);
  }
});

Deno.test("getPreset - isoDate preset has format constraint", () => {
  const constraints = getPreset("isoDate")!;
  const formatConstraint = constraints.find((c) => c._tag === "format");
  assert(formatConstraint !== undefined);
  if (formatConstraint?._tag === "format") {
    assertEquals(formatConstraint.format, "iso8601");
  }
});

Deno.test("getPreset - uniqueId preset has required + unique", () => {
  const constraints = getPreset("uniqueId")!;
  assert(
    constraints.some((c) => c._tag === "required"),
    "uniqueId should include required",
  );
  assert(
    constraints.some((c) => c._tag === "unique"),
    "uniqueId should include unique",
  );
});

Deno.test("CONSTRAINT_PRESETS - all presets have non-empty constraints", () => {
  for (const [name, preset] of Object.entries(CONSTRAINT_PRESETS)) {
    assert(
      preset.constraints.length > 0,
      `Preset '${name}' should have at least one constraint`,
    );
  }
});

Deno.test("CONSTRAINT_PRESETS - all presets have descriptions", () => {
  for (const [name, preset] of Object.entries(CONSTRAINT_PRESETS)) {
    assert(
      preset.description.length > 0,
      `Preset '${name}' should have a description`,
    );
  }
});
