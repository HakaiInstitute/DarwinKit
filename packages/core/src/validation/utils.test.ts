/**
 * Unit tests for validation/utils.ts
 *
 * Tests cover:
 * - Violation partitioning by enforcement level
 * - Summary statistics calculation
 * - DuckDB error parsing (all 6 error types)
 * - Fuzzy value suggestion matching
 */

import { assert, assertEquals } from "@std/assert";
import type { DatasetValidationResult } from "@dwkt/domain";
import {
  calculateSummary,
  findSuggestedValue,
  parseDuckDBError,
  partitionViolations,
} from "./utils.ts";
import { createMockRangeViolation, createMockViolation } from "./test-utils.ts";

// ============================================================================
// Violation Partitioning Tests
// ============================================================================

Deno.test("partitionViolations - empty array", () => {
  const result = partitionViolations([]);

  assertEquals(result.errors.length, 0);
  assertEquals(result.warnings.length, 0);
  assertEquals(result.info.length, 0);
});

Deno.test("partitionViolations - single required violation", () => {
  const violations = [createMockViolation("required")];

  const result = partitionViolations(violations);

  assertEquals(result.errors.length, 1);
  assertEquals(result.warnings.length, 0);
  assertEquals(result.info.length, 0);
});

Deno.test("partitionViolations - single recommended violation", () => {
  const violations = [createMockViolation("recommended")];

  const result = partitionViolations(violations);

  assertEquals(result.errors.length, 0);
  assertEquals(result.warnings.length, 1);
  assertEquals(result.info.length, 0);
});

Deno.test("partitionViolations - single optional violation", () => {
  const violations = [createMockViolation("optional")];

  const result = partitionViolations(violations);

  assertEquals(result.errors.length, 0);
  assertEquals(result.warnings.length, 0);
  assertEquals(result.info.length, 1);
});

Deno.test("partitionViolations - mixed enforcement levels", () => {
  const violations = [
    createMockViolation("required", { rowNumber: 1 }),
    createMockViolation("required", { rowNumber: 2 }),
    createMockViolation("recommended", { rowNumber: 3 }),
    createMockViolation("recommended", { rowNumber: 4 }),
    createMockViolation("optional", { rowNumber: 5 }),
  ];

  const result = partitionViolations(violations);

  assertEquals(result.errors.length, 2);
  assertEquals(result.warnings.length, 2);
  assertEquals(result.info.length, 1);

  // Verify order is preserved
  assertEquals(result.errors[0].rowNumber, 1);
  assertEquals(result.errors[1].rowNumber, 2);
  assertEquals(result.warnings[0].rowNumber, 3);
  assertEquals(result.warnings[1].rowNumber, 4);
  assertEquals(result.info[0].rowNumber, 5);
});

// ============================================================================
// Summary Statistics Tests
// ============================================================================

Deno.test("calculateSummary - empty results", () => {
  const summary = calculateSummary([]);

  assertEquals(summary.totalDatasets, 0);
  assertEquals(summary.datasetsPassedCount, 0);
  assertEquals(summary.datasetsWithWarningsCount, 0);
  assertEquals(summary.datasetsFailedCount, 0);
  assertEquals(summary.totalErrors, 0);
  assertEquals(summary.totalWarnings, 0);
  assertEquals(summary.totalInfo, 0);
  assertEquals(summary.totalRowsProcessed, 0);
});

Deno.test("calculateSummary - single passing dataset", () => {
  const results: DatasetValidationResult[] = [
    {
      datasetName: "test",
      status: "pass",
      rowsProcessed: 100,
      violations: {
        errors: [],
        warnings: [],
        info: [],
      },
      typeErrors: [],
      requiredFieldErrors: [],
      warnings: [],
    },
  ];

  const summary = calculateSummary(results);

  assertEquals(summary.totalDatasets, 1);
  assertEquals(summary.datasetsPassedCount, 1);
  assertEquals(summary.datasetsWithWarningsCount, 0);
  assertEquals(summary.datasetsFailedCount, 0);
  assertEquals(summary.totalErrors, 0);
  assertEquals(summary.totalWarnings, 0);
  assertEquals(summary.totalInfo, 0);
  assertEquals(summary.totalRowsProcessed, 100);
});

