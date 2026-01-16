/**
 * Integration tests for validation/database/schema-builder.ts
 */

import { assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";
import { withTestConnection } from "../test-utils.ts";
import { importSchemaToWorkspace } from "./schema-builder.ts";

// ============================================================================
// Profile-Specific Tests
// ============================================================================

type ProfileTableCreationTestCase = {
  description: string;
  datasetName: string;
  spec: string;
  expectedTableName: string;
  expectedIdField: string;
};

const profileTableCreationTestCases: ProfileTableCreationTestCase[] = [
  {
    description: "creates table for Event profile",
    datasetName: "test_dataset",
    spec: "dwc-event",
    expectedTableName: "event",
    expectedIdField: "eventID",
  },
  {
    description: "creates table for Occurrence profile",
    datasetName: "occurrences",
    spec: "dwc-occurrence",
    expectedTableName: "occurrence",
    expectedIdField: "occurrenceID",
  },
  {
    description: "creates table for Taxon profile",
    datasetName: "taxa",
    spec: "dwc-taxon",
    expectedTableName: "taxon",
    expectedIdField: "taxonID",
  },
];

Deno.test("importSchemaToWorkspace - profile-specific tables", async (t) => {
  for (const testCase of profileTableCreationTestCases) {
    await t.step(testCase.description, async () => {
      await withTestConnection(async (connection) => {
        const dataset = {
          name: testCase.datasetName,
          spec: testCase.spec,
        };

        await Effect.runPromise(
          importSchemaToWorkspace(connection, dataset, [dataset]),
        );

        // Verify table was created
        const tableResult = await connection.runAndReadAll(
          `SELECT table_name FROM information_schema.tables WHERE table_name = '${testCase.expectedTableName}'`,
        );
        assertEquals(tableResult.getRowObjects().length, 1);

        // Verify ID field exists
        const columnResult = await connection.runAndReadAll(
          `SELECT column_name FROM information_schema.columns WHERE table_name = '${testCase.expectedTableName}'`,
        );
        const columnNames = columnResult.getRowObjects().map((r) => r.column_name);
        assertExists(columnNames.find((name: unknown) => name === testCase.expectedIdField));

        // Verify _row_number column exists
        assertExists(columnNames.find((name: unknown) => name === "_row_number"));
      });
    });
  }
});

// ============================================================================
// Edge Case Tests
// ============================================================================

Deno.test("importSchemaToWorkspace - handles dataset with no profile", async () => {
  await withTestConnection(async (connection) => {
    const dataset = {
      name: "test_dataset",
      // No spec or profile
    };

    // Should succeed but not create table (logs warning)
    await Effect.runPromise(
      importSchemaToWorkspace(connection, dataset, [dataset]),
    );

    // Verify no table was created
    const result = await connection.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'test_dataset'",
    );

    assertEquals(result.getRowObjects().length, 0);
  });
});
