/**
 * Tests for the spec/profile registry resolution logic.
 */

import { assert, assertEquals, assertExists, assertThrows } from "@std/assert";
import { getResolvedSpec, getSpecNames, PROFILE_REGISTRY, resolveProfile } from "./registry.ts";

// --- getSpecNames ---

Deno.test("getSpecNames - returns known Darwin Core spec names", () => {
  const names = getSpecNames();
  assert(names.includes("Event"), "should include Event");
  assert(names.includes("Occurrence"), "should include Occurrence");
  assert(names.includes("Taxon"), "should include Taxon");
  assert(names.length >= 3, "should have at least 3 specs");
});

// --- getResolvedSpec ---

Deno.test("getResolvedSpec - returns undefined for non-existent ID", () => {
  const result = getResolvedSpec("NonExistentSpec");
  assertEquals(result, undefined);
});

Deno.test("getResolvedSpec - resolves a JSON spec by class name", () => {
  const result = getResolvedSpec("Event");
  assert(result !== undefined, "Event spec should exist");
  assertEquals(result.id, "Event");
  assert(
    Object.keys(result.specFields).length > 0,
    "Event spec should have specFields",
  );
  assertEquals(result.profile, undefined, "JSON-only spec has no profile");
  assertEquals(result.fieldOverrides, {}, "JSON-only spec has no overrides");
});

Deno.test("getResolvedSpec - resolves a TypeScript profile (obis)", () => {
  const result = getResolvedSpec("obis");
  assert(result !== undefined, "OBIS profile should resolve");
  assertEquals(result.id, "obis");
  assertEquals(result.profile, "obis");
  // OBIS extends Occurrence, so should have Occurrence's specFields
  assert(
    Object.keys(result.specFields).length > 0,
    "OBIS should inherit specFields from Occurrence",
  );
  assert(
    Object.keys(result.fieldOverrides).length > 0,
    "OBIS should have fieldOverrides",
  );
});

Deno.test("getResolvedSpec - resolves obis-event with merged overrides", () => {
  const result = getResolvedSpec("obis-event");
  assert(result !== undefined, "obis-event profile should resolve");
  assertEquals(result.id, "obis-event");
  assertEquals(result.profile, "obis-event");
  // obis-event extends obis which extends Occurrence — but obis-event
  // itself extends Event. The chain should resolve to Event as the base spec.
  assert(
    Object.keys(result.specFields).length > 0,
    "obis-event should have specFields from base spec",
  );
  // Should have overrides from both obis and obis-event profiles
  assert(
    "decimalLatitude" in result.fieldOverrides,
    "should inherit decimalLatitude override",
  );
});

// --- resolveProfile ---

Deno.test("resolveProfile - composite key resolves obis + Event to obis-event", () => {
  const result = resolveProfile("obis", "Event");
  assert(result !== undefined, "obis + Event should resolve");
  assertEquals(result.id, "obis-event");
});

Deno.test("resolveProfile - falls back to JSON spec when no composite key matches", () => {
  const result = resolveProfile("obis", "Taxon");
  assert(result !== undefined, "obis + Taxon should fall back to Taxon JSON spec");
  assertEquals(result.id, "Taxon");
  assertEquals(result.profile, undefined, "no OBIS-Taxon profile exists");
});

Deno.test("resolveProfile - undefined standard uses class directly", () => {
  const result = resolveProfile(undefined, "Event");
  assert(result !== undefined);
  assertEquals(result.id, "Event");
});

Deno.test("resolveProfile - unknown variant falls back to base JSON spec", () => {
  const result = resolveProfile("unknown-variant", "Event");
  assert(result !== undefined);
  assertEquals(result.id, "Event");
});

// --- Profile inheritance ---

Deno.test("PROFILE_REGISTRY - obis extends Event, obis-event extends obis", () => {
  const obis = PROFILE_REGISTRY["obis"];
  assert(obis !== undefined);
  assertEquals(obis.extends, "Event");

  const obisEvent = PROFILE_REGISTRY["obis-event"];
  assert(obisEvent !== undefined);
  assertEquals(obisEvent.extends, "obis");
});

// --- Edge cases ---

Deno.test("getResolvedSpec - spec has rawFields populated", () => {
  const result = getResolvedSpec("Event");
  assert(result !== undefined);
  // rawFields should be populated from JSON spec for transform support
  assert(
    result.rawFields !== undefined && Object.keys(result.rawFields).length > 0,
    "Event spec should have rawFields for transform support",
  );
});

// --- Circular inheritance detection ---

Deno.test("getResolvedSpec - throws on circular profile inheritance", () => {
  // Temporarily inject a circular profile: A extends B, B extends A
  const circularA = {
    id: "circular-a",
    name: "Circular A",
    extends: "circular-b",
    fieldOverrides: {},
  };
  const circularB = {
    id: "circular-b",
    name: "Circular B",
    extends: "circular-a",
    fieldOverrides: {},
  };
  // Cast to mutable for test injection only
  const mutableRegistry = PROFILE_REGISTRY as Record<string, typeof circularA>;
  mutableRegistry["circular-a"] = circularA;
  mutableRegistry["circular-b"] = circularB;
  try {
    assertThrows(
      () => getResolvedSpec("circular-a"),
      Error,
      "Circular profile inheritance detected",
    );
  } finally {
    delete mutableRegistry["circular-a"];
    delete mutableRegistry["circular-b"];
  }
});

// --- resolveProfile edge cases ---

Deno.test("resolveProfile - unknown variant and unknown class returns undefined", () => {
  const result = resolveProfile("unknown-variant", "NonExistentClass");
  assertEquals(result, undefined);
});

// --- Warnings propagation ---

Deno.test("getResolvedSpec - resolved spec includes warnings array", () => {
  const result = getResolvedSpec("obis");
  assert(result !== undefined);
  // warnings should be present (may be empty if no normalization issues)
  assert(
    result.warnings === undefined || Array.isArray(result.warnings),
    "warnings should be undefined or an array",
  );
});

// --- OBIS-eMoF profile ---

Deno.test("resolveProfile - obis + ExtendedMeasurementOrFact resolves OBIS-eMoF profile", () => {
  const resolved = resolveProfile("obis", "ExtendedMeasurementOrFact");
  assertExists(resolved);
  assertEquals(resolved.profile, "obis-extendedmeasurementorfact");
});

Deno.test("resolveProfile - OBIS-eMoF profile has datasetRules with oneOfRequired", () => {
  const resolved = resolveProfile("obis", "ExtendedMeasurementOrFact");
  assertExists(resolved);
  assertExists(resolved.datasetRules);
  assertEquals(resolved.datasetRules!.length, 1);
  const rule = resolved.datasetRules![0];
  assertEquals(rule._tag, "oneOfRequired");
});

Deno.test("resolveProfile - OBIS-eMoF profile overrides eventID and occurrenceID to recommended", () => {
  const resolved = resolveProfile("obis", "ExtendedMeasurementOrFact");
  assertExists(resolved);
  assertExists(resolved.fieldOverrides.eventID);
  assertEquals(resolved.fieldOverrides.eventID.requirement, "recommended");
  assertExists(resolved.fieldOverrides.occurrenceID);
  assertEquals(resolved.fieldOverrides.occurrenceID.requirement, "recommended");
});