Deno.test("calculateSummary - single dataset with warnings", () => {
  const results: DatasetValidationResult[] = [
    {
      datasetName: "test",
      status: "warn",
      rowsProcessed: 50,
      violations: {
        errors: [],
        warnings: [createMockViolation("recommended")],
        info: [],
      },
      typeErrors: [],
      requiredFieldErrors: [],
      warnings: [],
    },
  ];

  const summary = calculateSummary(results);

  assertEquals(summary.totalDatasets, 1);
  assertEquals(summary.datasetsPassedCount, 0);
  assertEquals(summary.datasetsWithWarningsCount, 1);
  assertEquals(summary.datasetsFailedCount, 0);
  assertEquals(summary.totalErrors, 0);
  assertEquals(summary.totalWarnings, 1);
  assertEquals(summary.totalInfo, 0);
  assertEquals(summary.totalRowsProcessed, 50);
});

Deno.test("calculateSummary - single failing dataset", () => {
  const results: DatasetValidationResult[] = [
    {
      datasetName: "test",
      status: "fail",
      rowsProcessed: 75,
      violations: {
        errors: [
          createMockViolation("required"),
          createMockViolation("required"),
        ],
        warnings: [],
        info: [],
      },
      typeErrors: [],
      requiredFieldErrors: [],
      warnings: [],
    },
  ];

  const summary = calculateSummary(results);

  assertEquals(summary.totalDatasets, 1);
  assertEquals(summary.datasetsPassedCount, 0);
  assertEquals(summary.datasetsWithWarningsCount, 0);
  assertEquals(summary.datasetsFailedCount, 1);
  assertEquals(summary.totalErrors, 2);
  assertEquals(summary.totalWarnings, 0);
  assertEquals(summary.totalInfo, 0);
  assertEquals(summary.totalRowsProcessed, 75);
});

Deno.test("calculateSummary - multiple datasets mixed statuses", () => {
  const results: DatasetValidationResult[] = [
    {
      datasetName: "passed",
      status: "pass",
      rowsProcessed: 100,
      violations: { errors: [], warnings: [], info: [] },
      typeErrors: [],
      requiredFieldErrors: [],
      warnings: [],
    },
    {
      datasetName: "warned",
      status: "warn",
      rowsProcessed: 50,
      violations: {
        errors: [],
        warnings: [createMockViolation("recommended")],
        info: [createMockViolation("optional")],
      },
      typeErrors: [],
      requiredFieldErrors: [],
      warnings: [],
    },
    {
      datasetName: "failed",
      status: "fail",
      rowsProcessed: 75,
      violations: {
        errors: [createMockViolation("required"), createMockViolation("required")],
        warnings: [],
        info: [],
      },
      typeErrors: [],
      requiredFieldErrors: [],
      warnings: [],
    },
  ];

  const summary = calculateSummary(results);

  assertEquals(summary.totalDatasets, 3);
  assertEquals(summary.datasetsPassedCount, 1);
  assertEquals(summary.datasetsWithWarningsCount, 1);
  assertEquals(summary.datasetsFailedCount, 1);
  assertEquals(summary.totalErrors, 2);
  assertEquals(summary.totalWarnings, 1);
  assertEquals(summary.totalInfo, 1);
  assertEquals(summary.totalRowsProcessed, 225);
});

