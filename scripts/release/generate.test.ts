import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { generateReleaseArtifacts, sha256Hex } from "./generate.ts";
import { PLATFORM_TARGETS } from "./manifest.ts";

Deno.test("generateReleaseArtifacts writes manifest, SHA256SUMS, and index", async () => {
  const dist = await Deno.makeTempDir({ prefix: "dwkit-dist-" });
  const out = await Deno.makeTempDir({ prefix: "dwkit-out-" });
  const names = PLATFORM_TARGETS.map((t) => `dwkit-${t}${t.startsWith("windows") ? ".exe" : ""}`);
  for (const n of names) await Deno.writeTextFile(join(dist, n), `binary:${n}`);

  const { manifest, index, sha256sums } = await generateReleaseArtifacts({
    distDir: dist,
    version: "1.3.2",
    released: "2026-06-15",
    baseUrl: "https://example.com/v1.3.2",
    prerelease: false,
    currentIndex: null,
    schemaVersion: 1,
    outDir: out,
  });

  assertEquals(manifest.platforms.length, 5);
  assertEquals(index.latest, "1.3.2");
  // SHA256SUMS lines agree with the manifest's inline hashes.
  for (const p of manifest.platforms) {
    const expected = await sha256Hex(await Deno.readFile(join(dist, p.filename)));
    assertEquals(p.sha256, expected);
    assertEquals(sha256sums.includes(`${expected}  ${p.filename}`), true);
  }
  // Files landed on disk.
  await Deno.stat(join(out, "manifest.json"));
  await Deno.stat(join(out, "SHA256SUMS"));
  await Deno.stat(join(out, "index.json"));
});
