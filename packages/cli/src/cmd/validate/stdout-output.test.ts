import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import * as path from '@std/path';
import { runCli } from '../../../../../test/helpers/cli-runner.ts';

const VALID_CONFIG = path.fromFileUrl(
  new URL(
    '../../../test-fixtures/valid-datasets/fc2022-complete/darwinkit.yaml',
    import.meta.url,
  ),
);
const INVALID_CONFIG = path.fromFileUrl(
  new URL(
    '../../../test-fixtures/invalid-datasets/mixed-validity/darwinkit.yaml',
    import.meta.url,
  ),
);

function runValidate(args: string[], cwd: string) {
  return runCli(['validate', ...args], { cwd });
}

/** Result-file names/dirs we must NOT find when emitting to stdout. */
function resultArtifacts(cwd: string): string[] {
  return [...Deno.readDirSync(cwd)]
    .map((e) => e.name)
    .filter((n) => n.endsWith('.json') || n.endsWith('.md') || n === 'validation_results');
}

// The bundled fixtures all produce validation errors; these tests assert WHERE
// output goes (stdout vs stderr vs file), not the validation status. Exit codes
// are asserted only in the exit-1 and missing-config tests below.

Deno.test('validate --format json writes only JSON to stdout', async () => {
  const cwd = await Deno.makeTempDir();
  try {
    const { stdout, stderr } = await runValidate(
      ['--format', 'json', '--config', VALID_CONFIG],
      cwd,
    );

    // stdout is pure JSON (parses, brace-delimited, nothing else)
    const trimmed = stdout.trim();
    assert(trimmed.startsWith('{'), `stdout did not start with '{':\n${stdout}`);
    assert(trimmed.endsWith('}'), `stdout did not end with '}':\n${stdout.slice(-200)}`);
    const parsed = JSON.parse(stdout);
    assertEquals(typeof parsed.overallStatus, 'string');
    assert(Array.isArray(parsed.datasetResults));

    // diagnostics went to stderr, not stdout
    assertStringIncludes(stderr, 'Overall status:');

    // no results file/dir was written in the working directory
    assertEquals(resultArtifacts(cwd), []);
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});

Deno.test('validate --format json --output-dir writes a JSON file (no stdout payload)', async () => {
  const cwd = await Deno.makeTempDir();
  const outDir = await Deno.makeTempDir();
  try {
    const { stdout, stderr } = await runValidate(
      ['--format', 'json', '--config', VALID_CONFIG, '--output-dir', outDir],
      cwd,
    );

    const files = [...Deno.readDirSync(outDir)].map((e) => e.name);
    assert(
      files.some((f) => f.startsWith('validation-results-') && f.endsWith('.json')),
      `expected a JSON results file, got: ${files}`,
    );

    // file mode: stdout carries no payload at all; diagnostics are on stderr
    assertEquals(stdout.trim(), '');
    assertStringIncludes(stderr, 'written to:');
    assertStringIncludes(stderr, 'Overall status:');
  } finally {
    await Deno.remove(cwd, { recursive: true });
    await Deno.remove(outDir, { recursive: true });
  }
});

Deno.test('validate --format json emits valid JSON and exit 1 when data has errors', async () => {
  const cwd = await Deno.makeTempDir();
  try {
    const { stdout, code } = await runValidate(
      ['--format', 'json', '--config', INVALID_CONFIG],
      cwd,
    );

    const parsed = JSON.parse(stdout);
    assertEquals(parsed.overallStatus, 'fail');
    assert(parsed.summary.totalErrors > 0, 'expected at least one error');
    assertEquals(code, 1);
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});

Deno.test('validate --format json with a missing config writes nothing to stdout', async () => {
  const cwd = await Deno.makeTempDir();
  try {
    const missing = path.join(cwd, 'does-not-exist.yaml');
    const { stdout, stderr, code } = await runValidate(
      ['--format', 'json', '--config', missing],
      cwd,
    );

    assertEquals(stdout.trim(), '');
    assert(stderr.length > 0, 'expected an error message on stderr');
    assert(code !== 0, 'expected a non-zero exit code');
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});

Deno.test('validate --format markdown writes markdown to stdout', async () => {
  const cwd = await Deno.makeTempDir();
  try {
    const { stdout, stderr } = await runValidate(
      ['--format', 'markdown', '--config', VALID_CONFIG],
      cwd,
    );

    // markdown payload (renderer's first line is a top-level heading)
    assert(
      stdout.trimStart().startsWith('#'),
      `stdout did not start with markdown heading:\n${stdout}`,
    );
    assert(!stdout.includes('written to:'), 'stdout leaked the file-write message');

    // diagnostics on stderr, no file written
    assertStringIncludes(stderr, 'Overall status:');
    assertEquals(resultArtifacts(cwd), []);
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});

Deno.test('validate --format markdown --output-dir writes a markdown file (no stdout payload)', async () => {
  const cwd = await Deno.makeTempDir();
  const outDir = await Deno.makeTempDir();
  try {
    const { stdout } = await runValidate(
      ['--format', 'markdown', '--config', VALID_CONFIG, '--output-dir', outDir],
      cwd,
    );

    const files = [...Deno.readDirSync(outDir)].map((e) => e.name);
    assert(
      files.some((f) => f.startsWith('validation-results-') && f.endsWith('.md')),
      `expected a markdown results file, got: ${files}`,
    );

    // file mode: stdout carries no payload at all
    assertEquals(stdout.trim(), '');
  } finally {
    await Deno.remove(cwd, { recursive: true });
    await Deno.remove(outDir, { recursive: true });
  }
});

Deno.test('validate --format markdown_summary_action writes the fixed-name file', async () => {
  const cwd = await Deno.makeTempDir();
  try {
    // The file is written by outputResults before the (failing) exit code is set,
    // so it exists regardless of the dataset's validation status.
    await runValidate(
      ['--format', 'markdown_summary_action', '--config', VALID_CONFIG],
      cwd,
    );

    const file = path.join(cwd, 'validation_results', 'validation-results.md');
    const stat = await Deno.stat(file);
    assert(stat.isFile, 'expected validation-results.md to be written');
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});

Deno.test('validate table format writes the report to stdout and status to stderr', async () => {
  const cwd = await Deno.makeTempDir();
  try {
    const { stdout, stderr } = await runValidate(['--config', VALID_CONFIG], cwd);

    // the table report is the payload → stdout
    assertStringIncludes(stdout, 'Workspace validation completed');
    assertStringIncludes(stdout, 'Summary:');

    // status footer and progress are diagnostics → stderr
    assertStringIncludes(stderr, 'Overall status:');
    assert(!stdout.includes('Overall status:'), 'status footer leaked into stdout');
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});

Deno.test('validate prints the status footer exactly once on stderr', async () => {
  const cwd = await Deno.makeTempDir();
  try {
    const { stderr } = await runValidate(
      ['--format', 'json', '--config', INVALID_CONFIG],
      cwd,
    );

    const statusLines = stderr
      .split('\n')
      .filter((line) => line.includes('Overall status:'));
    assertEquals(statusLines.length, 1, `expected one status line, got:\n${stderr}`);
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});

Deno.test('validate --format markdown_summary_action honors --output-dir', async () => {
  const cwd = await Deno.makeTempDir();
  const outDir = await Deno.makeTempDir();
  try {
    await runValidate(
      ['--format', 'markdown_summary_action', '--config', VALID_CONFIG, '--output-dir', outDir],
      cwd,
    );

    const stat = await Deno.stat(path.join(outDir, 'validation-results.md'));
    assert(stat.isFile, 'expected validation-results.md in the explicit output dir');
  } finally {
    await Deno.remove(cwd, { recursive: true });
    await Deno.remove(outDir, { recursive: true });
  }
});

Deno.test('validate with an unknown --format warns on stderr and falls back to table', async () => {
  const cwd = await Deno.makeTempDir();
  try {
    const { stdout, stderr } = await runValidate(
      ['--format', 'bogus', '--config', VALID_CONFIG],
      cwd,
    );

    assertStringIncludes(stderr, 'Unknown format "bogus"');
    assert(!stdout.includes('Unknown format'), 'warning leaked into stdout');
    assert(!stdout.trim().startsWith('{'), 'stdout should hold the table, not JSON');
    assertStringIncludes(stdout, 'Workspace validation completed');
  } finally {
    await Deno.remove(cwd, { recursive: true });
  }
});
