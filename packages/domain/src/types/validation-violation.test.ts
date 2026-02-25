/**
 * Tests for validation violation types
 */

import { assertEquals } from "@std/assert";
import {
  partitionFieldViolations,
  RequiredFieldViolation,
  requirementToSeverity,
} from "./validation-violation.ts";
import {
  MissingFieldViolation,
  partitionSchemaViolations,
  UnmappedColumnViolation,
} from "./schema-violation.ts";
// =============================================================================
// requirementToSeverity Tests
// =============================================================================

Deno.test("requirementToSeverity - maps requirement levels to severities", () => {
  const cases: Array<[Parameters<typeof requirementToSeverity>[0], "error" | "warning" | "info"]> =
    [
      ["required", "error"],
      ["recommended", "warning"],
      ["optional", "info"],
    ];
  for (const [input, expected] of cases) {
    assertEquals(requirementToSeverity(input), expected, input);
  }
});

// =============================================================================
// partitionFieldViolations Tests
// =============================================================================

Deno.test("partitionFieldViolations - groups violations by severity", () => {
  const errorViolation = new RequiredFieldViolation({
    severity: "error",
    fieldName: "eventID",
    targetName: "eventID",
    rowNumber: 1,
    value: "",
    errorMessage: "Required field is empty",
    validatorType: "required",
  });

  const warningViolation = new RequiredFieldViolation({
    severity: "warning",
    fieldName: "scientificName",
    targetName: "scientificName",
    rowNumber: 2,
    value: "",
    errorMessage: "Recommended field is empty",
    validatorType: "required",
  });

  const infoViolation = new RequiredFieldViolation({
    severity: "info",
    fieldName: "kingdom",
    targetName: "kingdom",
    rowNumber: 3,
    value: "",
    errorMessage: "Optional field is empty",
    validatorType: "required",
  });

  const result = partitionFieldViolations([errorViolation, warningViolation, infoViolation]);

  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].fieldName, "eventID");
  assertEquals(result.warnings.length, 1);
  assertEquals(result.warnings[0].fieldName, "scientificName");
  assertEquals(result.info.length, 1);
  assertEquals(result.info[0].fieldName, "kingdom");
});

Deno.test("partitionFieldViolations - empty input returns empty partitions", () => {
  const result = partitionFieldViolations([]);
  assertEquals(result.errors.length, 0);
  assertEquals(result.warnings.length, 0);
  assertEquals(result.info.length, 0);
});

// =============================================================================
// partitionSchemaViolations Tests
// =============================================================================

Deno.test("partitionSchemaViolations - groups violations by severity", () => {
  const errorViolation = new MissingFieldViolation({
    severity: "error",
    fieldName: "eventID",
    targetName: "eventID",
    errorMessage: "Required field missing",
    validatorType: "schema",
    reason: "not_mapped",
  });

  const warningViolation = new MissingFieldViolation({
    severity: "warning",
    fieldName: "scientificName",
    targetName: "scientificName",
    errorMessage: "Recommended field missing",
    validatorType: "schema",
    reason: "not_mapped",
  });

  const infoViolation = new UnmappedColumnViolation({
    severity: "info",
    fieldName: "extraColumn",
    targetName: "extraColumn",
    errorMessage: "Column not mapped",
    validatorType: "schema",
    datasetName: "test",
  });

  const result = partitionSchemaViolations([errorViolation, warningViolation, infoViolation]);

  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].fieldName, "eventID");
  assertEquals(result.warnings.length, 1);
  assertEquals(result.warnings[0].fieldName, "scientificName");
  assertEquals(result.info.length, 1);
  assertEquals(result.info[0].fieldName, "extraColumn");
});

Deno.test("partitionSchemaViolations - empty input returns empty partitions", () => {
  const result = partitionSchemaViolations([]);
  assertEquals(result.errors.length, 0);
  assertEquals(result.warnings.length, 0);
  assertEquals(result.info.length, 0);
});
