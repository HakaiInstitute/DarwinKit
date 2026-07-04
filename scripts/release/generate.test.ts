import { assertEquals, assertRejects } from "@std/assert";
import { join } from "@std/path";
import { fetchCurrentIndex, generateReleaseArtifacts, sha256Hex } from "./generate.ts";
import { PLATFORM_TARGETS } from "./manifest.ts";

/** Run `fn` with `globalThis.fetch` stubbed, restoring it afterwards. */
async function withStubbedFetch(
  stub: typeof globalThis.fetch,
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

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

Deno.test("fetchCurrentIndex returns null without a URL", async () => {
  assertEquals(await fetchCurrentIndex(undefined), null);
});

Deno.test("fetchCurrentIndex bootstraps to null on 404 (index not published yet)", async () => {
  await withStubbedFetch(
    () => Promise.resolve(new Response(null, { status: 404 })),
    async () => {
      assertEquals(await fetchCurrentIndex("https://example.com/index.json"), null);
    },
  );
});

Deno.test("fetchCurrentIndex throws on a network error rather than discarding history", async () => {
  await withStubbedFetch(
    () => Promise.reject(new TypeError("network down")),
    async () => {
      await assertRejects(() => fetchCurrentIndex("https://example.com/index.json"));
    },
  );
});

Deno.test("fetchCurrentIndex throws on a transient 5xx rather than discarding history", async () => {
  await withStubbedFetch(
    () => Promise.resolve(new Response("oops", { status: 503 })),
    async () => {
      await assertRejects(
        () => fetchCurrentIndex("https://example.com/index.json"),
        Error,
        "503",
      );
    },
  );
});
