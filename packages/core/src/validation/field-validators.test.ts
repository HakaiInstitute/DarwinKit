/**
 * Tests for field-validators.ts — SQL-based constraint validators
 *
 * Each test creates an in-memory DuckDB table with _row_number + test columns,
 * then runs the validator and checks the Effect result.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import { assert, assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import type { SpecField } from "@dwkit/domain/specs";
import {
  FormatConstraint,
  LengthConstraint,
  PatternConstraint,
  RangeConstraint,
  RequiredConstraint,
  UniqueConstraint,
} from "@dwkit/domain/specs";
import {
  extractViolations,
  makeField,
  setupTable,
  TABLE,
  withConnection,
} from "../../../../test/helpers/duckdb-test-utils.ts";
import {
  findFormatViolations,
  findLengthViolations,
  findPatternViolations,
  findPrimaryKeyViolations,
  findRangeViolations,
  findRequiredViolations,
  findTypeViolations,
  findUniquenessViolations,
  findVocabularyViolations,
  validateField,
  validateRequiredConstraints,
} from "./field-validators.ts";

// =============================================================================
// Range Constraint Tests
// =============================================================================

Deno.test("findRangeViolations", async (t) => {
  const cases = [
    {
      label: "above max",
      rows: ["1, 45.0", "2, 95.0", "3, -10.0"],
      constraint: { min: -90, max: 90, inclusive: true },
      expectedCount: 1,
      expectedValue: "95.0",
    },
    {
      label: "below min",
      rows: ["1, 45.0", "2, -95.0"],
      constraint: { min: -90, max: 90, inclusive: true },
      expectedCount: 1,
      expectedValue: "-95.0",
    },
    {
      label: "only min specified",
      rows: ["1, 10.0", "2, -5.0"],
      constraint: { min: 0, inclusive: true },
      expectedCount: 1,
      expectedValue: "-5.0",
    },
    {
      label: "only max specified",
      rows: ["1, 50.0", "2, 150.0"],
      constraint: { max: 100, inclusive: true },
      expectedCount: 1,
      expectedValue: "150.0",
    },
    {
      label: "inclusive boundary passes",
      rows: ["1, 90.0", "2, -90.0"],
      constraint: { min: -90, max: 90, inclusive: true },
      expectedCount: 0,
    },
    {
      label: "exclusive boundary fails",
      rows: ["1, 90.0"],
      constraint: { min: -90, max: 90, inclusive: false },
      expectedCount: 1,
    },
  ];

  for (const { label, rows, constraint: params, expectedCount, expectedValue } of cases) {
    await t.step(label, async () => {
      await withConnection(async (conn) => {
        await setupTable(conn, "val DOUBLE", rows);
        const constraint = new RangeConstraint(params);
        const field = makeField("val", [constraint]);
        const result = await Effect.runPromiseExit(
          findRangeViolations(conn, TABLE, "val", constraint, field),
        );
        if (expectedCount === 0) {
          assert(result._tag === "Success", label);
        } else {
          const violations = extractViolations(result);
          assertEquals(violations.length, expectedCount, label);
          if (expectedValue) assertEquals(violations[0].value, expectedValue, label);
        }
      });
    });
  }
});

// =============================================================================
// Pattern Constraint Tests
// =============================================================================

Deno.test("findPatternViolations", async (t) => {
  const pattern = "^[A-Z]{2}$";

  await t.step("valid match passes", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "code VARCHAR", ["1, 'CA'", "2, 'GB'"]);
      const constraint = new PatternConstraint({ pattern });
      const field = makeField("code", [constraint]);
      const result = await Effect.runPromiseExit(
        findPatternViolations(conn, TABLE, "code", constraint, field),
      );
      assert(result._tag === "Success");
    });
  });

  await t.step("invalid match fails", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "code VARCHAR", ["1, 'CA'", "2, 'USA'"]);
      const constraint = new PatternConstraint({ pattern });
      const field = makeField("code", [constraint]);
      const result = await Effect.runPromiseExit(
        findPatternViolations(conn, TABLE, "code", constraint, field),
      );
      const violations = extractViolations(result);
      assertEquals(violations.length, 1);
      assertEquals(violations[0].value, "USA");
    });
  });
});

// =============================================================================
// Length Constraint Tests
// =============================================================================

Deno.test("findLengthViolations", async (t) => {
  await t.step("at minLength passes", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "name VARCHAR", ["1, 'abc'"]);
      const constraint = new LengthConstraint({ minLength: 3, maxLength: 100 });
      const field = makeField("name", [constraint]);
      const result = await Effect.runPromiseExit(
        findLengthViolations(conn, TABLE, "name", constraint, field),
      );
      assert(result._tag === "Success");
    });
  });

  await t.step("below minLength fails", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "name VARCHAR", ["1, 'ab'"]);
      const constraint = new LengthConstraint({ minLength: 3 });
      const field = makeField("name", [constraint]);
      const result = await Effect.runPromiseExit(
        findLengthViolations(conn, TABLE, "name", constraint, field),
      );
      const violations = extractViolations(result);
      assertEquals(violations.length, 1);
      assertEquals(violations[0].value, "ab");
    });
  });

  await t.step("above maxLength fails", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "name VARCHAR", ["1, 'a very long string that exceeds the limit'"]);
      const constraint = new LengthConstraint({ maxLength: 10 });
      const field = makeField("name", [constraint]);
      const result = await Effect.runPromiseExit(
        findLengthViolations(conn, TABLE, "name", constraint, field),
      );
      assert(result._tag === "Failure");
    });
  });
});

// =============================================================================
// Format Constraint Tests
// =============================================================================

Deno.test("findFormatViolations", async (t) => {
  await t.step("valid ISO 8601 dates pass", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "eventDate VARCHAR", [
        "1, '2022-09-15'",
        "2, '2022-01'",
        "3, '2022'",
      ]);
      const constraint = new FormatConstraint({ format: "iso8601" });
      const field = makeField("eventDate", [constraint]);
      const result = await Effect.runPromiseExit(
        findFormatViolations(conn, TABLE, "eventDate", constraint, field),
      );
      assert(result._tag === "Success");
    });
  });

  await t.step("invalid date detected", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "eventDate VARCHAR", ["1, '2022-09-15'", "2, 'not-a-date'"]);
      const constraint = new FormatConstraint({ format: "iso8601" });
      const field = makeField("eventDate", [constraint]);
      const result = await Effect.runPromiseExit(
        findFormatViolations(conn, TABLE, "eventDate", constraint, field),
      );
      const violations = extractViolations(result);
      assertEquals(violations.length, 1);
      assertEquals(violations[0].value, "not-a-date");
    });
  });

  await t.step("valid URL passes", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "url VARCHAR", [
        "1, 'https://example.com'",
        "2, 'http://test.org/path'",
      ]);
      const constraint = new FormatConstraint({ format: "url" });
      const field = makeField("url", [constraint]);
      const result = await Effect.runPromiseExit(
        findFormatViolations(conn, TABLE, "url", constraint, field),
      );
      assert(result._tag === "Success");
    });
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

    const constraint = new RequiredConstraint({
      level: "required",
      allowEmpty: false,
      allowWhitespace: false,
    });
    const field = makeField("country", [constraint]);

    const result = await Effect.runPromiseExit(
      findRequiredViolations(conn, TABLE, "country", constraint, field),
    );

    const violations = extractViolations(result);
    assertEquals(violations.length, 1);
  });
});

Deno.test("findRequiredViolations - NULL detected", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "country VARCHAR", [
      "1, 'Canada'",
      "2, NULL",
    ]);

    const constraint = new RequiredConstraint({
      level: "required",
      allowEmpty: false,
      allowWhitespace: false,
    });
    const field = makeField("country", [constraint]);

    const result = await Effect.runPromiseExit(
      findRequiredViolations(conn, TABLE, "country", constraint, field),
    );

    const violations = extractViolations(result);
    assertEquals(violations.length, 1);
  });
});

Deno.test("findRequiredViolations - optional level produces INFO violations", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "country VARCHAR", [
      "1, ''",
      "2, NULL",
    ]);

    const constraint = new RequiredConstraint({
      level: "optional",
      allowEmpty: false,
      allowWhitespace: false,
    });
    const field = makeField("country", [constraint]);

    const result = await Effect.runPromiseExit(
      findRequiredViolations(conn, TABLE, "country", constraint, field),
    );

    // Optional level now produces violations (INFO severity) instead of skipping
    const violations = extractViolations(result);
    assertEquals(violations.length, 2);
  });
});

Deno.test("validateRequiredConstraints - strictest level wins over weaker config", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "country VARCHAR", [
      "1, 'Canada'",
      "2, NULL",
    ]);

    // Spec constraint is strict (required), config adds a weaker one (recommended).
    // The strictest must win — NULL should be a required-level violation, not a warning.
    const specConstraint = new RequiredConstraint({
      level: "required",
      allowEmpty: false,
      allowWhitespace: false,
    });
    const configConstraint = new RequiredConstraint({
      level: "recommended",
      allowEmpty: false,
      allowWhitespace: false,
    });
    const field = makeField("country", [specConstraint, configConstraint]);

    const result = await Effect.runPromiseExit(
      validateRequiredConstraints(conn, TABLE, "country", field),
    );

    const violations = extractViolations(result);
    assertEquals(violations.length, 1);
    // The violation should carry the severity of the strictest level
    assertEquals(violations[0].severity, "error");
  });
});

Deno.test("findRequiredViolations - allowEmpty permits empty strings", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "notes VARCHAR", [
      "1, ''",
      "2, 'some text'",
    ]);

    const constraint = new RequiredConstraint({
      level: "required",
      allowEmpty: true,
      allowWhitespace: true,
    });
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

Deno.test("Value violations always produce ERROR severity", async () => {
  const cases: Array<{
    label: string;
    column: string;
    row: string;
    run: (conn: DuckDBConnection, field: SpecField) => Effect.Effect<void, unknown>;
  }> = [
    {
      label: "range",
      column: "lat DOUBLE",
      row: "1, 999.0",
      run: (conn, field) => {
        const c = new RangeConstraint({ min: -90, max: 90, inclusive: true });
        return findRangeViolations(conn, TABLE, "lat", c, { ...field, constraints: [c] });
      },
    },
    {
      label: "format",
      column: "eventDate VARCHAR",
      row: "1, 'not-a-date'",
      run: (conn, field) => {
        const c = new FormatConstraint({ format: "iso8601" });
        return findFormatViolations(conn, TABLE, "eventDate", c, { ...field, constraints: [c] });
      },
    },
    {
      label: "pattern",
      column: "countryCode VARCHAR",
      row: "1, 'USA'",
      run: (conn, field) => {
        const c = new PatternConstraint({ pattern: "^[A-Z]{2}$" });
        return findPatternViolations(conn, TABLE, "countryCode", c, { ...field, constraints: [c] });
      },
    },
    {
      label: "length",
      column: "name VARCHAR",
      row: "1, 'ab'",
      run: (conn, field) => {
        const c = new LengthConstraint({ minLength: 5 });
        return findLengthViolations(conn, TABLE, "name", c, { ...field, constraints: [c] });
      },
    },
  ];

  for (const { label, column, row, run } of cases) {
    await withConnection(async (conn) => {
      await setupTable(conn, column, [row]);
      const fieldName = column.split(" ")[0];
      const field = makeField(fieldName, []);
      const result = await Effect.runPromiseExit(run(conn, field));
      const violations = extractViolations(result);
      assertEquals(violations[0].severity, "error", `${label} violation severity`);
    });
  }
});

Deno.test("findPatternViolations - binds a pattern containing a single quote", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "code VARCHAR", ["1, 'O''K'", "2, 'BAD'"]);
    const constraint = new PatternConstraint({ pattern: "^O'K$" });
    const field = makeField("code", [constraint]);
    const result = await Effect.runPromiseExit(
      findPatternViolations(conn, TABLE, "code", constraint, field),
    );
    const violations = extractViolations(result);
    assertEquals(violations.length, 1); // only "BAD" violates
    assertEquals(violations[0].value, "BAD");
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

      const field = makeField("eventID", [new UniqueConstraint({})]);

      const result = await Effect.runPromiseExit(
        findUniquenessViolations(conn, TABLE, "eventID", field),
      );

      const violations = extractViolations(result);

      // E1 appears in rows 1,3 and E2 in rows 2,5 — 4 violations total
      assertEquals(violations.length, 4);

      // All uniqueness violations are errors
      for (const v of violations) {
        assertEquals(v.severity, "error");
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

      const field = makeField("eventID", [new UniqueConstraint({})]);

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

      const field = makeField("eventID", [new UniqueConstraint({})]);

      const result = await Effect.runPromiseExit(
        findUniquenessViolations(conn, TABLE, "eventID", field),
      );

      assert(result._tag === "Success");
    });
  });
});

// =============================================================================
// Vocabulary Constraint Tests
// =============================================================================

Deno.test("findVocabularyViolations", async (t) => {
  const check = {
    allowedValues: ["Animalia", "Plantae"],
    enumType: "taxon_kingdom_enum",
    severity: "error" as const,
    enableSuggestions: true,
  };

  await t.step("member values pass", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "kingdom VARCHAR", ["1, 'Animalia'", "2, 'Plantae'"]);
      const field = makeField("kingdom", []);
      const result = await Effect.runPromiseExit(
        findVocabularyViolations(conn, TABLE, "kingdom", field, check),
      );
      assert(result._tag === "Success");
    });
  });

  await t.step("non-member flagged with suggestion", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "kingdom VARCHAR", ["1, 'Animala'", "2, 'Plantae'"]);
      const field = makeField("kingdom", []);
      const result = await Effect.runPromiseExit(
        findVocabularyViolations(conn, TABLE, "kingdom", field, check),
      );
      const violations = extractViolations(result);
      assertEquals(violations.length, 1);
      assertEquals(violations[0].value, "Animala");
      assertEquals(violations[0]._tag, "EnumViolation");
      assertEquals(violations[0].suggestedValue, "Animalia");
    });
  });

  await t.step("null/empty values are ignored", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "kingdom VARCHAR", ["1, NULL", "2, ''"]);
      const field = makeField("kingdom", []);
      const result = await Effect.runPromiseExit(
        findVocabularyViolations(conn, TABLE, "kingdom", field, check),
      );
      assert(result._tag === "Success");
    });
  });
});

// =============================================================================
// Type Constraint Tests
// =============================================================================

Deno.test("findTypeViolations", async (t) => {
  await t.step("non-numeric value in a DOUBLE field is flagged", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "lat VARCHAR", ["1, '45.0'", "2, 'abc'", "3, ''"]);
      const field = makeField("lat", []);
      const result = await Effect.runPromiseExit(
        findTypeViolations(conn, TABLE, "lat", field, "DOUBLE"),
      );
      const violations = extractViolations(result);
      assertEquals(violations.length, 1);
      assertEquals(violations[0].value, "abc");
      assertEquals(violations[0]._tag, "TypeViolation");
      assertEquals(violations[0].expectedType, "DOUBLE");
    });
  });

  await t.step("valid integers pass", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "n VARCHAR", ["1, '10'", "2, '-3'"]);
      const field = makeField("n", []);
      const result = await Effect.runPromiseExit(
        findTypeViolations(conn, TABLE, "n", field, "INTEGER"),
      );
      assert(result._tag === "Success");
    });
  });

  await t.step("decimal value fails INTEGER check", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "n VARCHAR", ["1, '1.5'"]);
      const field = makeField("n", []);
      const result = await Effect.runPromiseExit(
        findTypeViolations(conn, TABLE, "n", field, "INTEGER"),
      );
      const violations = extractViolations(result);
      assertEquals(violations.length, 1);
      assertEquals(violations[0].value, "1.5");
    });
  });

  await t.step("large integer exceeding INT32 passes INTEGER check", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "n VARCHAR", ["1, '3000000000'"]);
      const field = makeField("n", []);
      const result = await Effect.runPromiseExit(
        findTypeViolations(conn, TABLE, "n", field, "INTEGER"),
      );
      assert(result._tag === "Success");
    });
  });
});

// =============================================================================
// Primary Key Constraint Tests
// =============================================================================

Deno.test("findPrimaryKeyViolations", async (t) => {
  await t.step("unique non-null keys pass", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "id VARCHAR", ["1, 'A'", "2, 'B'", "3, 'C'"]);
      const field = makeField("id", []);
      const result = await Effect.runPromiseExit(
        findPrimaryKeyViolations(conn, TABLE, "id", field),
      );
      assert(result._tag === "Success");
    });
  });

  await t.step("duplicates flagged once per affected row", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "id VARCHAR", ["1, 'A'", "2, 'A'", "3, 'B'"]);
      const field = makeField("id", []);
      const result = await Effect.runPromiseExit(
        findPrimaryKeyViolations(conn, TABLE, "id", field),
      );
      const violations = extractViolations(result);
      assertEquals(violations.length, 2);
      assertEquals(violations[0]._tag, "PrimaryKeyViolation");
      assertEquals(violations[0].constraintType, "duplicate");
      assertEquals(violations[0].value, "A");
    });
  });

  await t.step("null and empty keys flagged as constraintType null", async () => {
    await withConnection(async (conn) => {
      await setupTable(conn, "id VARCHAR", ["1, 'A'", "2, NULL", "3, ''"]);
      const field = makeField("id", []);
      const result = await Effect.runPromiseExit(
        findPrimaryKeyViolations(conn, TABLE, "id", field),
      );
      const violations = extractViolations(result);
      assertEquals(violations.length, 2);
      assertEquals(violations.every((v) => v.constraintType === "null"), true);
    });
  });
});

// =============================================================================
// validateField wiring tests
// =============================================================================

Deno.test("validateField - primary key field routes to PrimaryKeyViolation", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "eventID VARCHAR", ["1, 'E1'", "2, 'E1'", "3, NULL"]);
    const field = makeField("eventID", []);
    const result = await Effect.runPromiseExit(
      validateField(conn, TABLE, "eventID", field, { isDbPrimaryKey: true }),
    );
    const violations = extractViolations(result);
    // 2 duplicate rows (E1 x2) + 1 null row
    assertEquals(violations.length, 3);
    assertEquals(violations.every((v) => v._tag === "PrimaryKeyViolation"), true);
  });
});

Deno.test("validateField - numericType runs type-validity check", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "lat VARCHAR", ["1, '45.0'", "2, 'abc'"]);
    const field = makeField("lat", []);
    const result = await Effect.runPromiseExit(
      validateField(conn, TABLE, "lat", field, { isDbPrimaryKey: false, numericType: "DOUBLE" }),
    );
    const violations = extractViolations(result);
    assertEquals(violations.length, 1);
    assertEquals(violations[0]._tag, "TypeViolation");
  });
});

Deno.test("validateField - vocabulary check runs when supplied", async () => {
  await withConnection(async (conn) => {
    await setupTable(conn, "kingdom VARCHAR", ["1, 'Animalia'", "2, 'Bogus'"]);
    const field = makeField("kingdom", []);
    const result = await Effect.runPromiseExit(
      validateField(conn, TABLE, "kingdom", field, {
        isDbPrimaryKey: false,
        vocabulary: {
          allowedValues: ["Animalia", "Plantae"],
          enumType: "taxon_kingdom_enum",
          severity: "error",
          enableSuggestions: false,
        },
      }),
    );
    const violations = extractViolations(result);
    assertEquals(violations.length, 1);
    assertEquals(violations[0]._tag, "EnumViolation");
  });
});
