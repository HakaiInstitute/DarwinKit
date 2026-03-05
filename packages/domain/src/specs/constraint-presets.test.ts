/**
 * Tests for constraint presets
 */

import { assertEquals } from "@std/assert";
import { CONSTRAINT_PRESETS, getPreset } from "./constraint-presets.ts";
import type { RangeConstraint } from "./constraints.ts";

Deno.test("getPreset - returns expected constraint tags for each preset", () => {
  const cases: Array<{ name: string; expectedTags: string[] }> = [
    { name: "latitude", expectedTags: ["range", "format"] },
    { name: "longitude", expectedTags: ["range", "format"] },
    { name: "depth", expectedTags: ["range"] },
    { name: "isoDate", expectedTags: ["format"] },
    { name: "uniqueId", expectedTags: ["required", "unique"] },
    { name: "requiredText", expectedTags: ["required"] },
    { name: "url", expectedTags: ["format"] },
    { name: "uuid", expectedTags: ["format"] },
    { name: "countryCode", expectedTags: ["pattern"] },
    { name: "year", expectedTags: ["range", "format"] },
    { name: "month", expectedTags: ["range", "format"] },
    { name: "day", expectedTags: ["range", "format"] },
  ];

  for (const { name, expectedTags } of cases) {
    const constraints = getPreset(name);
    assertEquals(
      constraints?.map((c) => c._tag),
      expectedTags,
      `preset '${name}'`,
    );
  }
});

Deno.test("getPreset - returns undefined for unknown preset", () => {
  assertEquals(getPreset("nonexistent"), undefined);
});

Deno.test("CONSTRAINT_PRESETS - all presets have non-empty constraints and descriptions", () => {
  for (const [name, preset] of Object.entries(CONSTRAINT_PRESETS)) {
    assertEquals(preset.constraints.length > 0, true, `'${name}' has constraints`);
    assertEquals(preset.description.length > 0, true, `'${name}' has description`);
  }
});

Deno.test("latitude preset - validates range values", () => {
  const constraints = getPreset("latitude")!;
  const range = constraints.find((c) => c._tag === "range") as RangeConstraint;
  assertEquals(range.min, -90);
  assertEquals(range.max, 90);
  assertEquals(range.inclusive, true);
});

Deno.test("longitude preset - validates range values", () => {
  const constraints = getPreset("longitude")!;
  const range = constraints.find((c) => c._tag === "range") as RangeConstraint;
  assertEquals(range.min, -180);
  assertEquals(range.max, 180);
  assertEquals(range.inclusive, true);
});

Deno.test("depth preset - validates range values", () => {
  const constraints = getPreset("depth")!;
  const range = constraints.find((c) => c._tag === "range") as RangeConstraint;
  assertEquals(range.min, 0);
  assertEquals(range.max, 11000);
  assertEquals(range.inclusive, true);
});

Deno.test("year preset - validates range values", () => {
  const constraints = getPreset("year")!;
  const range = constraints.find((c) => c._tag === "range") as RangeConstraint;
  assertEquals(range.min, 1000);
  assertEquals(range.max, 2100);
});

Deno.test("month preset - validates range values", () => {
  const constraints = getPreset("month")!;
  const range = constraints.find((c) => c._tag === "range") as RangeConstraint;
  assertEquals(range.min, 1);
  assertEquals(range.max, 12);
});

Deno.test("day preset - validates range values", () => {
  const constraints = getPreset("day")!;
  const range = constraints.find((c) => c._tag === "range") as RangeConstraint;
  assertEquals(range.min, 1);
  assertEquals(range.max, 31);
});
