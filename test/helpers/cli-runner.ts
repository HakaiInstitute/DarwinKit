import * as path from "@std/path";

const MAIN_TS = path.fromFileUrl(
  new URL("../../packages/cli/main.ts", import.meta.url),
);

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Run the DarwinKit CLI in a subprocess with the permissions the CLI needs.
 * Colors are disabled so tests can assert on plain text.
 */
export async function runCli(
  args: string[],
  options: { cwd?: string } = {},
): Promise<CliResult> {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-run",
      "--allow-ffi",
      "--allow-net",
      MAIN_TS,
      ...args,
    ],
    cwd: options.cwd,
    stdout: "piped",
    stderr: "piped",
    env: { NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  const { stdout, stderr, code } = await command.output();
  const decoder = new TextDecoder();
  return {
    stdout: decoder.decode(stdout),
    stderr: decoder.decode(stderr),
    code,
  };
}
