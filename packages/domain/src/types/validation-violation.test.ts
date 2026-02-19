/**
 * Tests for validation violation types
 */

import { assertEquals } from "@std/assert";
import {
  enforcementToSeverity,
  partitionFieldViolations,
  RequiredFieldViolation,
} from "./validation-violation.ts";
import {
  MissingFieldViolation,
  partitionSchemaViolations,
  UnmappedColumnViolation,
} from "./schema-violation.ts";
import { ErrorSeverity } from "../errors/severity.ts";

// =============================================================================
// enforcementToSeverity Tests
// =============================================================================

Deno.test("enforcementToSeverity - maps required to ERROR", () => {
  assertEquals(enforcementToSeverity("required"), ErrorSeverity.ERROR);
});

Deno.test("enforcementToSeverity - maps recommended to WARNING", () => {
  assertEquals(enforcementToSeverity("recommended"), ErrorSeverity.WARNING);
});

Deno.test("enforcementToSeverity - maps optional to INFO", () => {
  assertEquals(enforcementToSeverity("optional"), ErrorSeverity.INFO);
});

// =============================================================================
// partitionFieldViolations Tests
// =============================================================================

Deno.test("partitionFieldViolations - groups violations by severity", () => {
  const errorViolation = new RequiredFieldViolation({
    enforcement: "required",
    severity: "error",
    fieldName: "eventID",
    targetName: "eventID",
    rowNumber: 1,
    value: "",
    errorMessage: "Required field is empty",
    validatorType: "required",
  });

  const warningViolation = new RequiredFieldViolation({
    enforcement: "recommended",
    severity: "warning",
    fieldName: "scientificName",
    targetName: "scientificName",
    rowNumber: 2,
    value: "",
    errorMessage: "Recommended field is empty",
    validatorType: "required",
  });

  const infoViolation = new RequiredFieldViolation({
    enforcement: "optional",
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
    enforcement: "required",
    severity: "error",
    fieldName: "eventID",
    targetName: "eventID",
    errorMessage: "Required field missing",
    validatorType: "schema",
    reason: "not_mapped",
  });

  const warningViolation = new MissingFieldViolation({
    enforcement: "recommended",
    severity: "warning",
    fieldName: "scientificName",
    targetName: "scientificName",
    errorMessage: "Recommended field missing",
    validatorType: "schema",
    reason: "not_mapped",
  });

  const infoViolation = new UnmappedColumnViolation({
    enforcement: "optional",
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
