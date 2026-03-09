import { assertEquals } from "@std/assert";
import type { Profile, ResolvedSpec } from "../schemas/spec-types.ts";
import { DependencyRule } from "./dataset-rules.ts";

Deno.test("Profile and ResolvedSpec accept datasetRules with DependencyRule", () => {
  const rule = new DependencyRule({
    require: { oneOf: ["eventID", "occurrenceID"] },
    level: "required",
  });

  const profile: Profile = {
    id: "test-profile",
    name: "Test",
    fieldOverrides: {},
    datasetRules: [rule],
  };

  const spec: ResolvedSpec = {
    id: "test",
    name: "Test",
    spec: "Test",
    fieldOverrides: {},
    specFields: {},
    datasetRules: [rule],
  };

  assertEquals(profile.datasetRules![0]._tag, "dependency");
  assertEquals(spec.datasetRules![0]._tag, "dependency");
});
