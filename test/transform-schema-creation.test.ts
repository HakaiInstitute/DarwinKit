/**
 * Schema Creation Test
 *
 * Ensures that `createTableFromSchema` creates plain all-VARCHAR output
 * tables containing only the mapped fields (plus `_row_number`), with no
 * enforcement DDL (no ENUM types, no PRIMARY KEY / FOREIGN KEY constraints).
 * Enforcement is SQL detection over the populated table, matching the
 * validation path.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { createTableFromSchema } from "@dwkit/core/transform";
import type { WorkspaceConfig } from "@dwkit/domain/schemas";
import { assert, assertEquals, assertExists } from "@std/assert";
import * as Effect from "effect/Effect";

Deno.test("createTableFromSchema - creates all-VARCHAR tables of only the mapped fields plus _row_number", async () => {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();

  const config: WorkspaceConfig = {
    version: "1",
    standard: { base: "darwin-core", variant: "obis" },
    name: "",
    id: "",
    createdAt: new Date(),
    updatedAt: new Date(),
    transform: {
      nullValues: [],
      output: { outputDir: "", exportDB: false },
      inputs: {},
      postImportTransforms: [],
      datasets: [
        {
          name: "Occurrence",
          class: "Occurrence",
          source: { test: "" },
          fields: {
            occurrenceID: "test.id",
            basisOfRecord: "test.bor",
          },
        },
      ],
    },
  };

  try {
    await Effect.runPromise(createTableFromSchema(connection, config));

    const info = (await connection.runAndReadAll("PRAGMA table_info(occurrence);")).getRowObjects();

    // A mapped controlled-vocabulary field is a plain VARCHAR column (not ENUM).
    const basisOfRecord = info.find((c) => c.name === "basisOfRecord");
    assertExists(basisOfRecord, "mapped basisOfRecord column should exist");
    assertEquals(
      String(basisOfRecord.type),
      "VARCHAR",
      "controlled-vocab field must be VARCHAR, not ENUM",
    );

    const rowNumber = info.find((c) => c.name === "_row_number");
    assertExists(rowNumber, "_row_number column should exist");

    // Only mapped fields become columns: an unmapped spec field (e.g.
    // occurrenceStatus) must NOT be materialized as a placeholder column.
    assertEquals(
      info.find((c) => c.name === "occurrenceStatus"),
      undefined,
      "unmapped spec fields must not be materialized as columns",
    );
    assertEquals(
      info.map((c) => c.name).sort(),
      ["_row_number", "basisOfRecord", "occurrenceID"],
      "table should contain exactly the mapped fields plus _row_number",
    );

    // No ENUM types created.
    const enums = (await connection.runAndReadAll(
      "SELECT type_name FROM duckdb_types() WHERE type_name LIKE 'occurrence_%_enum'",
    )).getRowObjects();
    assertEquals(enums.length, 0, "no ENUM types should be created");

    // No primary-key / foreign-key constraints.
    const constraints = (await connection.runAndReadAll(
      "SELECT constraint_type FROM information_schema.table_constraints WHERE table_name = 'occurrence'",
    )).getRowObjects();
    assert(
      constraints.every((c) =>
        c.constraint_type !== "PRIMARY KEY" && c.constraint_type !== "FOREIGN KEY"
      ),
      "no PK/FK constraints should exist",
    );
  } finally {
    connection.closeSync();
  }
});
