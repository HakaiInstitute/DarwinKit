import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import * as Either from "effect/Either";
import { DependencyRule } from "@dwkt/domain/specs";
import { withConnection } from "../../../../test/helpers/duckdb-test-utils.ts";
import { validateDependencyRule } from "./dataset-rule-validators.ts";

// --- Unconditional oneOf ---

Deno.test("dependency - unconditional oneOf: no violations when at least one present", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_t AS SELECT * FROM (VALUES
        (1, 'EVT-1', NULL),
        (2, NULL, 'OCC-1'),
        (3, 'EVT-2', 'OCC-2')
      ) AS t(_row_number, eventID, occurrenceID)
    `);
    const rule = new DependencyRule({
      require: { oneOf: ["eventID", "occurrenceID"] },
      level: "required",
    });
    const result = await Effect.runPromise(
      Effect.either(validateDependencyRule(connection, "test_t", rule)),
    );
    assertEquals(Either.isRight(result), true);
  });
});

Deno.test("dependency - unconditional oneOf: violations when all null/empty", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_t AS SELECT * FROM (VALUES
        (1, 'EVT-1', NULL),
        (2, NULL, NULL),
        (3, '', ''),
        (4, 'EVT-2', 'OCC-2')
      ) AS t(_row_number, eventID, occurrenceID)
    `);
    const rule = new DependencyRule({
      require: { oneOf: ["eventID", "occurrenceID"] },
      level: "required",
    });
    const result = await Effect.runPromise(
      Effect.either(validateDependencyRule(connection, "test_t", rule)),
    );
    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assertEquals(result.left.length, 2);
      assertEquals(result.left[0].rowNumber, 2);
      assertEquals(result.left[1].rowNumber, 3);
      assertEquals(result.left[0].severity, "error");
      assertEquals(result.left[0]._tag, "DependencyViolation");
    }
  });
});

// --- Presence-triggered allOf ---

Deno.test("dependency - presence trigger: no violation when trigger absent", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_t AS SELECT * FROM (VALUES
        (1, NULL, NULL, NULL)
      ) AS t(_row_number, decimalLatitude, decimalLongitude, geodeticDatum)
    `);
    const rule = new DependencyRule({
      when: "decimalLatitude",
      require: ["decimalLongitude", "geodeticDatum"],
      level: "required",
    });
    const result = await Effect.runPromise(
      Effect.either(validateDependencyRule(connection, "test_t", rule)),
    );
    assertEquals(Either.isRight(result), true);
  });
});

Deno.test("dependency - presence trigger: violation when trigger present but required missing", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_t AS SELECT * FROM (VALUES
        (1, '45.0', '90.0', 'WGS84'),
        (2, '45.0', NULL, NULL),
        (3, NULL, NULL, NULL)
      ) AS t(_row_number, decimalLatitude, decimalLongitude, geodeticDatum)
    `);
    const rule = new DependencyRule({
      when: "decimalLatitude",
      require: ["decimalLongitude", "geodeticDatum"],
      level: "required",
    });
    const result = await Effect.runPromise(
      Effect.either(validateDependencyRule(connection, "test_t", rule)),
    );
    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assertEquals(result.left.length, 1);
      assertEquals(result.left[0].rowNumber, 2);
    }
  });
});

// --- Value-conditional with equals ---

Deno.test("dependency - equals condition: violation when value matches and required missing", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_t AS SELECT * FROM (VALUES
        (1, 'PreservedSpecimen', 'CAT-1'),
        (2, 'PreservedSpecimen', NULL),
        (3, 'HumanObservation', NULL)
      ) AS t(_row_number, basisOfRecord, catalogNumber)
    `);
    const rule = new DependencyRule({
      when: { field: "basisOfRecord", equals: "PreservedSpecimen" },
      require: ["catalogNumber"],
      level: "required",
    });
    const result = await Effect.runPromise(
      Effect.either(validateDependencyRule(connection, "test_t", rule)),
    );
    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assertEquals(result.left.length, 1);
      assertEquals(result.left[0].rowNumber, 2);
    }
  });
});

// --- Value-conditional with in ---

Deno.test("dependency - in condition: violation when value in set and required missing", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_t AS SELECT * FROM (VALUES
        (1, 'PreservedSpecimen', 'CAT-1'),
        (2, 'FossilSpecimen', NULL),
        (3, 'HumanObservation', NULL)
      ) AS t(_row_number, basisOfRecord, catalogNumber)
    `);
    const rule = new DependencyRule({
      when: { field: "basisOfRecord", in: ["PreservedSpecimen", "FossilSpecimen"] },
      require: ["catalogNumber"],
      level: "required",
    });
    const result = await Effect.runPromise(
      Effect.either(validateDependencyRule(connection, "test_t", rule)),
    );
    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assertEquals(result.left.length, 1);
      assertEquals(result.left[0].rowNumber, 2);
    }
  });
});

// --- Custom message and severity ---

Deno.test("dependency - custom message", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_t AS SELECT * FROM (VALUES
        (1, NULL, NULL)
      ) AS t(_row_number, eventID, occurrenceID)
    `);
    const rule = new DependencyRule({
      require: { oneOf: ["eventID", "occurrenceID"] },
      level: "required",
      message: "Custom error message",
    });
    const result = await Effect.runPromise(
      Effect.either(validateDependencyRule(connection, "test_t", rule)),
    );
    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assertEquals(result.left[0].errorMessage, "Custom error message");
    }
  });
});

Deno.test("dependency - recommended level produces warnings", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_t AS SELECT * FROM (VALUES
        (1, NULL, NULL)
      ) AS t(_row_number, eventID, occurrenceID)
    `);
    const rule = new DependencyRule({
      require: { oneOf: ["eventID", "occurrenceID"] },
      level: "recommended",
    });
    const result = await Effect.runPromise(
      Effect.either(validateDependencyRule(connection, "test_t", rule)),
    );
    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assertEquals(result.left[0].severity, "warning");
    }
  });
});

// --- Values with single quotes ---

Deno.test("dependency - equals condition handles single quotes in values", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_t AS SELECT * FROM (VALUES
        (1, 'O''Brien', NULL),
        (2, 'Smith', NULL)
      ) AS t(_row_number, collector, catalogNumber)
    `);
    const rule = new DependencyRule({
      when: { field: "collector", equals: "O'Brien" },
      require: ["catalogNumber"],
      level: "required",
    });
    const result = await Effect.runPromise(
      Effect.either(validateDependencyRule(connection, "test_t", rule)),
    );
    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assertEquals(result.left.length, 1);
      assertEquals(result.left[0].rowNumber, 1);
    }
  });
});

Deno.test("dependency - in condition handles single quotes in values", async () => {
  await withConnection(async (connection) => {
    await connection.run(`
      CREATE TABLE test_t AS SELECT * FROM (VALUES
        (1, 'O''Brien', NULL),
        (2, 'D''Angelo', 'CAT-1'),
        (3, 'Smith', NULL)
      ) AS t(_row_number, collector, catalogNumber)
    `);
    const rule = new DependencyRule({
      when: { field: "collector", in: ["O'Brien", "D'Angelo"] },
      require: ["catalogNumber"],
      level: "required",
    });
    const result = await Effect.runPromise(
      Effect.either(validateDependencyRule(connection, "test_t", rule)),
    );
    assertEquals(Either.isLeft(result), true);
    if (Either.isLeft(result)) {
      assertEquals(result.left.length, 1);
      assertEquals(result.left[0].rowNumber, 1);
    }
  });
});
