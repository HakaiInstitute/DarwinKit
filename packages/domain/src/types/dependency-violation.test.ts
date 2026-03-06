import { assertEquals } from "@std/assert";
import { DependencyViolation } from "./validation-violation.ts";

Deno.test("DependencyViolation - creates tagged instance", () => {
  const v = new DependencyViolation({
    severity: "error",
    fieldName: "eventID, occurrenceID",
    targetName: "eventID, occurrenceID",
    rowNumber: 1,
    value: "",
    errorMessage: 'At least one of "eventID" or "occurrenceID" must be present',
  });
  assertEquals(v._tag, "DependencyViolation");
  assertEquals(v.severity, "error");
  assertEquals(v.fieldName, "eventID, occurrenceID");
  assertEquals(v.rowNumber, 1);
});
