/**
 * Tests for dataset-rule-validators.ts — SQL-based dataset rule validators
 *
 * Each test creates an in-memory DuckDB table, then runs the validator
 * and checks the Effect result.
 */

import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import { OneOfRequiredRule } from "@dwkt/domain/specs";
import { withConnection } from "../../../../test/helpers/duckdb-test-utils.ts";
import { validateOneOfRequired } from "./dataset-rule-validators.ts";

Deno.test("validateOneOfRequired - no violations when at least one field present", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_emof AS SELECT * FROM (VALUES
        (1, 'EVT-1', NULL),
        (2, NULL, 'OCC-1'),
        (3, 'EVT-2', 'OCC-2')
      ) AS t(_row_number, eventID, occurrenceID)
    `);

    const rule = new OneOfRequiredRule({
      fields: ["eventID", "occurrenceID"],
      level: "required",
    });

    const result = await Effect.runPromise(
      Effect.either(validateOneOfRequired(connection, "test_emof", rule)),
    );
    assertEquals(Either.isRight(result), true);
  });
});

Deno.test("validateOneOfRequired - violations when both fields null/empty", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_emof AS SELECT * FROM (VALUES
        (1, 'EVT-1', NULL),
        (2, NULL, NULL),
        (3, '', ''),
        (4, 'EVT-2', 'OCC-2')
      ) AS t(_row_number, eventID, occurrenceID)
    `);

    const rule = new OneOfRequiredRule({
      fields: ["eventID", "occurrenceID"],
      level: "required",
    });

    const result = await Effect.runPromise(
      Effect.either(validateOneOfRequired(connection, "test_emof", rule)),
    );
    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      const violations = result.left;
      assertEquals(violations.length, 2);
      assertEquals(violations[0].rowNumber, 2);
      assertEquals(violations[1].rowNumber, 3);
      assertEquals(violations[0].severity, "error");
      assertEquals(violations[0]._tag, "OneOfRequiredViolation");
    }
  });
});

Deno.test("validateOneOfRequired - uses custom message when provided", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_emof AS SELECT * FROM (VALUES
        (1, NULL, NULL)
      ) AS t(_row_number, eventID, occurrenceID)
    `);

    const rule = new OneOfRequiredRule({
      fields: ["eventID", "occurrenceID"],
      level: "required",
      message: "Custom error message",
    });

    const result = await Effect.runPromise(
      Effect.either(validateOneOfRequired(connection, "test_emof", rule)),
    );
    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assertEquals(result.left[0].errorMessage, "Custom error message");
    }
  });
});

Deno.test("validateOneOfRequired - recommended level produces warnings", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_emof AS SELECT * FROM (VALUES
        (1, NULL, NULL)
      ) AS t(_row_number, eventID, occurrenceID)
    `);

    const rule = new OneOfRequiredRule({
      fields: ["eventID", "occurrenceID"],
      level: "recommended",
    });

    const result = await Effect.runPromise(
      Effect.either(validateOneOfRequired(connection, "test_emof", rule)),
    );
    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assertEquals(result.left[0].severity, "warning");
    }
  });
});
