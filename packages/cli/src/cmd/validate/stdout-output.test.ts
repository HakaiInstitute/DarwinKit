import { assert, assertEquals, assertStringIncludes } from '@std/assert';
import * as path from '@std/path';

const MAIN_TS = path.fromFileUrl(new URL('../../../main.ts', import.meta.url));
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

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runValidate(args: string[], cwd: string): Promise<RunResult> {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      '--allow-read',
      '--allow-write',
      '--allow-env',
      '--allow-run',
      '--allow-ffi',
      '--allow-net',
      MAIN_TS,
      'validate',
      ...args,
    ],
    cwd,
    stdout: 'piped',
    stderr: 'piped',
    env: { NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  const { stdout, stderr, code } = await command.output();
  return {
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
    code,
  };
}

/** Result-file names/dirs we must NOT find when emitting to stdout. */
function resultArtifacts(cwd: string): string[] {
  return [...Deno.readDirSync(cwd)]
    .map((e) => e.name)
    .filter((n) => n.endsWith('.json') || n.endsWith('.md') || n === 'validation_results');
}

// NOTE: the bundled fixtures all produce validation errors (there is no
// truly-clean OBIS pass fixture). That is fine — these tests assert WHERE output
// goes, not the validation status. A failing fixture is in fact a stronger test:
// it proves stdout stays pure JSON even while many diagnostics print to stderr.
// Exit codes are asserted only in the dedicated Case A / Case B tests below.

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
    const { stdout } = await runValidate(
      ['--format', 'json', '--config', VALID_CONFIG, '--output-dir', outDir],
      cwd,
    );

    const files = [...Deno.readDirSync(outDir)].map((e) => e.name);
    assert(
      files.some((f) => f.startsWith('validation-results-') && f.endsWith('.json')),
      `expected a JSON results file, got: ${files}`,
    );

    // stdout is NOT the raw JSON payload in file mode
    assert(!stdout.trim().startsWith('{'), `stdout unexpectedly held JSON:\n${stdout}`);

    // file mode still prints the human-readable footer (guards printSummary(Output, ...))
    assertStringIncludes(stdout, 'written to:');
    assertStringIncludes(stdout, 'Overall status:');
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

    // stdout is NOT the raw markdown payload in file mode
    assert(!stdout.trimStart().startsWith('#'), `stdout unexpectedly held markdown:\n${stdout}`);
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
