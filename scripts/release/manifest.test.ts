import { assertEquals, assertThrows } from "@std/assert";
import { buildManifest, PLATFORM_TARGETS } from "./manifest.ts";

const sha = "a".repeat(64);
const asset = (target: string) => ({
  target,
  os: target.split("-")[0],
  arch: target.split("-").slice(1).join("-"),
  filename: `dwkit-${target}${target.startsWith("windows") ? ".exe" : ""}`,
  url: `https://example.com/${target}`,
  sha256: sha,
  size: 100,
});

Deno.test("buildManifest shapes a valid manifest with platforms sorted by target", () => {
  const m = buildManifest({
    version: "1.3.2",
    released: "2026-06-15",
    schemaVersion: 1,
    platforms: [...PLATFORM_TARGETS].reverse().map(asset),
  });
  assertEquals(m.name, "dwkit");
  assertEquals(m.version, "1.3.2");
  assertEquals(m.schemaVersion, 1);
  assertEquals(m.platforms.map((p) => p.target), [...PLATFORM_TARGETS]);
});

Deno.test("buildManifest rejects a missing target", () => {
  assertThrows(
    () =>
      buildManifest({
        version: "1.3.2",
        released: "2026-06-15",
        schemaVersion: 1,
        platforms: PLATFORM_TARGETS.slice(1).map(asset),
      }),
    Error,
    "missing target",
  );
});

Deno.test("buildManifest rejects a bad sha256", () => {
  assertThrows(
    () =>
      buildManifest({
        version: "1.3.2",
        released: "2026-06-15",
        schemaVersion: 1,
        platforms: PLATFORM_TARGETS.map((t) => ({ ...asset(t), sha256: "nope" })),
      }),
    Error,
    "sha256",
  );
});
