import { assertEquals } from "@std/assert";
import { OneOfRequiredRule } from "./dataset-rules.ts";

Deno.test("OneOfRequiredRule - creates tagged instance", () => {
  const rule = new OneOfRequiredRule({
    fields: ["eventID", "occurrenceID"],
    level: "required",
  });
  assertEquals(rule._tag, "oneOfRequired");
  assertEquals(rule.fields, ["eventID", "occurrenceID"]);
  assertEquals(rule.level, "required");
  assertEquals(rule.message, undefined);
});

Deno.test("OneOfRequiredRule - with custom message", () => {
  const rule = new OneOfRequiredRule({
    fields: ["eventID", "occurrenceID"],
    level: "required",
    message: 'At least one of "eventID" or "occurrenceID" must be present',
  });
  assertEquals(rule.message, 'At least one of "eventID" or "occurrenceID" must be present');
});
