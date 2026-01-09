/**
 * Tests for Profile Registry - resolveDatasetProfile function
 */

import { assertEquals } from "@std/assert";
import type { DatasetConfig } from "../../types/workspace-config.ts";
import { resolveDatasetProfile } from "./registry.ts";

Deno.test("resolveDatasetProfile - resolves from explicit profile", () => {
  const dataset: DatasetConfig = {
    name: "events",
    spec: "dwc-event",
    path: "./test.csv",
    profile: "obis-event", // Explicit profile takes precedence
    fieldMappings: [],
  };

  const profile = resolveDatasetProfile(dataset);

  assertEquals(profile?.id, "obis-event");
  assertEquals(profile?.name, "OBIS Event Core");
});

Deno.test("resolveDatasetProfile - derives from spec when no profile", () => {
  const dataset: DatasetConfig = {
    name: "events",
    spec: "dwc-event", // Will derive "Event" profile
    path: "./test.csv",
    fieldMappings: [],
  };

  const profile = resolveDatasetProfile(dataset);

  assertEquals(profile?.name, "Event");
});

Deno.test("resolveDatasetProfile - derives Occurrence from spec", () => {
  const dataset: DatasetConfig = {
    name: "occurrences",
    spec: "dwc-occurrence", // Will derive "Occurrence" profile
    path: "./test.csv",
    fieldMappings: [],
  };

  const profile = resolveDatasetProfile(dataset);

  assertEquals(profile?.name, "Occurrence");
});

Deno.test("resolveDatasetProfile - returns undefined when no profile or spec", () => {
  const dataset: DatasetConfig = {
    name: "unknown",
    spec: "invalid-spec", // Invalid spec identifier
    path: "./test.csv",
    fieldMappings: [],
  };

  const profile = resolveDatasetProfile(dataset);

  assertEquals(profile, undefined);
});

Deno.test("resolveDatasetProfile - explicit profile overrides spec", () => {
  const dataset: DatasetConfig = {
    name: "events",
    spec: "dwc-event", // Would derive "Event"
    path: "./test.csv",
    profile: "obis-event", // But explicit profile takes precedence
    fieldMappings: [],
  };

  const profile = resolveDatasetProfile(dataset);

  // Should resolve to OBIS profile, not base Event
  assertEquals(profile?.id, "obis-event");
  assertEquals(profile?.name, "OBIS Event Core");
});

Deno.test("resolveDatasetProfile - handles missing spec gracefully", () => {
  const dataset: DatasetConfig = {
    name: "events",
    spec: "", // Empty spec
    path: "./test.csv",
    fieldMappings: [],
  };

  const profile = resolveDatasetProfile(dataset);

  assertEquals(profile, undefined);
});

Deno.test("resolveDatasetProfile - handles eMOF alias", () => {
  const dataset: DatasetConfig = {
    name: "measurements",
    spec: "dwc-eMOF", // Alias for ExtendedMeasurementOrFact
    path: "./test.csv",
    fieldMappings: [],
  };

  const profile = resolveDatasetProfile(dataset);

  assertEquals(profile?.name, "ExtendedMeasurementOrFact");
});

Deno.test("resolveDatasetProfile - handles extendedMeasurementOrFact spec", () => {
  const dataset: DatasetConfig = {
    name: "measurements",
    spec: "dwc-extendedMeasurementOrFact", // Full name
    path: "./test.csv",
    fieldMappings: [],
  };

  const profile = resolveDatasetProfile(dataset);

  assertEquals(profile?.name, "ExtendedMeasurementOrFact");
});

Deno.test("resolveDatasetProfile - derives Taxon from spec", () => {
  const dataset: DatasetConfig = {
    name: "taxa",
    spec: "dwc-taxon",
    path: "./test.csv",
    fieldMappings: [],
  };

  const profile = resolveDatasetProfile(dataset);

  assertEquals(profile?.name, "Taxon");
});

Deno.test("resolveDatasetProfile - derives dnaDerivedData from spec", () => {
  const dataset: DatasetConfig = {
    name: "dna",
    spec: "dwc-dnaDerivedData",
    path: "./test.csv",
    fieldMappings: [],
  };

  const profile = resolveDatasetProfile(dataset);

  assertEquals(profile?.name, "dnaDerivedData");
});
