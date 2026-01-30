/**
 * Tests for SQL utilities
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { DuckDBInstance } from "@duckdb/node-api";
import type { WorkspaceCrossDatasetRule } from "@dwkt/domain";
import { assertEquals } from "@std/assert";
import {
  findForeignKeyRule,
  formatNullValues,
  type ParsedErrorInfo,
  type ParsedErrorType,
  parseDuckDBError,
  sanitizeTableName,
} from "./sql.ts";

Deno.test("sanitizeTableName - replaces special characters with underscores", () => {
  assertEquals(sanitizeTableName("my-dataset"), "my_dataset");
  assertEquals(sanitizeTableName("data.csv"), "data_csv");
  assertEquals(sanitizeTableName("events 2024"), "events_2024");
  assertEquals(sanitizeTableName("table@name!"), "table_name_");
});

Deno.test("sanitizeTableName - preserves valid characters", () => {
  assertEquals(sanitizeTableName("valid_name"), "valid_name");
  assertEquals(sanitizeTableName("Table123"), "Table123");
  assertEquals(sanitizeTableName("_underscore"), "_underscore");
});

Deno.test("formatNullValues - formats array for DuckDB nullstr", () => {
  assertEquals(formatNullValues(["NA", "N/A", ""]), "'NA', 'N/A', ''");
  assertEquals(formatNullValues(["NULL"]), "'NULL'");
  assertEquals(formatNullValues([]), "");
});

Deno.test("formatNullValues - escapes quotes in values", () => {
  assertEquals(formatNullValues(["it's null"]), "'it''s null'");
});

// parseDuckDBError tests

Deno.test("parseDuckDBError - unknown error type", () => {
  const error = new Error("Some other database error occurred");
  const result = parseDuckDBError(error);

  assertEquals(result.type, "unknown");
  assertEquals(result.message, "Some other database error occurred");
});

Deno.test("parseDuckDBError - empty error message", () => {
  const error = new Error("");
  const result = parseDuckDBError(error);

  assertEquals(result.type, "unknown");
  assertEquals(result.message, "");
});

// Real DuckDB constraint violation tests
// These trigger actual violations to verify parsing against runtime behavior.
// If these tests fail after a DuckDB upgrade, update the regex patterns in parseDuckDBError.

interface ConstraintTestCase {
  name: string;
  setup: (conn: DuckDBConnection) => Promise<unknown>;
  trigger: (conn: DuckDBConnection) => Promise<unknown>;
  expected: {
    type: ParsedErrorType;
    value?: string;
    fieldName?: string;
  };
}

const constraintTestCases: ConstraintTestCase[] = [
  {
    name: "primary key violation",
    setup: async (conn) => {
      await conn.run("CREATE TABLE t (id VARCHAR PRIMARY KEY)");
      await conn.run("INSERT INTO t VALUES ('E1')");
    },
    trigger: (conn) => conn.run("INSERT INTO t VALUES ('E1')"),
    expected: { type: "primary-key", value: "E1" },
  },
  {
    name: "unique constraint violation",
    setup: async (conn) => {
      await conn.run("CREATE TABLE t (id VARCHAR, code VARCHAR UNIQUE)");
      await conn.run("INSERT INTO t VALUES ('1', 'ABC')");
    },
    trigger: (conn) => conn.run("INSERT INTO t VALUES ('2', 'ABC')"),
    expected: { type: "primary-key", value: "ABC" },
  },
  {
    name: "NOT NULL violation",
    setup: (conn) => conn.run("CREATE TABLE t (id VARCHAR NOT NULL)"),
    trigger: (conn) => conn.run("INSERT INTO t VALUES (NULL)"),
    expected: { type: "not-null", fieldName: "id" },
  },
  {
    name: "ENUM violation",
    setup: async (conn) => {
      await conn.run("CREATE TYPE e AS ENUM ('a', 'b')");
      await conn.run("CREATE TABLE t (status e)");
    },
    trigger: (conn) => conn.run("INSERT INTO t VALUES ('invalid')"),
    expected: { type: "enum", value: "invalid" },
  },
  {
    name: "foreign key violation",
    setup: async (conn) => {
      await conn.run("CREATE TABLE parent (eventID VARCHAR PRIMARY KEY)");
      await conn.run("INSERT INTO parent VALUES ('E1')");
      await conn.run(
        "CREATE TABLE t (id VARCHAR, eventID VARCHAR REFERENCES parent(eventID))",
      );
    },
    trigger: (conn) => conn.run("INSERT INTO t VALUES ('C1', 'E999')"),
    expected: { type: "foreign-key", fieldName: "eventID", value: "E999" },
  },
  {
    name: "CHECK constraint violation",
    setup: (conn) => conn.run("CREATE TABLE t (lat DOUBLE CHECK (lat >= -90 AND lat <= 90))"),
    trigger: (conn) => conn.run("INSERT INTO t VALUES (100.0)"),
    expected: { type: "check" },
  },
];

async function runConstraintTest(testCase: ConstraintTestCase): Promise<void> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  try {
    await testCase.setup(connection);
    await testCase.trigger(connection);
    throw new Error(`Expected constraint violation for: ${testCase.name}`);
  } catch (error) {
    if (!(error instanceof Error) || error.message.includes("Expected")) {
      throw error;
    }

    const result = parseDuckDBError(error);
    assertParsedError(result, testCase.expected, testCase.name);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

function assertParsedError(
  actual: ParsedErrorInfo,
  expected: ConstraintTestCase["expected"],
  context: string,
): void {
  assertEquals(actual.type, expected.type, `${context}: type mismatch`);
  if (expected.value !== undefined) {
    assertEquals(actual.value, expected.value, `${context}: value mismatch`);
  }
  if (expected.fieldName !== undefined) {
    assertEquals(
      actual.fieldName,
      expected.fieldName,
      `${context}: fieldName mismatch`,
    );
  }
}

for (const testCase of constraintTestCases) {
  Deno.test(`parseDuckDBError - ${testCase.name}`, () => runConstraintTest(testCase));
}

// findForeignKeyRule tests

const sampleRules: WorkspaceCrossDatasetRule[] = [
  {
    ruleType: "foreignKey",
    sourceDataset: "occurrence",
    sourceField: "eventID",
    targetDataset: "event",
    targetField: "eventID",
    enforcement: "required",
  },
  {
    ruleType: "foreignKey",
    sourceDataset: "measurement",
    sourceField: "occurrenceID",
    targetDataset: "occurrence",
    targetField: "occurrenceID",
    enforcement: "recommended",
  },
  {
    ruleType: "referentialIntegrity",
    sourceDataset: "event",
    sourceField: "eventID",
    targetDataset: "event",
    targetField: "eventID",
  },
];

Deno.test("findForeignKeyRule - finds matching rule", () => {
  const result = findForeignKeyRule("occurrence", "eventID", sampleRules);

  assertEquals(result?.targetDataset, "event");
  assertEquals(result?.targetField, "eventID");
  assertEquals(result?.enforcement, "required");
});

Deno.test("findForeignKeyRule - returns enforcement from rule", () => {
  const result = findForeignKeyRule("measurement", "occurrenceID", sampleRules);

  assertEquals(result?.enforcement, "recommended");
});

Deno.test("findForeignKeyRule - returns undefined for non-matching dataset", () => {
  const result = findForeignKeyRule("nonexistent", "eventID", sampleRules);

  assertEquals(result, undefined);
});

Deno.test("findForeignKeyRule - returns undefined for non-matching field", () => {
  const result = findForeignKeyRule("occurrence", "nonexistentID", sampleRules);

  assertEquals(result, undefined);
});

Deno.test("findForeignKeyRule - ignores referentialIntegrity rules", () => {
  const result = findForeignKeyRule("event", "eventID", sampleRules);

  assertEquals(result, undefined);
});

Deno.test("findForeignKeyRule - returns undefined when rules are undefined", () => {
  const result = findForeignKeyRule("occurrence", "eventID", undefined);

  assertEquals(result, undefined);
});

Deno.test("findForeignKeyRule - returns undefined when rules are empty", () => {
  const result = findForeignKeyRule("occurrence", "eventID", []);

  assertEquals(result, undefined);
});

Deno.test("findForeignKeyRule - defaults enforcement to required", () => {
  const rulesWithoutEnforcement: WorkspaceCrossDatasetRule[] = [
    {
      ruleType: "foreignKey",
      sourceDataset: "test",
      sourceField: "refID",
      targetDataset: "target",
      targetField: "refID",
    },
  ];

  const result = findForeignKeyRule("test", "refID", rulesWithoutEnforcement);

  assertEquals(result?.enforcement, "required");
});
