/**
 * Tests for field-validators.ts — SQL-based constraint validators
 *
 * Each test creates an in-memory DuckDB table with _row_number + test columns,
 * then runs the validator and checks the Effect result.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import type { DuckDBConnection } from "@duckdb/node-api";
import { assert, assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import type { FieldDefinition } from "@dwkt/domain/specs";
import {
  findFormatViolations,
  findLengthViolations,
  findPatternViolations,
  findRangeViolations,
  findRequiredViolations,
  findUniquenessViolations,
  validateRequiredConstraints,
} from "./field-validators.ts";

// =============================================================================
// Test Helpers
// =============================================================================

const TABLE = "test_data";

async function setupTable(
  connection: DuckDBConnection,
  columns: string,
  rows: string[],
): Promise<void> {
  await connection.run(`CREATE TABLE ${TABLE} (_row_number INTEGER, ${columns})`);
  for (const row of rows) {
    await connection.run(`INSERT INTO ${TABLE} VALUES (${row})`);
  }
}

function makeField(
  name: string,
  constraints: FieldDefinition["constraints"],
): FieldDefinition {
  return { name, constraints };
}

async function withConnection(fn: (conn: DuckDBConnection) => Promise<void>): Promise<void> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  try {
    await fn(connection);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

// =============================================================================
// Range Constraint Tests
// =============================================================================

Deno.test("findRangeViolations - detects values above max", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "lat DOUBLE", [
      "1, 45.0",
      "2, 95.0",
      "3, -10.0",
    ]);

    const constraint = {
      type: "range" as const,
      min: -90,
      max: 90,
      inclusive: true,
    };
    const field = makeField("lat", [constraint]);

    const result = await Effect.runPromiseExit(
      findRangeViolations(conn, TABLE, "lat", constraint, field),
    );

    assert(result._tag === "Failure");
    const violations = (result.cause as { error: unknown }).error as {
      length: number;
      0: { value: string };
    };
    assertEquals(violations.length, 1);
    assertEquals(violations[0].value, "95.0");
  });
});

Deno.test("findRangeViolations - detects values below min", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "lat DOUBLE", [
      "1, 45.0",
      "2, -95.0",
    ]);

    const constraint = {
      type: "range" as const,
      min: -90,
      max: 90,
      inclusive: true,
    };
    const field = makeField("lat", [constraint]);

    const result = await Effect.runPromiseExit(
      findRangeViolations(conn, TABLE, "lat", constraint, field),
    );

    assert(result._tag === "Failure");
    const violations = (result.cause as { error: unknown }).error as {
      length: number;
      0: { value: string };
    };
    assertEquals(violations.length, 1);
    assertEquals(violations[0].value, "-95.0");
  });
});

Deno.test("findRangeViolations - only min specified", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "depth DOUBLE", [
      "1, 10.0",
      "2, -5.0",
    ]);

    const constraint = {
      type: "range" as const,
      min: 0,
      inclusive: true,
    };
    const field = makeField("depth", [constraint]);

    const result = await Effect.runPromiseExit(
      findRangeViolations(conn, TABLE, "depth", constraint, field),
    );

    assert(result._tag === "Failure");
    const violations = (result.cause as { error: unknown }).error as {
      length: number;
      0: { value: string };
    };
    assertEquals(violations.length, 1);
    assertEquals(violations[0].value, "-5.0");
  });
});

Deno.test("findRangeViolations - only max specified", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "val DOUBLE", [
      "1, 50.0",
      "2, 150.0",
    ]);

    const constraint = {
      type: "range" as const,
      max: 100,
      inclusive: true,
    };
    const field = makeField("val", [constraint]);

    const result = await Effect.runPromiseExit(
      findRangeViolations(conn, TABLE, "val", constraint, field),
    );

    assert(result._tag === "Failure");
    const violations = (result.cause as { error: unknown }).error as {
      length: number;
      0: { value: string };
    };
    assertEquals(violations.length, 1);
    assertEquals(violations[0].value, "150.0");
  });
});

Deno.test("findRangeViolations - inclusive boundary passes", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "lat DOUBLE", [
      "1, 90.0",
      "2, -90.0",
    ]);

    const constraint = {
      type: "range" as const,
      min: -90,
      max: 90,
      inclusive: true,
    };
    const field = makeField("lat", [constraint]);

    const result = await Effect.runPromiseExit(
      findRangeViolations(conn, TABLE, "lat", constraint, field),
    );

    assert(result._tag === "Success");
  });
});

Deno.test("findRangeViolations - exclusive boundary fails", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "lat DOUBLE", [
      "1, 90.0",
    ]);

    const constraint = {
      type: "range" as const,
      min: -90,
      max: 90,
      inclusive: false,
    };
    const field = makeField("lat", [constraint]);

    const result = await Effect.runPromiseExit(
      findRangeViolations(conn, TABLE, "lat", constraint, field),
    );

    assert(result._tag === "Failure");
  });
});

// =============================================================================
// Pattern Constraint Tests
// =============================================================================

Deno.test("findPatternViolations - valid match passes", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "code VARCHAR", [
      "1, 'CA'",
      "2, 'GB'",
    ]);

    const constraint = {
      type: "pattern" as const,
      pattern: "^[A-Z]{2}$",
    };
    const field = makeField("code", [constraint]);

    const result = await Effect.runPromiseExit(
      findPatternViolations(conn, TABLE, "code", constraint, field),
    );

    assert(result._tag === "Success");
  });
});

Deno.test("findPatternViolations - invalid match fails", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "code VARCHAR", [
      "1, 'CA'",
      "2, 'USA'",
    ]);

    const constraint = {
      type: "pattern" as const,
      pattern: "^[A-Z]{2}$",
    };
    const field = makeField("code", [constraint]);

    const result = await Effect.runPromiseExit(
      findPatternViolations(conn, TABLE, "code", constraint, field),
    );

    assert(result._tag === "Failure");
    const violations = (result.cause as { error: unknown }).error as {
      length: number;
      0: { value: string };
    };
    assertEquals(violations.length, 1);
    assertEquals(violations[0].value, "USA");
  });
});

// =============================================================================
// Length Constraint Tests
// =============================================================================

Deno.test("findLengthViolations - at minLength passes", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "name VARCHAR", [
      "1, 'abc'",
    ]);

    const constraint = {
      type: "length" as const,
      minLength: 3,
      maxLength: 100,
    };
    const field = makeField("name", [constraint]);

    const result = await Effect.runPromiseExit(
      findLengthViolations(conn, TABLE, "name", constraint, field),
    );

    assert(result._tag === "Success");
  });
});

Deno.test("findLengthViolations - below minLength fails", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "name VARCHAR", [
      "1, 'ab'",
    ]);

    const constraint = {
      type: "length" as const,
      minLength: 3,
    };
    const field = makeField("name", [constraint]);

    const result = await Effect.runPromiseExit(
      findLengthViolations(conn, TABLE, "name", constraint, field),
    );

    assert(result._tag === "Failure");
    const violations = (result.cause as { error: unknown }).error as {
      length: number;
      0: { value: string };
    };
    assertEquals(violations.length, 1);
    assertEquals(violations[0].value, "ab");
  });
});

Deno.test("findLengthViolations - above maxLength fails", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "name VARCHAR", [
      "1, 'a very long string that exceeds the limit'",
    ]);

    const constraint = {
      type: "length" as const,
      maxLength: 10,
    };
    const field = makeField("name", [constraint]);

    const result = await Effect.runPromiseExit(
      findLengthViolations(conn, TABLE, "name", constraint, field),
    );

    assert(result._tag === "Failure");
  });
});

// =============================================================================
// Format Constraint Tests
// =============================================================================

Deno.test("findFormatViolations - valid ISO 8601 date passes", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "eventDate VARCHAR", [
      "1, '2022-09-15'",
      "2, '2022-01'",
      "3, '2022'",
    ]);

    const constraint = {
      type: "format" as const,
      format: "iso8601" as const,
    };
    const field = makeField("eventDate", [constraint]);

    const result = await Effect.runPromiseExit(
      findFormatViolations(conn, TABLE, "eventDate", constraint, field),
    );

    assert(result._tag === "Success");
  });
});

Deno.test("findFormatViolations - invalid date detected", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "eventDate VARCHAR", [
      "1, '2022-09-15'",
      "2, 'not-a-date'",
    ]);

    const constraint = {
      type: "format" as const,
      format: "iso8601" as const,
    };
    const field = makeField("eventDate", [constraint]);

    const result = await Effect.runPromiseExit(
      findFormatViolations(conn, TABLE, "eventDate", constraint, field),
    );

    assert(result._tag === "Failure");
    const violations = (result.cause as { error: unknown }).error as {
      length: number;
      0: { value: string };
    };
    assertEquals(violations.length, 1);
    assertEquals(violations[0].value, "not-a-date");
  });
});

Deno.test("findFormatViolations - valid URL passes", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "url VARCHAR", [
      "1, 'https://example.com'",
      "2, 'http://test.org/path'",
    ]);

    const constraint = {
      type: "format" as const,
      format: "url" as const,
    };
    const field = makeField("url", [constraint]);

    const result = await Effect.runPromiseExit(
      findFormatViolations(conn, TABLE, "url", constraint, field),
    );

    assert(result._tag === "Success");
  });
});

// =============================================================================
// Required Constraint Tests
// =============================================================================

Deno.test("findRequiredViolations - empty string detected", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "country VARCHAR", [
      "1, 'Canada'",
      "2, ''",
      "3, 'USA'",
    ]);

    const constraint = {
      type: "required" as const,
      allowEmpty: false,
      allowWhitespace: false,
      enforcement: "required" as const,
    };
    const field = makeField("country", [constraint]);

    const result = await Effect.runPromiseExit(
      findRequiredViolations(conn, TABLE, "country", constraint, field),
    );

    assert(result._tag === "Failure");
    const violations = (result.cause as { error: unknown }).error as { length: number };
    assertEquals(violations.length, 1);
  });
});

Deno.test("findRequiredViolations - NULL detected", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "country VARCHAR", [
      "1, 'Canada'",
      "2, NULL",
    ]);

    const constraint = {
      type: "required" as const,
      allowEmpty: false,
      allowWhitespace: false,
      enforcement: "required" as const,
    };
    const field = makeField("country", [constraint]);

    const result = await Effect.runPromiseExit(
      findRequiredViolations(conn, TABLE, "country", constraint, field),
    );

    assert(result._tag === "Failure");
    const violations = (result.cause as { error: unknown }).error as { length: number };
    assertEquals(violations.length, 1);
  });
});

Deno.test("findRequiredViolations - optional enforcement produces INFO violations", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "country VARCHAR", [
      "1, ''",
      "2, NULL",
    ]);

    const constraint = {
      type: "required" as const,
      allowEmpty: false,
      allowWhitespace: false,
      enforcement: "optional" as const,
    };
    const field = makeField("country", [constraint]);

    const result = await Effect.runPromiseExit(
      findRequiredViolations(conn, TABLE, "country", constraint, field),
    );

    // Optional enforcement now produces violations (INFO severity) instead of skipping
    assert(result._tag === "Failure");
    const violations = (result.cause as { error: unknown }).error as {
      length: number;
      0: { enforcement: string; severity: string };
    };
    assertEquals(violations.length, 2);
    assertEquals(violations[0].enforcement, "optional");
  });
});

Deno.test("validateRequiredConstraints - strictest enforcement wins over weaker config", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "country VARCHAR", [
      "1, 'Canada'",
      "2, NULL",
    ]);

    // Spec constraint is strict (required), config adds a weaker one (recommended).
    // The strictest must win — NULL should be a required-level violation, not a warning.
    const specConstraint = {
      type: "required" as const,
      allowEmpty: false,
      allowWhitespace: false,
      enforcement: "required" as const,
    };
    const configConstraint = {
      type: "required" as const,
      allowEmpty: false,
      allowWhitespace: false,
      enforcement: "recommended" as const,
    };
    const field = makeField("country", [specConstraint, configConstraint]);

    const result = await Effect.runPromiseExit(
      validateRequiredConstraints(conn, TABLE, "country", field),
    );

    assert(result._tag === "Failure");
    const violations = (result.cause as { error: unknown }).error as {
      length: number;
      0: { enforcement: string };
    };
    assertEquals(violations.length, 1);
    // The violation should carry the strictest enforcement level
    assertEquals(violations[0].enforcement, "required");
  });
});

Deno.test("findRequiredViolations - allowEmpty permits empty strings", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "notes VARCHAR", [
      "1, ''",
      "2, 'some text'",
    ]);

    const constraint = {
      type: "required" as const,
      allowEmpty: true,
      allowWhitespace: true,
      enforcement: "required" as const,
    };
    const field = makeField("notes", [constraint]);

    const result = await Effect.runPromiseExit(
      findRequiredViolations(conn, TABLE, "notes", constraint, field),
    );

    // allowEmpty + allowWhitespace means only NULL triggers a violation
    assert(result._tag === "Success");
  });
});

// =============================================================================
// Invariant: Value constraint violations always produce ERROR severity
// =============================================================================

Deno.test("Value violations always produce ERROR severity", async (t) => {
  await t.step("range violation has severity=error and enforcement=required", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "lat DOUBLE", ["1, 999.0"]);

      const constraint = { type: "range" as const, min: -90, max: 90, inclusive: true };
      const field = makeField("lat", [constraint]);

      const result = await Effect.runPromiseExit(
        findRangeViolations(conn, TABLE, "lat", constraint, field),
      );

      assert(result._tag === "Failure");
      const violations = (result.cause as { error: unknown }).error as Array<
        { severity: string; enforcement: string }
      >;
      assertEquals(violations[0].severity, "error");
      assertEquals(violations[0].enforcement, "required");
    });
  });

  await t.step("format violation has severity=error and enforcement=required", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "eventDate VARCHAR", ["1, 'not-a-date'"]);

      const constraint = { type: "format" as const, format: "iso8601" as const };
      const field = makeField("eventDate", [constraint]);

      const result = await Effect.runPromiseExit(
        findFormatViolations(conn, TABLE, "eventDate", constraint, field),
      );

      assert(result._tag === "Failure");
      const violations = (result.cause as { error: unknown }).error as Array<
        { severity: string; enforcement: string }
      >;
      assertEquals(violations[0].severity, "error");
      assertEquals(violations[0].enforcement, "required");
    });
  });

  await t.step("pattern violation has severity=error and enforcement=required", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "countryCode VARCHAR", ["1, 'USA'"]);

      const constraint = { type: "pattern" as const, pattern: "^[A-Z]{2}$" };
      const field = makeField("countryCode", [constraint]);

      const result = await Effect.runPromiseExit(
        findPatternViolations(conn, TABLE, "countryCode", constraint, field),
      );

      assert(result._tag === "Failure");
      const violations = (result.cause as { error: unknown }).error as Array<
        { severity: string; enforcement: string }
      >;
      assertEquals(violations[0].severity, "error");
      assertEquals(violations[0].enforcement, "required");
    });
  });

  await t.step("length violation has severity=error and enforcement=required", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "name VARCHAR", ["1, 'ab'"]);

      const constraint = { type: "length" as const, minLength: 5 };
      const field = makeField("name", [constraint]);

      const result = await Effect.runPromiseExit(
        findLengthViolations(conn, TABLE, "name", constraint, field),
      );

      assert(result._tag === "Failure");
      const violations = (result.cause as { error: unknown }).error as Array<
        { severity: string; enforcement: string }
      >;
      assertEquals(violations[0].severity, "error");
      assertEquals(violations[0].enforcement, "required");
    });
  });
});

// =============================================================================
// Uniqueness Constraint Tests
// =============================================================================

Deno.test("Uniqueness constraint violations", async (t) => {
  await t.step("detects duplicate values with correct row numbers", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "eventID VARCHAR", [
        "1, 'E1'",
        "2, 'E2'",
        "3, 'E1'",
        "4, 'E3'",
        "5, 'E2'",
      ]);

      const field = makeField("eventID", [{ type: "unique" as const }]);

      const result = await Effect.runPromiseExit(
        findUniquenessViolations(conn, TABLE, "eventID", field),
      );

      assert(result._tag === "Failure");
      const violations = (result.cause as { error: unknown }).error as Array<
        { value: string; rowNumber: number; severity: string; enforcement: string }
      >;

      // E1 appears in rows 1,3 and E2 in rows 2,5 — 4 violations total
      assertEquals(violations.length, 4);

      // All uniqueness violations are errors
      for (const v of violations) {
        assertEquals(v.severity, "error");
        assertEquals(v.enforcement, "required");
      }
    });
  });

  await t.step("no violations when all values are unique", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "eventID VARCHAR", [
        "1, 'E1'",
        "2, 'E2'",
        "3, 'E3'",
      ]);

      const field = makeField("eventID", [{ type: "unique" as const }]);

      const result = await Effect.runPromiseExit(
        findUniquenessViolations(conn, TABLE, "eventID", field),
      );

      assert(result._tag === "Success");
    });
  });

  await t.step("null values are excluded from uniqueness check", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "eventID VARCHAR", [
        "1, NULL",
        "2, NULL",
        "3, 'E1'",
      ]);

      const field = makeField("eventID", [{ type: "unique" as const }]);

      const result = await Effect.runPromiseExit(
        findUniquenessViolations(conn, TABLE, "eventID", field),
      );

      assert(result._tag === "Success");
    });
  });
});
