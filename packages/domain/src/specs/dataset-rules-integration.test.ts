import { assertEquals } from "@std/assert";
import type { Profile, ResolvedSpec } from "../schemas/spec-types.ts";
import { OneOfRequiredRule } from "./dataset-rules.ts";

Deno.test("Profile - accepts datasetRules property", () => {
  const profile: Profile = {
    id: "test-profile",
    name: "Test",
    fieldOverrides: {},
    datasetRules: [
      new OneOfRequiredRule({
        fields: ["eventID", "occurrenceID"],
        level: "required",
      }),
    ],
  };
  assertEquals(profile.datasetRules?.length, 1);
  assertEquals(profile.datasetRules![0]._tag, "oneOfRequired");
});

Deno.test("ResolvedSpec - accepts datasetRules property", () => {
  const spec: ResolvedSpec = {
    id: "test",
    name: "Test",
    spec: "Test",
    fieldOverrides: {},
    specFields: {},
    datasetRules: [
      new OneOfRequiredRule({
        fields: ["eventID", "occurrenceID"],
        level: "required",
      }),
    ],
  };
  assertEquals(spec.datasetRules?.length, 1);
});
