/**
 * CSV-vs-Parquet ingestion parity: a dataset validated as Parquet must produce
 * the same violation counts as the same dataset validated as CSV.
 */

import { DuckDBInstance } from "@duckdb/node-api";
import { WorkspaceValidator } from "@dwkt/core/validation";
import { assertEquals } from "@std/assert";
import { stringify as stringifyYaml } from "@std/yaml";
import * as Effect from "effect/Effect";

const EVENT_CSV = new URL("./data/FC2022_event.csv", import.meta.url).pathname;

async function csvToParquet(csvPath: string, parquetPath: string): Promise<void> {
  const instance = await DuckDBInstance.create(":memory:");
  const connection = await instance.connect();
  try {
    // Apply the same nullstr the CSV validation path uses, so the Parquet's
    // native NULLs mirror "R staged NA -> NULL". This keeps the two runs comparable
    // even though importParquet does NOT re-apply nullValues.
    await connection.run(
      `COPY (SELECT * FROM read_csv_auto('${csvPath}', nullstr=['NA', 'N/A', '', 'NULL', 'null']))
       TO '${parquetPath}' (FORMAT parquet)`,
    );
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

function configFor(datasetPath: string): string {
  return stringifyYaml({
    name: "parity",
    standard: "obis",
    validation: {
      nullValues: ["NA", "N/A", "", "NULL", "null"],
      datasets: [
        { name: "events", class: "Event", path: datasetPath, description: "parity test" },
      ],
    },
  });
}

function countViolations(result: {
  datasetResults: ReadonlyArray<{
    schemaViolations: {
      errors: ReadonlyArray<unknown>;
      warnings: ReadonlyArray<unknown>;
      info: ReadonlyArray<unknown>;
    };
    fieldViolations: {
      errors: ReadonlyArray<unknown>;
      warnings: ReadonlyArray<unknown>;
      info: ReadonlyArray<unknown>;
    };
  }>;
}): number {
  let n = 0;
  for (const d of result.datasetResults) {
    n += d.schemaViolations.errors.length + d.schemaViolations.warnings.length +
      d.schemaViolations.info.length;
    n += d.fieldViolations.errors.length + d.fieldViolations.warnings.length +
      d.fieldViolations.info.length;
  }
  return n;
}

Deno.test("parquet ingestion matches CSV ingestion", async () => {
  const dir = await Deno.makeTempDir();
  const parquetPath = `${dir}/events.parquet`;
  await csvToParquet(EVENT_CSV, parquetPath);

  const validator = new WorkspaceValidator();

  const csvConfigPath = `${dir}/csv-darwinkit.yaml`;
  await Deno.writeTextFile(csvConfigPath, configFor(EVENT_CSV));
  const csvResult = await Effect.runPromise(validator.validateFromConfig(csvConfigPath));

  const pqConfigPath = `${dir}/pq-darwinkit.yaml`;
  await Deno.writeTextFile(pqConfigPath, configFor(parquetPath));
  const pqResult = await Effect.runPromise(validator.validateFromConfig(pqConfigPath));

  assertEquals(countViolations(pqResult), countViolations(csvResult));
  assertEquals(pqResult.overallStatus, csvResult.overallStatus);

  await Deno.remove(dir, { recursive: true });
});
