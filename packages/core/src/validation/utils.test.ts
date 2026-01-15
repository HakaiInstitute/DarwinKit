/**
 * Unit tests for validation/utils.ts
 *
 * Tests cover:
 * - Violation partitioning by enforcement level
 * - Summary statistics calculation
 * - DuckDB error parsing (all 6 error types)
 * - Fuzzy value suggestion matching
 */

import type { EnforcementLevel } from "@dwkt/domain";
import { assert, assertEquals } from "@std/assert";
import {
  createMockDatasetValidationResult,
  createMockSchemaViolation,
  createMockViolation,
} from "./test-utils.ts";
import {
  calculateSummary,
  findSuggestedValue,
  parseDuckDBError,
  partitionFieldViolations,
} from "./utils.ts";

// ============================================================================
// Violation Partitioning Tests
// ============================================================================

type PartitionTestCase = {
  description: string;
  violations: Array<{ enforcement: EnforcementLevel; rowNumber?: number }>;
  expected: {
    errors: number;
    warnings: number;
    info: number;
  };
  verifyOrder?: boolean;
};

const partitionFieldViolationsTestCases: PartitionTestCase[] = [
  {
    description: "empty array",
    violations: [],
    expected: { errors: 0, warnings: 0, info: 0 },
  },
  {
    description: "single required violation",
    violations: [{ enforcement: "required" }],
    expected: { errors: 1, warnings: 0, info: 0 },
  },
  {
    description: "single recommended violation",
    violations: [{ enforcement: "recommended" }],
    expected: { errors: 0, warnings: 1, info: 0 },
  },
  {
    description: "single optional violation",
    violations: [{ enforcement: "optional" }],
    expected: { errors: 0, warnings: 0, info: 1 },
  },
  {
    description: "mixed enforcement levels",
    violations: [
      { enforcement: "required", rowNumber: 1 },
      { enforcement: "required", rowNumber: 2 },
      { enforcement: "recommended", rowNumber: 3 },
      { enforcement: "recommended", rowNumber: 4 },
      { enforcement: "optional", rowNumber: 5 },
    ],
    expected: { errors: 2, warnings: 2, info: 1 },
    verifyOrder: true,
  },
];

