import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import { join } from '@std/path';
import { runCli } from '../../../../../test/helpers/cli-runner.ts';

/**
 * End-to-end CLI tests for `dwkit transform`: the CLI must render the
 * `WorkspaceValidationResult` returned by `transformFile` and set the exit
 * code from `overallStatus` (files are only written by `transformFile` when
 * status is not "fail" — see packages/core/src/transform/transform.ts).
 *
 * Fixtures mirror test/transform-file.test.ts's known-passing/failing shapes.
 */

Deno.test('transform exits 1 and writes no output when the transformed output fails validation', async () => {
  const workspaceDir = await Deno.makeTempDir({ prefix: 'dwkt-cli-transform-gate-' });
  const outputDir = join(workspaceDir, 'output');
  const configPath = join(workspaceDir, 'darwinkit.yaml');

  const yaml = `
id: transform-gate-test
name: Gate
transform:
  inputs:
    source_data: source_data.csv
  nullValues: []
  datasets:
    - name: Occurrence
      class: Occurrence
      source:
        source_data: source_data
      fields:
        occurrenceID: source_data.occ_id
        basisOfRecord: "'NotAValidBasis'"
  output:
    outputDir: ${outputDir}
    exportDB: false
    outputFilesWithTimestamp: false
`;

  try {
    await Deno.writeTextFile(configPath, yaml);
    await Deno.writeTextFile(join(workspaceDir, 'source_data.csv'), 'occ_id\nocc01');

    const { stdout, stderr, code } = await runCli(
      ['transform', '--config', configPath],
      { cwd: workspaceDir },
    );

    assertEquals(code, 1);
    assertStringIncludes((stdout + stderr).toLowerCase(), 'fail');

    const outputExists = await Deno.stat(outputDir).then(() => true).catch(() => false);
    assert(!outputExists, 'no output should be written when validation fails');
  } finally {
    await Deno.remove(workspaceDir, { recursive: true });
  }
});

Deno.test('transform exits 0 and writes output when the transformed output validates', async () => {
  const workspaceDir = await Deno.makeTempDir({ prefix: 'dwkt-cli-transform-pass-' });
  const outputDir = join(workspaceDir, 'output');
  const configPath = join(workspaceDir, 'darwinkit.yaml');

  const yaml = `
id: transform-success-test
name: Success
standard:
  base: darwin-core
  variant: obis
transform:
  inputs:
    source_data: source_data.csv
  nullValues:
    - NA
  datasets:
    - name: Event
      class: Event
      source:
        source_data: source_data
      fields:
        eventID: source_data.event_id
        year: source_data.event_year
        eventDate: "'2024-01-15'"
        decimalLatitude: "'48.5'"
        decimalLongitude: "'-123.4'"
        geodeticDatum: "'WGS84'"
    - name: Occurrence
      class: Occurrence
      source:
        source_data: source_data
      fields:
        occurrenceID: source_data.occ_id
        eventID: source_data.event_id
        basisOfRecord: "'HumanObservation'"
        occurrenceStatus: "'present'"
        scientificName: "'Homo sapiens'"
  output:
    outputDir: ${outputDir}
    exportDB: false
    outputFilesWithTimestamp: false
`;

  try {
    await Deno.writeTextFile(configPath, yaml);
    await Deno.writeTextFile(
      join(workspaceDir, 'source_data.csv'),
      'event_id,event_year,occ_id\nevt01,2024,occ01',
    );

    const { code } = await runCli(
      ['transform', '--config', configPath],
      { cwd: workspaceDir },
    );

    assertEquals(code, 0);

    const eventCsvExists = await Deno.stat(join(outputDir, 'event.csv')).then(() => true).catch(
      () => false,
    );
    const occCsvExists = await Deno.stat(join(outputDir, 'occurrence.csv')).then(() => true)
      .catch(() => false);
    assert(eventCsvExists, 'expected event.csv to be written');
    assert(occCsvExists, 'expected occurrence.csv to be written');
  } finally {
    await Deno.remove(workspaceDir, { recursive: true });
  }
});
