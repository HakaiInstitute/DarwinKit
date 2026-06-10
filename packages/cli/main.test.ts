import { assertEquals, assertStringIncludes } from '@std/assert';
import { stripAnsiCode } from '@std/fmt/colors';
import { runCli } from '../../test/helpers/cli-runner.ts';

Deno.test('CLI executable runs and displays help', async () => {
  const { stdout, stderr, code } = await runCli([]);
  const output = stripAnsiCode(stdout);

  assertEquals(code, 0, `CLI failed: ${stderr}`);
  assertStringIncludes(output, 'darwinkit');
  assertStringIncludes(output, 'validate');
});
