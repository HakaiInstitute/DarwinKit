/**
 * Tests for field-validators.ts - Either-based validation
 *
 * These tests verify the Either-based validation pattern with automatic accumulation.
 */

import type { FieldDefinition } from "@dwkt/domain";
import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import { validateField, validateRangeConstraints } from "./field-validators.ts";
import { withTestConnection } from "./test-utils.ts";

Deno.test("validateRangeConstraints - should succeed when all values are within range", async () => {
  await withTestConnection(async (connection) => {
    // Create test table with values in range
    await connection.run(`
      CREATE TABLE test_data (
        _row_number INTEGER,
        temperature DOUBLE
      )
    `);

    await connection.run(`
      INSERT INTO test_data VALUES
      (1, 15.5),
      (2, 20.0),
      (3, 25.7)
    `);

    const specField: FieldDefinition = {
      name: "temperature",
      type: "number",
      validators: [
        {
          type: "range",
          enforcement: "required",
          params: { min: 0, max: 50, inclusive: true },
        },
      ],
    };

    // V2 API: Should succeed with ValidField
    const result = await Effect.runPromise(
      validateRangeConstraints(connection, "test_data", "temperature", specField),
    );

    assertEquals(result, { fieldName: "temperature", status: "valid" });
  });
});

Deno.test("validateRangeConstraints - should fail with violations when values are out of range", async () => {
  await withTestConnection(async (connection) => {
    // Create test table with values out of range
    await connection.run(`
      CREATE TABLE test_data (
        _row_number INTEGER,
        temperature DOUBLE
      )
    `);

    await connection.run(`
      INSERT INTO test_data VALUES
      (1, -5.0),
      (2, 60.0)
    `);

    const specField: FieldDefinition = {
      name: "temperature",
      type: "number",
      validators: [
        {
          type: "range",
          enforcement: "required",
          params: { min: 0, max: 50, inclusive: true },
        },
      ],
    };

    // V2 API: Should fail with violations in error channel
    const result = await Effect.runPromise(
      validateRangeConstraints(
        connection,
        "test_data",
        "temperature",
        specField,
      ).pipe(Effect.either),
    );

    assertEquals(result._tag, "Left");
    if (result._tag === "Left") {
      assertEquals(result.left.length, 2);
      assertEquals(result.left[0]._tag, "RangeViolation");
      assertEquals(result.left[0].fieldName, "temperature");
    }
  });
});

Deno.test("validateField - should accumulate violations from multiple validators", async () => {
  await withTestConnection(async (connection) => {
    // Create test table with multiple validation issues
    await connection.run(`
      CREATE TABLE test_data (
        _row_number INTEGER,
        temperature DOUBLE
      )
    `);

    await connection.run(`
      INSERT INTO test_data VALUES
      (1, -5.0),
      (2, 60.0),
      (3, 25.0),
      (4, 25.0)
    `);

    const specField: FieldDefinition = {
      name: "temperature",
      type: "number",
      validators: [
        {
          type: "range",
          enforcement: "required",
          params: { min: 0, max: 50, inclusive: true },
        },
        {
          type: "unique",
          enforcement: "required",
        },
      ],
    };

    // V2 API: Should accumulate violations from both range and uniqueness validators
    const result = await Effect.runPromise(
      validateField(
        connection,
        "test_data",
        "temperature",
        specField,
      ).pipe(Effect.either),
    );

    assertEquals(result._tag, "Left");
    if (result._tag === "Left") {
      // Should have 2 range violations + 2 uniqueness violations = 4 total
      assertEquals(result.left.length, 4);

      const rangeViolations = result.left.filter((v) => v._tag === "RangeViolation");
      const uniquenessViolations = result.left.filter((v) => v._tag === "UniquenessViolation");

      assertEquals(rangeViolations.length, 2);
      assertEquals(uniquenessViolations.length, 2);
    }
  });
});

Deno.test("validateField - should succeed when all validators pass", async () => {
  await withTestConnection(async (connection) => {
    // Create test table with valid data
    await connection.run(`
      CREATE TABLE test_data (
        _row_number INTEGER,
        temperature DOUBLE
      )
    `);

    await connection.run(`
      INSERT INTO test_data VALUES
      (1, 15.5),
      (2, 20.0),
      (3, 25.7)
    `);

    const specField: FieldDefinition = {
      name: "temperature",
      type: "number",
      validators: [
        {
          type: "range",
          enforcement: "required",
          params: { min: 0, max: 50, inclusive: true },
        },
        {
          type: "unique",
          enforcement: "required",
        },
      ],
    };

    // V2 API: Should succeed with ValidField
    const result = await Effect.runPromise(
      validateField(connection, "test_data", "temperature", specField),
    );

    assertEquals(result, { fieldName: "temperature", status: "valid" });
  });
});