Deno.test("calculateSummary - backward compatibility with old error fields", () => {
  const results: DatasetValidationResult[] = [
    {
      datasetName: "test",
      status: "fail",
      rowsProcessed: 100,
      violations: {
        errors: [createMockViolation("required")],
        warnings: [],
        info: [],
      },
      // Old-style error fields (backward compatibility)
      typeErrors: [{} as any, {} as any], // 2 type errors
      requiredFieldErrors: [{} as any], // 1 required field error
      warnings: [{} as any, {} as any, {} as any], // 3 warnings
    },
  ];

  const summary = calculateSummary(results);

  // New violations: 1 error
  // Old violations: 2 type errors + 1 required field error = 3 errors
  // Total: 4 errors
  assertEquals(summary.totalErrors, 4);

  // New violations: 0 warnings
  // Old violations: 3 warnings
  // Total: 3 warnings
  assertEquals(summary.totalWarnings, 3);
});

// ============================================================================
// DuckDB Error Parsing Tests
// ============================================================================

Deno.test("parseDuckDBError - primary key violations", async (t) => {
  await t.step("format 1: duplicate key", () => {
    const error = new Error(
      'PRIMARY KEY or UNIQUE constraint violation: duplicate key "E1"',
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "primary-key");
    assertEquals(result.value, "E1");
    assert(result.message.includes("PRIMARY KEY"));
  });

  await t.step("format 2: violates primary key constraint", () => {
    const error = new Error(
      'Duplicate key "eventID: E1" violates primary key constraint.',
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "primary-key");
    assertEquals(result.value, "E1");
  });

  await t.step("format 3: duplicate key without field prefix", () => {
    const error = new Error(
      'Duplicate key "ABC123" violates primary key constraint',
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "primary-key");
    assertEquals(result.value, "ABC123");
  });
});

Deno.test("parseDuckDBError - not null constraint violations", async (t) => {
  await t.step("with field name", () => {
    const error = new Error(
      "NOT NULL constraint failed: decimalLatitude",
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "not-null");
    assertEquals(result.fieldName, "decimalLatitude");
  });

  await t.step("with colon separator", () => {
    const error = new Error(
      "NOT NULL constraint failed: country",
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "not-null");
    assertEquals(result.fieldName, "country");
  });

  await t.step("case insensitive match", () => {
    const error = new Error(
      "not null constraint failed: eventDate",
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "not-null");
    assertEquals(result.fieldName, "eventDate");
  });
});

Deno.test("parseDuckDBError - enum constraint violations", async (t) => {
  await t.step("typical enum conversion error", () => {
    const error = new Error(
      "Conversion Error: Could not convert string 'InvalidBasis' to UINT8 when casting from source column basisOfRecord",
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "enum");
    assertEquals(result.value, "InvalidBasis");
    assertEquals(result.fieldName, "basisOfRecord");
  });

  await t.step("enum error with spaces", () => {
    const error = new Error(
      "Conversion Error: Could not convert string 'Not A Valid Value' to UINT8 when casting from source column status",
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "enum");
    assertEquals(result.value, "Not A Valid Value");
    assertEquals(result.fieldName, "status");
  });
});

Deno.test("parseDuckDBError - foreign key constraint violations", async (t) => {
  await t.step("format 1: with field name and value", () => {
    const error = new Error(
      'Violates foreign key constraint because key "eventID: NA_FB_2020-11-17_FQ1" does not exist in the referenced table',
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "foreign-key");
    assertEquals(result.fieldName, "eventID");
    assertEquals(result.value, "NA_FB_2020-11-17_FQ1");
  });

  await t.step("format 2: with just the key value", () => {
    const error = new Error(
      'Violates foreign key constraint because key "E123" does not exist in the referenced table',
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "foreign-key");
    assertEquals(result.value, "E123");
  });

  await t.step("format 3: generic foreign key error", () => {
    const error = new Error(
      "FOREIGN KEY constraint violated",
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "foreign-key");
    assertEquals(result.fieldName, undefined);
    assertEquals(result.value, undefined);
  });

  await t.step("case insensitive match", () => {
    const error = new Error(
      "foreign key constraint violated",
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "foreign-key");
  });
});

