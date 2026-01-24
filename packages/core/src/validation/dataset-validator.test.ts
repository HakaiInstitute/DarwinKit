/**
 * Tests for dataset-validator.ts - Either-based parallel validation
 *
 * These tests verify the Either-based validator with parallel field validation.
 */

import { assert, assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import { withTestConnection } from "./test-utils.ts";
import type { DatasetConfig, ValidationProfile } from "@dwkt/domain";
import { validateDataset } from "./dataset-validator.ts";

Deno.test("validateDataset - should accumulate violations from multiple fields in parallel", async () => {
  await withTestConnection(async (connection) => {
    // Create raw table with data that has multiple validation issues
    await connection.run(`
      CREATE TABLE raw_test_dataset (
        _row_number INTEGER,
        temperature DOUBLE,
        humidity DOUBLE,
        station_id VARCHAR
      )
    `);

    await connection.run(`
      INSERT INTO raw_test_dataset VALUES
      (1, -5.0, 65.0, 'station-1'),   -- temp out of range
      (2, 60.0, 150.0, 'station-2'),  -- temp and humidity out of range
      (3, 25.0, 50.0, 'station-3'),   -- all valid
      (4, 30.0, 75.0, 'station-3')    -- duplicate station_id
    `);

    // Create schema table
    await connection.run(`
      CREATE TABLE test (
        temperature DOUBLE,
        humidity DOUBLE,
        station_id VARCHAR
      )
    `);

    const dataset: DatasetConfig = {
      name: "test_dataset",
      spec: "test-profile",
      path: "./test.csv",
      fieldMappings: [
        { originName: "temperature", targetName: "temperature", isRequired: true },
        { originName: "humidity", targetName: "humidity", isRequired: true },
        { originName: "station_id", targetName: "station_id", isRequired: true },
      ],
    };

    const profile: ValidationProfile = {
      id: "test-profile",
      name: "test",
      description: "Test profile",
      targetSchema: "custom",
      fields: {},
      normalizedFields: {
        temperature: {
          name: "temperature",
          type: "number",
          validators: [
            {
              type: "range",
              enforcement: "required",
              params: { min: 0, max: 50, inclusive: true },
            },
          ],
        },
        humidity: {
          name: "humidity",
          type: "number",
          validators: [
            {
              type: "range",
              enforcement: "required",
              params: { min: 0, max: 100, inclusive: true },
            },
          ],
        },
        station_id: {
          name: "station_id",
          type: "string",
          validators: [
            {
              type: "unique",
              enforcement: "required",
            },
          ],
        },
      },
      fieldOverrides: {},
    };

    // V2 API: Should validate all fields in parallel and accumulate violations
    const result = await Effect.runPromise(
      validateDataset(connection, dataset, profile),
    );

    // Should have found violations
    assertEquals(result.status, "fail");

    // Should have accumulated violations from multiple fields
    const totalViolations = result.fieldViolations.errors.length +
      result.fieldViolations.warnings.length +
      result.fieldViolations.info.length;

    // Expected violations:
    // - 2 temperature range violations (rows 1, 2)
    // - 1 humidity range violation (row 2)
    // - 2 uniqueness violations (rows 3, 4 have duplicate station_id)
    // Total: 5 violations
    assert(totalViolations >= 5, `Expected at least 5 violations, got ${totalViolations}`);

    // Check that we have the expected violation types
    const allViolations = [
      ...result.fieldViolations.errors,
      ...result.fieldViolations.warnings,
      ...result.fieldViolations.info,
    ];

    const rangeViolations = allViolations.filter((v) => v._tag === "RangeViolation");
    const uniquenessViolations = allViolations.filter((v) => v._tag === "UniquenessViolation");

    assert(
      rangeViolations.length >= 3,
      `Expected at least 3 range violations, got ${rangeViolations.length}`,
    );
    assert(
      uniquenessViolations.length >= 2,
      `Expected at least 2 uniqueness violations, got ${uniquenessViolations.length}`,
    );
  });
});

Deno.test("validateDataset - should pass when all fields are valid", async () => {
  await withTestConnection(async (connection) => {
    // Create raw table with valid data
    await connection.run(`
      CREATE TABLE raw_valid_dataset (
        _row_number INTEGER,
        temperature DOUBLE,
        humidity DOUBLE
      )
    `);

    await connection.run(`
      INSERT INTO raw_valid_dataset VALUES
      (1, 25.0, 65.0),
      (2, 30.0, 70.0),
      (3, 28.5, 68.0)
    `);

    // Create schema table
    await connection.run(`
      CREATE TABLE valid (
        temperature DOUBLE,
        humidity DOUBLE
      )
    `);

    const dataset: DatasetConfig = {
      name: "valid_dataset",
      spec: "valid-profile",
      path: "./valid.csv",
      fieldMappings: [
        { originName: "temperature", targetName: "temperature", isRequired: true },
        { originName: "humidity", targetName: "humidity", isRequired: true },
      ],
    };

    const profile: ValidationProfile = {
      id: "valid-profile",
      name: "valid",
      description: "Valid test profile",
      targetSchema: "custom",
      fields: {},
      normalizedFields: {
        temperature: {
          name: "temperature",
          type: "number",
          validators: [
            {
              type: "range",
              enforcement: "required",
              params: { min: 0, max: 50, inclusive: true },
            },
          ],
        },
        humidity: {
          name: "humidity",
          type: "number",
          validators: [
            {
              type: "range",
              enforcement: "required",
              params: { min: 0, max: 100, inclusive: true },
            },
          ],
        },
      },
      fieldOverrides: {},
    };

    // V2 API: Should pass validation
    const result = await Effect.runPromise(
      validateDataset(connection, dataset, profile),
    );

    // Should pass with no violations
    assertEquals(result.status, "pass");
    assertEquals(result.fieldViolations.errors.length, 0);
    assertEquals(result.fieldViolations.warnings.length, 0);
    assertEquals(result.rowsProcessed, 3);
  });
});

Deno.test("validateDataset - should handle schema violations correctly", async () => {
  await withTestConnection(async (connection) => {
    // Create raw table with missing required field
    await connection.run(`
      CREATE TABLE raw_schema_test (
        _row_number INTEGER,
        temperature DOUBLE
      )
    `);

    await connection.run(`
      INSERT INTO raw_schema_test VALUES
      (1, 25.0)
    `);

    // Create schema table
    await connection.run(`
      CREATE TABLE schema_test (
        temperature DOUBLE,
        humidity DOUBLE
      )
    `);

    const dataset: DatasetConfig = {
      name: "schema_test",
      spec: "schema-profile",
      path: "./schema_test.csv",
      fieldMappings: [
        { originName: "temperature", targetName: "temperature", isRequired: true },
        // Missing humidity mapping
      ],
    };

    const profile: ValidationProfile = {
      id: "schema-profile",
      name: "schema_test",
      description: "Schema test profile",
      targetSchema: "custom",
      fields: {},
      normalizedFields: {
        temperature: {
          name: "temperature",
          type: "number",
          validators: [],
        },
        humidity: {
          name: "humidity",
          type: "number",
          validators: [],
        },
      },
      fieldOverrides: {
        humidity: {
          requirement: "required",
        },
      },
    };

    // V2 API: Should detect schema violation (missing required field)
    const result = await Effect.runPromise(
      validateDataset(connection, dataset, profile),
    );

    // Should fail due to schema violation
    assertEquals(result.status, "fail");
    assert(result.schemaViolations.errors.length > 0, "Should have schema errors");

    // Should have MissingFieldViolation
    const missingFieldViolations = result.schemaViolations.errors.filter((v) =>
      v._tag === "MissingFieldViolation"
    );
    assert(missingFieldViolations.length > 0, "Should have missing field violation");
  });
});
