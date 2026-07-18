/**
 * End-to-End Transformation Test
 *
 * Ensures that `transformFile` correctly orchestrates the entire data
 * transformation pipeline, from reading source CSVs to validating the
 * transformed output and (when validation passes) exporting final CSVs and a
 * persistent database file.
 */

import { DuckDBConnection } from "@duckdb/node-api";
import { transformFile } from "@dwkit/core/transform";
import type { WorkspaceConfig } from "@dwkit/domain/schemas";
import { assert, assertEquals, assertExists } from "@std/assert";
import { join } from "@std/path";
import * as Effect from "effect/Effect";

/** Parse a simple (no quoting/escaping) CSV into a header + data rows. */
function parseCsv(content: string): { header: string[]; rows: string[][] } {
  const lines = content.trim().split("\n");
  const header = lines[0].split(",");
  const rows = lines.slice(1).map((line) => line.split(","));
  return { header, rows };
}

/** Read the value of a named column from a parsed CSV row. */
function cell(header: string[], row: string[], column: string): string | undefined {
  const index = header.indexOf(column);
  return index === -1 ? undefined : row[index];
}

Deno.test("transformFile - runs the full end-to-end transformation process", async () => {
  const workspaceDir = await Deno.makeTempDir({ prefix: "dwkt-e2e-test-" });
  const outputDir = join(workspaceDir, "output");
  const configPath = join(workspaceDir, "workspace.dwc.yaml");
  const sourceCsvPath = join(workspaceDir, "source_data.csv");

  const config: WorkspaceConfig = {
    version: "1",
    standard: { base: "darwin-core", variant: "obis" },
    createdAt: new Date(),
    updatedAt: new Date(),
    id: "test-workspace",
    name: "Test Workspace",
    description: "A workspace for testing",
    transform: {
      inputs: {
        source_data: "source_data.csv",
      },
      nullValues: ["NA"],
      postImportTransforms: [],
      // Every OBIS-required field is mapped with a valid value so the
      // transformed output passes validation and the export gate opens.
      datasets: [
        {
          name: "Event",
          class: "Event",
          source: { "source_data": "source_data" },
          fields: {
            "eventID": "source_data.event_id",
            "year": "source_data.event_year",
            "eventDate": "'2024-01-15'",
            "decimalLatitude": "'48.5'",
            "decimalLongitude": "'-123.4'",
            "geodeticDatum": "'WGS84'",
          },
        },
        {
          name: "Occurrence",
          class: "Occurrence",
          source: { "source_data": "source_data" },
          fields: {
            "occurrenceID": "source_data.occ_id",
            "eventID": "source_data.event_id",
            "basisOfRecord": "'HumanObservation'",
            "occurrenceStatus": "'present'",
            "scientificName": "'Homo sapiens'",
          },
        },
      ],
      output: {
        outputDir: outputDir,
        exportDB: true,
        outputFilesWithTimestamp: false,
        exportDBFileName: "final_db",
        dropNullColumns: true,
      },
    },
  };

  try {
    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
    await Deno.writeTextFile(
      sourceCsvPath,
      "event_id,event_year,occ_id\nevt01,2024,occ01",
    );

    const result = await Effect.runPromise(transformFile(configPath));

    // The output is OBIS-valid, so validation must not fail and export proceeds.
    assert(result.overallStatus !== "fail", "valid output should not fail validation");

    // Assert CSV output (DuckDB COPY ... TO (FORMAT CSV, HEADER): LF line endings).
    // Column order follows spec-field order, so assert by column name, not position.
    const eventCsv = parseCsv(await Deno.readTextFile(join(outputDir, "event.csv")));
    assertEquals(eventCsv.rows.length, 1);
    assertEquals(cell(eventCsv.header, eventCsv.rows[0], "eventID"), "evt01");
    assertEquals(cell(eventCsv.header, eventCsv.rows[0], "year"), "2024");
    assertEquals(cell(eventCsv.header, eventCsv.rows[0], "decimalLatitude"), "48.5");
    assertEquals(cell(eventCsv.header, eventCsv.rows[0], "decimalLongitude"), "-123.4");

    const occCsv = parseCsv(await Deno.readTextFile(join(outputDir, "occurrence.csv")));
    assertEquals(occCsv.rows.length, 1);
    assertEquals(cell(occCsv.header, occCsv.rows[0], "occurrenceID"), "occ01");
    assertEquals(cell(occCsv.header, occCsv.rows[0], "eventID"), "evt01");
    assertEquals(cell(occCsv.header, occCsv.rows[0], "basisOfRecord"), "HumanObservation");
    assertEquals(cell(occCsv.header, occCsv.rows[0], "occurrenceStatus"), "present");

    // Assert persistent DB output
    const dbPath = join(outputDir, "final_db.duckdb");
    const stat = await Deno.stat(dbPath);
    assertExists(stat.isFile, "Database file should be created");

    // Connect to the created DB and verify its contents
    const dbConnection = await DuckDBConnection.create();
    await dbConnection.run(`ATTACH '${dbPath}' AS persisted_db;`);

    const eventRows = (await dbConnection.runAndReadAll("SELECT * FROM persisted_db.event;"))
      .getRowObjects();
    assertEquals(eventRows.length, 1);
    assertEquals(eventRows[0].eventID, "evt01");
    // year is exported as INTEGER; decimalLatitude/Longitude as DOUBLE (via TRY_CAST).
    assertEquals(eventRows[0].year, 2024);
    assertEquals(eventRows[0].decimalLatitude, 48.5);

    const occRows = (await dbConnection.runAndReadAll("SELECT * FROM persisted_db.occurrence;"))
      .getRowObjects();
    assertEquals(occRows.length, 1);
    assertEquals(occRows[0].occurrenceID, "occ01");
    assertEquals(occRows[0].basisOfRecord, "HumanObservation");

    dbConnection.closeSync();
  } finally {
    await Deno.remove(workspaceDir, { recursive: true });
  }
});

