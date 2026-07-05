import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";

// install.sh is unix-only; skip on Windows (install.ps1 covers Windows).
const unix = Deno.build.os !== "windows";

/** Mirror install.sh's own target detection so the fake asset matches the host. */
function hostTarget(): string {
  const os = Deno.build.os === "darwin" ? "darwin" : "linux";
  const arch = Deno.build.arch === "aarch64" ? "arm64" : "x86_64";
  return `${os}-${arch}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", bytes as BufferSource),
  );
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Build a fake release dir: an executable `dwkit-<target>` plus SHA256SUMS. */
async function fakeRelease(
  dir: string,
  target: string,
  { corruptChecksum = false } = {},
): Promise<void> {
  const asset = `dwkit-${target}`;
  const script = "#!/bin/sh\necho 9.9.9\n";
  const bytes = new TextEncoder().encode(script);
  await Deno.writeFile(join(dir, asset), bytes, { mode: 0o755 });
  const hash = corruptChecksum ? "0".repeat(64) : await sha256Hex(bytes);
  await Deno.writeTextFile(join(dir, "SHA256SUMS"), `${hash}  ${asset}\n`);
}

async function runInstaller(
  releaseDir: string,
  installDir: string,
): Promise<{ code: number; stderr: string }> {
  const cmd = new Deno.Command("sh", {
    args: ["install.sh"],
    env: {
      DWKIT_BASE_URL: `file://${releaseDir}`,
      DWKIT_INSTALL_DIR: installDir,
    },
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  return { code: out.code, stderr: new TextDecoder().decode(out.stderr) };
}

Deno.test({
  name: "install.sh installs the binary when the checksum matches",
  ignore: !unix,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const releaseDir = join(tmp, "release");
      const installDir = join(tmp, "bin");
      await Deno.mkdir(releaseDir);
      await fakeRelease(releaseDir, hostTarget());

      const { code, stderr } = await runInstaller(releaseDir, installDir);
      assertEquals(code, 0, stderr);

      const dest = join(installDir, "dwkit");
      const info = await Deno.stat(dest);
      assert(info.isFile, "dwkit should be installed");

      const run = await new Deno.Command(dest, { args: ["--version"] }).output();
      assertEquals(new TextDecoder().decode(run.stdout).trim(), "9.9.9");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "install.sh aborts and installs nothing on checksum mismatch",
  ignore: !unix,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const releaseDir = join(tmp, "release");
      const installDir = join(tmp, "bin");
      await Deno.mkdir(releaseDir);
      await fakeRelease(releaseDir, hostTarget(), { corruptChecksum: true });

      const { code, stderr } = await runInstaller(releaseDir, installDir);
      assert(code !== 0, "installer must fail on checksum mismatch");
      assertStringIncludes(stderr, "checksum mismatch");

      let installed = true;
      try {
        await Deno.stat(join(installDir, "dwkit"));
      } catch {
        installed = false;
      }
      assert(!installed, "no binary should be installed on mismatch");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
