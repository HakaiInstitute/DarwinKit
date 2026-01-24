/**
 * Tests for enforcement level behavior through the validation pipeline
 *
 * This test validates that enforcement levels (required, recommended, optional)
 * properly flow through the validation pipeline and generate violations with
 * the correct severity levels.
 */

import type { DuckDBConnection } from "@duckdb/node-api";
import type { FieldDefinition } from "@dwkt/domain";
import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import { validateRangeConstraints } from "./field-validators.ts";
import { withTestConnection } from "./test-utils.ts";

/**
 * Helper: Create test table with data that violates range constraints
 */
async function setupTestTable(connection: DuckDBConnection): Promise<void> {
  await connection.run(`
    CREATE TABLE test_data (
      _row_number INTEGER,
      latitude DOUBLE
    )
  `);

  // Create data that violates range constraints (-90 to 90)
  await connection.run(`
    INSERT INTO test_data VALUES
    (1, -95.0),
    (2, 100.0)
  `);
}

/**
 * End-to-end test: Validates that enforcement levels flow through
 * the validation pipeline and generate violations with correct severity
 */
Deno.test("enforcement levels flow through validation pipeline", async (t) => {
  await t.step("required enforcement generates error-level violations", async () => {
    await withTestConnection(async (connection) => {
      await setupTestTable(connection);

      const specField: FieldDefinition = {
        name: "latitude",
        type: "number",
        validators: [
          {
            type: "range",
            enforcement: "required",
            params: { min: -90, max: 90, inclusive: true },
          },
        ],
      };

      const result = await Effect.runPromise(
        validateRangeConstraints(connection, "test_data", "latitude", specField).pipe(
          Effect.either,
        ),
      );

      // Should fail with violations
      assertEquals(result._tag, "Left");
      if (result._tag === "Left") {
        const violations = result.left;
        assertEquals(violations.length, 2, "Should have 2 range violations");

        // All violations should have required enforcement and error severity
        for (const violation of violations) {
          assertEquals(violation.enforcement, "required", "Enforcement should be 'required'");
          assertEquals(violation.severity, "error", "Severity should be 'error'");
          assertEquals(violation._tag, "RangeViolation");
        }
      }
    });
  });

  await t.step("recommended enforcement generates warning-level violations", async () => {
    await withTestConnection(async (connection) => {
      await setupTestTable(connection);

      const specField: FieldDefinition = {
        name: "latitude",
        type: "number",
        validators: [
          {
            type: "range",
            enforcement: "recommended",
            params: { min: -90, max: 90, inclusive: true },
          },
        ],
      };

      const result = await Effect.runPromise(
        validateRangeConstraints(connection, "test_data", "latitude", specField).pipe(
          Effect.either,
        ),
      );

      // Should fail with violations
      assertEquals(result._tag, "Left");
      if (result._tag === "Left") {
        const violations = result.left;
        assertEquals(violations.length, 2, "Should have 2 range violations");

        // All violations should have recommended enforcement and warning severity
        for (const violation of violations) {
          assertEquals(
            violation.enforcement,
            "recommended",
            "Enforcement should be 'recommended'",
          );
          assertEquals(violation.severity, "warning", "Severity should be 'warning'");
          assertEquals(violation._tag, "RangeViolation");
        }
      }
    });
  });

  await t.step("optional enforcement generates info-level violations", async () => {
    await withTestConnection(async (connection) => {
      await setupTestTable(connection);

      const specField: FieldDefinition = {
        name: "latitude",
        type: "number",
        validators: [
          {
            type: "range",
            enforcement: "optional",
            params: { min: -90, max: 90, inclusive: true },
          },
        ],
      };

      const result = await Effect.runPromise(
        validateRangeConstraints(connection, "test_data", "latitude", specField).pipe(
          Effect.either,
        ),
      );

      // Should fail with violations
      assertEquals(result._tag, "Left");
      if (result._tag === "Left") {
        const violations = result.left;
        assertEquals(violations.length, 2, "Should have 2 range violations");

        // All violations should have optional enforcement and info severity
        for (const violation of violations) {
          assertEquals(violation.enforcement, "optional", "Enforcement should be 'optional'");
          assertEquals(violation.severity, "info", "Severity should be 'info'");
          assertEquals(violation._tag, "RangeViolation");
        }
      }
    });
  });
});
