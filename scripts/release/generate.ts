/**
 * Release artifact generator.
 *
 * I/O glue over the builders: hashes the five built assets in `distDir`, then
 * writes `manifest.json`, `SHA256SUMS`, and an updated `index.json` into
 * `outDir`. Invoked by CI (env-driven `import.meta.main` block below).
 *
 * @module scripts/release/generate
 */

import { SCHEMA_VERSION } from "@dwkit/domain/version";
import { join } from "@std/path";
import { type IndexJson, updateIndex } from "./index-json.ts";
import { buildManifest, type Manifest, PLATFORM_TARGETS, type PlatformAsset } from "./manifest.ts";

/** Lowercase hex SHA-256 of raw bytes (as returned by `Deno.readFile`). */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** coreutils `sha256sum` format: `<hex>  <filename>` (two spaces), LF-terminated. */
export function sha256SumsFile(entries: readonly { sha256: string; filename: string }[]): string {
  return entries.map((e) => `${e.sha256}  ${e.filename}`).join("\n") + "\n";
}

function osArch(target: string): { os: string; arch: string } {
  const [os, ...rest] = target.split("-");
  return { os, arch: rest.join("-") };
}

export interface GenerateOpts {
  readonly distDir: string;
  readonly version: string;
  readonly released: string;
  readonly baseUrl: string;
  readonly prerelease: boolean;
  readonly currentIndex: IndexJson | null;
  readonly schemaVersion: number;
  readonly outDir: string;
}

export async function generateReleaseArtifacts(
  opts: GenerateOpts,
): Promise<{ manifest: Manifest; index: IndexJson; sha256sums: string }> {
  const platforms: PlatformAsset[] = [];
  for (const target of PLATFORM_TARGETS) {
    const filename = `dwkit-${target}${target.startsWith("windows-") ? ".exe" : ""}`;
    const bytes = await Deno.readFile(join(opts.distDir, filename));
    const { os, arch } = osArch(target);
    platforms.push({
      target,
      os,
      arch,
      filename,
      url: `${opts.baseUrl}/${filename}`,
      sha256: await sha256Hex(bytes),
      size: bytes.byteLength,
    });
  }

  const manifest = buildManifest({
    version: opts.version,
    released: opts.released,
    schemaVersion: opts.schemaVersion,
    platforms,
  });
  const index = updateIndex(opts.currentIndex, {
    version: opts.version,
    schemaVersion: opts.schemaVersion,
    released: opts.released,
    prerelease: opts.prerelease,
  });
  const sha256sums = sha256SumsFile(
    platforms.map((p) => ({ sha256: p.sha256, filename: p.filename })),
  );

  await Deno.mkdir(opts.outDir, { recursive: true });
  await Deno.writeTextFile(
    join(opts.outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await Deno.writeTextFile(join(opts.outDir, "SHA256SUMS"), sha256sums);
  await Deno.writeTextFile(
    join(opts.outDir, "index.json"),
    JSON.stringify(index, null, 2) + "\n",
  );

  return { manifest, index, sha256sums };
}

/**
 * Fetch the current published index so the new version can be merged into it.
 *
 * Only a 404 bootstraps to null — the index genuinely does not exist yet, which
 * happens once, on the first release before the gh-pages site is published. The
 * `*.github.io` host always resolves, so a missing site is a 404, not a network
 * error. Every other failure (a thrown network error, or a non-404 status such
 * as a transient 5xx) throws: silently bootstrapping there would republish an
 * index containing only the current version and permanently erase the published
 * version history.
 */
export async function fetchCurrentIndex(url: string | undefined): Promise<IndexJson | null> {
  if (!url) return null;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetching current index ${url} failed: ${res.status}`);
  return await res.json() as IndexJson;
}

if (import.meta.main) {
  const env = (k: string) => Deno.env.get(k) ?? "";
  const distDir = env("DIST_DIR");
  const outDir = env("OUT_DIR");
  const version = env("VERSION");
  if (!distDir || !outDir || !version) {
    console.error("DIST_DIR, OUT_DIR, and VERSION are required");
    Deno.exit(1);
  }
  await generateReleaseArtifacts({
    distDir,
    version,
    released: env("RELEASED"),
    baseUrl: env("BASE_URL"),
    prerelease: env("PRERELEASE") === "true",
    currentIndex: await fetchCurrentIndex(Deno.env.get("INDEX_URL")),
    schemaVersion: SCHEMA_VERSION,
    outDir,
  });
  console.log(`Wrote manifest.json, SHA256SUMS, index.json to ${outDir}`);
}