Deno.test("parseDuckDBError - check constraint violations", async (t) => {
  await t.step("basic check constraint", () => {
    const error = new Error(
      "CHECK constraint failed: latitude must be between -90 and 90",
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "check");
    assert(result.message.includes("CHECK constraint"));
  });

  await t.step("case insensitive match", () => {
    const error = new Error(
      "check constraint violated",
    );
    const result = parseDuckDBError(error);

    assertEquals(result.type, "check");
  });
});

Deno.test("parseDuckDBError - unknown error types", () => {
  const error = new Error(
    "Some unexpected database error occurred",
  );
  const result = parseDuckDBError(error);

  assertEquals(result.type, "unknown");
  assertEquals(result.message, "Some unexpected database error occurred");
  assertEquals(result.fieldName, undefined);
  assertEquals(result.value, undefined);
});

// ============================================================================
// Fuzzy Value Suggestion Tests
// ============================================================================

Deno.test("findSuggestedValue - exact match exists", () => {
  const result = findSuggestedValue(
    "Canada",
    ["Canada", "USA", "Mexico"],
  );

  assertEquals(result, "Canada");
});

Deno.test("findSuggestedValue - close match within threshold", () => {
  const result = findSuggestedValue(
    "Canad",
    ["Canada", "USA", "Mexico"],
    3,
  );

  assertEquals(result, "Canada");
});

Deno.test("findSuggestedValue - typo correction", () => {
  const result = findSuggestedValue(
    "Mexic",
    ["Canada", "USA", "Mexico"],
    3,
  );

  assertEquals(result, "Mexico");
});

Deno.test("findSuggestedValue - case difference", () => {
  const result = findSuggestedValue(
    "canada",
    ["Canada", "USA", "Mexico"],
    3,
  );

  assertEquals(result, "Canada");
});

Deno.test("findSuggestedValue - no match within threshold", () => {
  const result = findSuggestedValue(
    "Japan",
    ["Canada", "USA", "Mexico"],
    3,
  );

  assertEquals(result, undefined);
});

Deno.test("findSuggestedValue - empty allowed values", () => {
  const result = findSuggestedValue(
    "Canada",
    [],
    3,
  );

  assertEquals(result, undefined);
});

Deno.test("findSuggestedValue - custom threshold", () => {
  // "Canda" is 1 edit away from "Canada" (missing 'a')
  const resultStrict = findSuggestedValue(
    "Canda",
    ["Canada", "USA"],
    1,
  );
  assertEquals(resultStrict, "Canada");

  // "Cnda" is 2 edits away from "Canada"
  const resultLoose = findSuggestedValue(
    "Cnda",
    ["Canada", "USA"],
    3,
  );
  assertEquals(resultLoose, "Canada");

  // Too far even with loose threshold
  const resultTooFar = findSuggestedValue(
    "Xyz",
    ["Canada", "USA"],
    2,
  );
  assertEquals(resultTooFar, undefined);
});

Deno.test("findSuggestedValue - picks closest match", () => {
  const result = findSuggestedValue(
    "Canadaa",
    ["Canada", "Canadas", "Canadian"],
    5,
  );

  // "Canadaa" is 1 edit from "Canada", 2 from "Canadas", 3 from "Canadian"
  assertEquals(result, "Canada");
});

Deno.test("findSuggestedValue - vocabulary terms", () => {
  const vocabularyTerms = [
    "HumanObservation",
    "PreservedSpecimen",
    "MachineObservation",
    "LivingSpecimen",
  ];

  // Close match
  const result1 = findSuggestedValue("HumanObservasion", vocabularyTerms, 3);
  assertEquals(result1, "HumanObservation");

  // Another close match
  const result2 = findSuggestedValue("PreservedSpecimen", vocabularyTerms, 3);
  assertEquals(result2, "PreservedSpecimen");

  // No match
  const result3 = findSuggestedValue("FossilSpecimen", vocabularyTerms, 3);
  assertEquals(result3, undefined);
});
