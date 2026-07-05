import { assertEquals, assertStringIncludes } from '@std/assert';
import { stripAnsiCode } from '@std/fmt/colors';
import { runCli } from '../../test/helpers/cli-runner.ts';

Deno.test('CLI executable runs and displays help', async () => {
  const { stdout, stderr, code } = await runCli([]);
  const output = stripAnsiCode(stdout);

  assertEquals(code, 0, `CLI failed: ${stderr}`);
  assertStringIncludes(output, 'dwkit');
  assertStringIncludes(output, 'validate');
});

Deno.test('CLI --version --format json reports version and schemaVersion', async () => {
  const { stdout, code } = await runCli(['--version', '--format', 'json']);
  assertEquals(code, 0);
  const parsed = JSON.parse(stdout.trim());
  assertEquals(typeof parsed.version, 'string');
  assertEquals(parsed.schemaVersion, 1);
});

Deno.test('CLI --version (plain) prints just the version string', async () => {
  const { stdout, code } = await runCli(['--version']);
  assertEquals(code, 0);
  assertEquals(/^\d+\.\d+\.\d+/.test(stdout.trim()), true);
});
