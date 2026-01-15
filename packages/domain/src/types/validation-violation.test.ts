/**
 * Tests for validation violation types
 */

import { assertEquals } from "@std/assert";
import type { EnforcementLevel } from "../specs/validators.ts";
import { ErrorSeverity } from "../errors/severity.ts";
import { enforcementToSeverity } from "./validation-violation.ts";

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