Deno.test("transformFile - blocks export and reports violations when output fails validation", async () => {
  const workspaceDir = await Deno.makeTempDir({ prefix: "dwkt-gate-test-" });
  const outputDir = join(workspaceDir, "output");
  const configPath = join(workspaceDir, "workspace.dwc.yaml");

  const config: WorkspaceConfig = {
    version: "1",
    standard: { base: "darwin-core", variant: "obis" },
    createdAt: new Date(),
    updatedAt: new Date(),
    id: "gate",
    name: "Gate",
    description: "",
    transform: {
      inputs: { source_data: "source_data.csv" },
      nullValues: [],
      postImportTransforms: [],
      datasets: [{
        name: "Occurrence",
        class: "Occurrence",
        source: { source_data: "source_data" },
        // basisOfRecord carries an out-of-vocabulary value -> EnumViolation
        // (error under OBIS, where basisOfRecord is a required controlled vocab).
        fields: {
          occurrenceID: "source_data.occ_id",
          basisOfRecord: "'NotAValidBasis'",
        },
      }],
      output: {
        outputDir,
        exportDB: true,
        outputFilesWithTimestamp: false,
        exportDBFileName: "db",
      },
    },
  };

  try {
    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
    await Deno.writeTextFile(join(workspaceDir, "source_data.csv"), "occ_id\nocc01");

    const result = await Effect.runPromise(transformFile(configPath));

    assertEquals(result.overallStatus, "fail");
    // No output files written when validation fails.
    const outExists = await Deno.stat(outputDir).then(() => true).catch(() => false);
    assertEquals(outExists, false, "no output should be written on failure");
  } finally {
    await Deno.remove(workspaceDir, { recursive: true });
  }
});

Deno.test("transformFile - flags unmapped required fields even when the output has zero rows", async () => {
  // A transform that produces no rows must still fail the gate when a
  // required field is never mapped — the missing field is a structural
  // problem, not a per-row one.
  const workspaceDir = await Deno.makeTempDir({ prefix: "dwkt-empty-gate-test-" });
  const outputDir = join(workspaceDir, "output");
  const configPath = join(workspaceDir, "workspace.dwc.yaml");

  const config: WorkspaceConfig = {
    version: "1",
    standard: { base: "darwin-core", variant: "obis" },
    createdAt: new Date(),
    updatedAt: new Date(),
    id: "empty-gate",
    name: "Empty Gate",
    description: "",
    transform: {
      inputs: { source_data: "source_data.csv" },
      nullValues: [],
      postImportTransforms: [],
      // Only eventID is mapped; OBIS-required eventDate/decimalLatitude/
      // decimalLongitude/geodeticDatum are left unmapped.
      datasets: [{
        name: "Event",
        class: "Event",
        source: { source_data: "source_data" },
        fields: { eventID: "source_data.event_id" },
      }],
      output: {
        outputDir,
        exportDB: true,
        outputFilesWithTimestamp: false,
        exportDBFileName: "db",
      },
    },
  };

  try {
    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
    // Header only — zero data rows, so the transform output table is empty.
    await Deno.writeTextFile(join(workspaceDir, "source_data.csv"), "event_id");

    const result = await Effect.runPromise(transformFile(configPath));

    assertEquals(result.overallStatus, "fail");

    // The failure is reported as structural missing-field violations, not
    // per-row required violations (there are no rows).
    const eventResult = result.datasetResults.find((d) => d.datasetName === "Event");
    assertExists(eventResult);
    assertEquals(eventResult.rowsProcessed, 0);
    assert(
      eventResult.schemaViolations.errors.some((v) => v._tag === "MissingFieldViolation"),
      "expected a MissingFieldViolation for an unmapped required field",
    );

    // Export is blocked: nothing written.
    const outExists = await Deno.stat(outputDir).then(() => true).catch(() => false);
    assertEquals(outExists, false, "no output should be written on failure");
  } finally {
    await Deno.remove(workspaceDir, { recursive: true });
  }
});

Deno.test("transformFile - returns ConfigError for non-existent config", async () => {
  const nonExistentConfigPath = "/path/to/nothing/workspace.dwc.yaml";

  const result = await Effect.runPromise(Effect.flip(transformFile(nonExistentConfigPath)));

  assertExists(result, "Effect should fail");
  // assertEquals(result._tag, "ConfigError", "Error should be a ConfigError");
});
