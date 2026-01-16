/**
 * Tests for validation violation types
 */

import { assertEquals } from "@std/assert";
import { ErrorSeverity } from "../errors/severity.ts";
import type { EnforcementLevel } from "../specs/validators.ts";
import { enforcementToSeverity, RangeViolation } from "./validation-violation.ts";

// ============================================================================
// enforcementToSeverity Tests
// ============================================================================

type EnforcementToSeverityTestCase = {
  description: string;
  input: EnforcementLevel;
  expected: ErrorSeverity;
};

const enforcementToSeverityTestCases: EnforcementToSeverityTestCase[] = [
  {
    description: "maps required to ERROR",
    input: "required",
    expected: ErrorSeverity.ERROR,
  },
  {
    description: "maps recommended to WARNING",
    input: "recommended",
    expected: ErrorSeverity.WARNING,
  },
  {
    description: "maps optional to INFO",
    input: "optional",
    expected: ErrorSeverity.INFO,
  },
];

Deno.test("enforcementToSeverity", async (t) => {
  for (const testCase of enforcementToSeverityTestCases) {
    await t.step(testCase.description, () => {
      const result = enforcementToSeverity(testCase.input);
      assertEquals(result, testCase.expected);
    });
  }
});

// ============================================================================
// Type Derivation Utilities Tests
// ============================================================================

Deno.test("ViolationFields - creates violations with base fields", () => {
  const violation = new RangeViolation({
    enforcement: "required",
    severity: ErrorSeverity.ERROR,
    fieldName: "latitude",
    targetName: "decimalLatitude",
    rowNumber: 5,
    value: "95.0",
    errorMessage: "Value 95.0 is outside valid range -90 to 90",
    validatorType: "range",
    params: { min: -90, max: 90 },
  });

  assertEquals(violation._tag, "RangeViolation");
  assertEquals(violation.fieldName, "latitude");
  assertEquals(violation.params?.min, -90);
  assertEquals(violation.params?.max, 90);
});
