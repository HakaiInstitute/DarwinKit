import { assertEquals } from "@std/assert";
import { OneOfRequiredViolation } from "./validation-violation.ts";

Deno.test("OneOfRequiredViolation - creates tagged instance", () => {
  const v = new OneOfRequiredViolation({
    severity: "error",
    fieldName: "eventID, occurrenceID",
    targetName: "eventID, occurrenceID",
    rowNumber: 1,
    value: "",
    errorMessage: 'At least one of "eventID" or "occurrenceID" must be present',
  });
  assertEquals(v._tag, "OneOfRequiredViolation");
  assertEquals(v.severity, "error");
  assertEquals(v.fieldName, "eventID, occurrenceID");
  assertEquals(v.rowNumber, 1);
});
