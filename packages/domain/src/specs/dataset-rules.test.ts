import { assertEquals } from "@std/assert";
import { DependencyRule } from "./dataset-rules.ts";

Deno.test("DependencyRule has correct tag", () => {
  const rule = new DependencyRule({
    require: { oneOf: ["eventID", "occurrenceID"] },
    level: "required",
  });
  assertEquals(rule._tag, "dependency");
});
