import { DuckDBConnection } from "@duckdb/node-api";
import { assertEquals } from "@std/assert";
import * as Effect from "effect/Effect";
import { resolveProfile } from "@dwkit/domain/specs";
import { resolveSpecFields } from "./field-resolution.ts";
import { validateTable } from "./table-validator.ts";

// Task 2 delivers `resolveTransformFields`, which will build the same
// `ResolvedFieldsEntry` shape from a class + column list. For Task 1 the fixture
// is assembled inline from functions that already exist (`resolveProfile` +
// `resolveSpecFields`) so this test can guard the extracted detection core on
// its own. `validateTable` reads `entry.all` (deriving valid mappings from the
// table's actual columns) and `entry.resolvedSpec`; it does not read
// `entry.mapped`, so an empty `mapped` is fine here.

Deno.test("validateTable - flags an out-of-vocabulary value on an all-VARCHAR table", async () => {
  const connection = await DuckDBConnection.create();
  try {
    await connection.run(
      `CREATE TABLE occurrence (occurrenceID VARCHAR, basisOfRecord VARCHAR, _row_number BIGINT)`,
    );
    await connection.run(
      `INSERT INTO occurrence VALUES ('occ1', 'HumanObservation', 1), ('occ2', 'NotAValue', 2)`,
    );

    const profile = resolveProfile("obis", "Occurrence");
    if (!profile) throw new Error("expected Occurrence profile to resolve");
    const all = resolveSpecFields(profile, "obis", []);
    const entry = { all, mapped: {}, resolvedSpec: profile };

    const result = await Effect.runPromise(
      validateTable(connection, {
        tableName: "occurrence",
        entry,
        standard: { base: "darwin-core", variant: "obis" },
        datasetName: "Occurrence",
      }),
    );

    const enumViolations = result.fieldViolations.filter((v) => v._tag === "EnumViolation");
    assertEquals(enumViolations.length, 1);
    assertEquals(enumViolations[0].rowNumber, 2);
  } finally {
    connection.closeSync();
  }
});
