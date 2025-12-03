import { assertEquals, assertStringIncludes } from '@std/assert';
import { stripAnsiCode } from '@std/fmt/colors';
import * as path from '@std/path';

Deno.test('CLI executable runs and displays help', async () => {
  const cliDir = path.dirname(new URL(import.meta.url).pathname);

  const process = new Deno.Command(Deno.execPath(), {
    args: [
      'run',
      '--allow-read',
      '--allow-write',
      '--allow-env',
      '--allow-run',
      '--allow-ffi',
      '--allow-net',
      './main.ts',
    ],
    stdout: 'piped',
    stderr: 'piped',
    cwd: cliDir,
    env: {
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
  });

  const { stdout, stderr, code } = await process.output();
  const output = stripAnsiCode(new TextDecoder().decode(stdout));
  const stderrOutput = new TextDecoder().decode(stderr);

  assertEquals(code, 0, `CLI failed: ${stderrOutput}`);
  assertStringIncludes(output, 'darwinkit');
  assertStringIncludes(output, 'validate');
});
