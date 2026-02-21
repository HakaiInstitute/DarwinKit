/**
 * Tests for constraint presets
 */

import { assertEquals } from "@std/assert";
import { CONSTRAINT_PRESETS, getPreset } from "./constraint-presets.ts";

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