Deno.test("partitionFieldViolations", async (t) => {
  for (const testCase of partitionFieldViolationsTestCases) {
    await t.step(testCase.description, () => {
      const violations = testCase.violations.map((v) =>
        createMockViolation(v.enforcement, { rowNumber: v.rowNumber })
      );

      const result = partitionFieldViolations(violations);

      assertEquals(result.errors.length, testCase.expected.errors);
      assertEquals(result.warnings.length, testCase.expected.warnings);
      assertEquals(result.info.length, testCase.expected.info);

      // Verify order is preserved for mixed enforcement test
      if (testCase.verifyOrder && testCase.violations.length > 0) {
        assertEquals(result.errors[0].rowNumber, 1);
        assertEquals(result.errors[1].rowNumber, 2);
        assertEquals(result.warnings[0].rowNumber, 3);
        assertEquals(result.warnings[1].rowNumber, 4);
        assertEquals(result.info[0].rowNumber, 5);
      }
    });
  }
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
  const results = [
    createMockDatasetValidationResult({
      datasetName: "test",
      status: "pass",
      rowsProcessed: 100,
    }),
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
  const results = [
    createMockDatasetValidationResult({
      datasetName: "test",
      status: "warn",
      rowsProcessed: 50,
      fieldViolations: {
        warnings: [createMockViolation("recommended")],
        errors: [],
        info: [],
      },
    }),
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
  const results = [
    createMockDatasetValidationResult({
      datasetName: "test",
      status: "fail",
      rowsProcessed: 75,
      fieldViolations: {
        errors: [
          createMockViolation("required"),
          createMockViolation("required"),
        ],
        warnings: [],
        info: [],
      },
    }),
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
  const results = [
    createMockDatasetValidationResult({
      datasetName: "passed",
      status: "pass",
      rowsProcessed: 100,
    }),
    createMockDatasetValidationResult({
      datasetName: "warned",
      status: "warn",
      rowsProcessed: 50,
      fieldViolations: {
        warnings: [createMockViolation("recommended")],
        info: [createMockViolation("optional")],
        errors: [],
      },
    }),
    createMockDatasetValidationResult({
      datasetName: "failed",
      status: "fail",
      rowsProcessed: 75,
      fieldViolations: {
        errors: [createMockViolation("required"), createMockViolation("required")],
        warnings: [],
        info: [],
      },
    }),
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

Deno.test("calculateSummary - counts both schema and field violations", () => {
  const results = [
    createMockDatasetValidationResult({
      datasetName: "test",
      status: "fail",
      rowsProcessed: 100,
      schemaViolations: {
        errors: [createMockSchemaViolation("required")],
        warnings: [createMockSchemaViolation("recommended")],
        info: [],
      },
      fieldViolations: {
        errors: [createMockViolation("required"), createMockViolation("required")],
        warnings: [createMockViolation("recommended")],
        info: [createMockViolation("optional")],
      },
    }),
  ];

  const summary = calculateSummary(results);

  // Schema violations: 1 error + 1 warning
  // Field violations: 2 errors + 1 warning + 1 info
  // Total: 3 errors, 2 warnings, 1 info
  assertEquals(summary.totalErrors, 3);
  assertEquals(summary.totalWarnings, 2);
  assertEquals(summary.totalInfo, 1);
});

// ============================================================================
// DuckDB Error Parsing Tests
// ============================================================================

type ErrorParseTestCase = {
  description: string;
  errorMessage: string;
  expected: {
    type: "primary-key" | "not-null" | "enum" | "foreign-key" | "check" | "unknown";
    fieldName?: string;
    value?: string;
    messageContains?: string;
  };
};

const primaryKeyErrorTestCases: ErrorParseTestCase[] = [
  {
    description: "format 1: duplicate key",
    errorMessage: 'PRIMARY KEY or UNIQUE constraint violation: duplicate key "E1"',
    expected: {
      type: "primary-key",
      value: "E1",
      messageContains: "PRIMARY KEY",
    },
  },
  {
    description: "format 2: violates primary key constraint",
    errorMessage: 'Duplicate key "eventID: E1" violates primary key constraint.',
    expected: {
      type: "primary-key",
      value: "E1",
    },
  },
  {
    description: "format 3: duplicate key without field prefix",
    errorMessage: 'Duplicate key "ABC123" violates primary key constraint',
    expected: {
      type: "primary-key",
      value: "ABC123",
    },
  },
];

const notNullErrorTestCases: ErrorParseTestCase[] = [
  {
    description: "with field name",
    errorMessage: "NOT NULL constraint failed: decimalLatitude",
    expected: {
      type: "not-null",
      fieldName: "decimalLatitude",
    },
  },
  {
    description: "with colon separator",
    errorMessage: "NOT NULL constraint failed: country",
    expected: {
      type: "not-null",
      fieldName: "country",
    },
  },
  {
    description: "case insensitive match",
    errorMessage: "not null constraint failed: eventDate",
    expected: {
      type: "not-null",
      fieldName: "eventDate",
    },
  },
];

const enumErrorTestCases: ErrorParseTestCase[] = [
  {
    description: "typical enum conversion error",
    errorMessage:
      "Conversion Error: Could not convert string 'InvalidBasis' to UINT8 when casting from source column basisOfRecord",
    expected: {
      type: "enum",
      value: "InvalidBasis",
      fieldName: "basisOfRecord",
    },
  },
  {
    description: "enum error with spaces",
    errorMessage:
      "Conversion Error: Could not convert string 'Not A Valid Value' to UINT8 when casting from source column status",
    expected: {
      type: "enum",
      value: "Not A Valid Value",
      fieldName: "status",
    },
  },
];

const foreignKeyErrorTestCases: ErrorParseTestCase[] = [
  {
    description: "format 1: with field name and value",
    errorMessage:
      'Violates foreign key constraint because key "eventID: NA_FB_2020-11-17_FQ1" does not exist in the referenced table',
    expected: {
      type: "foreign-key",
      fieldName: "eventID",
      value: "NA_FB_2020-11-17_FQ1",
    },
  },
  {
    description: "format 2: with just the key value",
    errorMessage:
      'Violates foreign key constraint because key "E123" does not exist in the referenced table',
    expected: {
      type: "foreign-key",
      value: "E123",
    },
  },
  {
    description: "format 3: generic foreign key error",
    errorMessage: "FOREIGN KEY constraint violated",
    expected: {
      type: "foreign-key",
    },
  },
  {
    description: "case insensitive match",
    errorMessage: "foreign key constraint violated",
    expected: {
      type: "foreign-key",
    },
  },
];

const checkErrorTestCases: ErrorParseTestCase[] = [
  {
    description: "basic check constraint",
    errorMessage: "CHECK constraint failed: latitude must be between -90 and 90",
    expected: {
      type: "check",
      messageContains: "CHECK constraint",
    },
  },
  {
    description: "case insensitive match",
    errorMessage: "check constraint violated",
    expected: {
      type: "check",
    },
  },
];

Deno.test("parseDuckDBError - primary key violations", async (t) => {
  for (const testCase of primaryKeyErrorTestCases) {
    await t.step(testCase.description, () => {
      const error = new Error(testCase.errorMessage);
      const result = parseDuckDBError(error);

      assertEquals(result.type, testCase.expected.type);
      if (testCase.expected.value) {
        assertEquals(result.value, testCase.expected.value);
      }
      if (testCase.expected.messageContains) {
        assert(result.message.includes(testCase.expected.messageContains));
      }
    });
  }
});

Deno.test("parseDuckDBError - not null constraint violations", async (t) => {
  for (const testCase of notNullErrorTestCases) {
    await t.step(testCase.description, () => {
      const error = new Error(testCase.errorMessage);
      const result = parseDuckDBError(error);

      assertEquals(result.type, testCase.expected.type);
      if (testCase.expected.fieldName) {
        assertEquals(result.fieldName, testCase.expected.fieldName);
      }
    });
  }
});

Deno.test("parseDuckDBError - enum constraint violations", async (t) => {
  for (const testCase of enumErrorTestCases) {
    await t.step(testCase.description, () => {
      const error = new Error(testCase.errorMessage);
      const result = parseDuckDBError(error);

      assertEquals(result.type, testCase.expected.type);
      if (testCase.expected.value) {
        assertEquals(result.value, testCase.expected.value);
      }
      if (testCase.expected.fieldName) {
        assertEquals(result.fieldName, testCase.expected.fieldName);
      }
    });
  }
});

Deno.test("parseDuckDBError - foreign key constraint violations", async (t) => {
  for (const testCase of foreignKeyErrorTestCases) {
    await t.step(testCase.description, () => {
      const error = new Error(testCase.errorMessage);
      const result = parseDuckDBError(error);

      assertEquals(result.type, testCase.expected.type);
      if (testCase.expected.fieldName !== undefined) {
        assertEquals(result.fieldName, testCase.expected.fieldName);
      }
      if (testCase.expected.value !== undefined) {
        assertEquals(result.value, testCase.expected.value);
      }
    });
  }
});

Deno.test("parseDuckDBError - check constraint violations", async (t) => {
  for (const testCase of checkErrorTestCases) {
    await t.step(testCase.description, () => {
      const error = new Error(testCase.errorMessage);
      const result = parseDuckDBError(error);

      assertEquals(result.type, testCase.expected.type);
      if (testCase.expected.messageContains) {
        assert(result.message.includes(testCase.expected.messageContains));
      }
    });
  }
});

Deno.test("parseDuckDBError - unknown error types", () => {
  const error = new Error("Some unexpected database error occurred");
  const result = parseDuckDBError(error);

  assertEquals(result.type, "unknown");
  assertEquals(result.message, "Some unexpected database error occurred");
  assertEquals(result.fieldName, undefined);
  assertEquals(result.value, undefined);
});

// ============================================================================
// Fuzzy Value Suggestion Tests
// ============================================================================

type SuggestionTestCase = {
  description: string;
  input: string;
  allowedValues: string[];
  threshold?: number;
  expected: string | undefined;
};

const findSuggestedValueTestCases: SuggestionTestCase[] = [
  // Exact and close matches
  {
    description: "exact match exists",
    input: "Canada",
    allowedValues: ["Canada", "USA", "Mexico"],
    expected: "Canada",
  },
  {
    description: "close match within threshold",
    input: "Canad",
    allowedValues: ["Canada", "USA", "Mexico"],
    threshold: 3,
    expected: "Canada",
  },
  {
    description: "typo correction",
    input: "Mexic",
    allowedValues: ["Canada", "USA", "Mexico"],
    threshold: 3,
    expected: "Mexico",
  },
  {
    description: "case difference",
    input: "canada",
    allowedValues: ["Canada", "USA", "Mexico"],
    threshold: 3,
    expected: "Canada",
  },

  // No match cases
  {
    description: "no match within threshold",
    input: "Japan",
    allowedValues: ["Canada", "USA", "Mexico"],
    threshold: 3,
    expected: undefined,
  },
  {
    description: "empty allowed values",
    input: "Canada",
    allowedValues: [],
    threshold: 3,
    expected: undefined,
  },

  // Custom threshold tests
  {
    description: "custom threshold - strict (distance 1)",
    input: "Canda",
    allowedValues: ["Canada", "USA"],
    threshold: 2,
    expected: "Canada",
  },
  {
    description: "custom threshold - loose (distance 2)",
    input: "Cnda",
    allowedValues: ["Canada", "USA"],
    threshold: 3,
    expected: "Canada",
  },
  {
    description: "custom threshold - too far",
    input: "Xyz",
    allowedValues: ["Canada", "USA"],
    threshold: 2,
    expected: undefined,
  },

  // Picking closest match
  {
    description: "picks closest match",
    input: "Canadaa",
    allowedValues: ["Canada", "Canadas", "Canadian"],
    threshold: 5,
    expected: "Canada",
  },

  // Real-world vocabulary terms
  {
    description: "vocabulary: close match",
    input: "HumanObservasion",
    allowedValues: [
      "HumanObservation",
      "PreservedSpecimen",
      "MachineObservation",
      "LivingSpecimen",
    ],
    threshold: 3,
    expected: "HumanObservation",
  },
  {
    description: "vocabulary: exact match",
    input: "PreservedSpecimen",
    allowedValues: [
      "HumanObservation",
      "PreservedSpecimen",
      "MachineObservation",
      "LivingSpecimen",
    ],
    threshold: 3,
    expected: "PreservedSpecimen",
  },
  {
    description: "vocabulary: no match",
    input: "FossilSpecimen",
    allowedValues: [
      "HumanObservation",
      "PreservedSpecimen",
      "MachineObservation",
      "LivingSpecimen",
    ],
    threshold: 3,
    expected: undefined,
  },
];

Deno.test("findSuggestedValue", async (t) => {
  for (const testCase of findSuggestedValueTestCases) {
    await t.step(testCase.description, () => {
      const result = findSuggestedValue(
        testCase.input,
        testCase.allowedValues,
        testCase.threshold,
      );
      assertEquals(result, testCase.expected);
    });
  }
});
