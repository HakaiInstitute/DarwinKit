import { assertEquals } from "@std/assert";
import { compareVersions, updateIndex } from "./index-json.ts";

const stable = (version: string, schemaVersion = 1, released = "2026-01-01") => ({
  version,
  schemaVersion,
  released,
  prerelease: false,
});

Deno.test("updateIndex bootstraps from null", () => {
  const idx = updateIndex(null, stable("1.0.0"));
  assertEquals(idx.name, "dwkit");
  assertEquals(idx.latest, "1.0.0");
  assertEquals(idx.channels, { stable: "1.0.0" });
  assertEquals(idx.versions.length, 1);
});

Deno.test("updateIndex puts newest stable first and advances latest", () => {
  const idx = updateIndex(updateIndex(null, stable("1.0.0")), stable("1.1.0"));
  assertEquals(idx.latest, "1.1.0");
  assertEquals(idx.channels.stable, "1.1.0");
  assertEquals(idx.versions.map((v) => v.version), ["1.1.0", "1.0.0"]);
});

Deno.test("updateIndex: a prerelease updates beta but not latest/stable", () => {
  const base = updateIndex(null, stable("1.0.0"));
  const idx = updateIndex(base, {
    version: "1.1.0-rc1",
    schemaVersion: 2,
    released: "2026-02-01",
    prerelease: true,
  });
  assertEquals(idx.latest, "1.0.0");
  assertEquals(idx.channels.stable, "1.0.0");
  assertEquals(idx.channels.beta, "1.1.0-rc1");
});

Deno.test("updateIndex is idempotent on the same version", () => {
  const once = updateIndex(null, stable("1.0.0"));
  const twice = updateIndex(once, stable("1.0.0"));
  assertEquals(twice.versions.length, 1);
});

Deno.test("compareVersions ranks a higher rc number as newer (rc10 > rc2)", () => {
  // Descending comparator: the newer version sorts first (negative result).
  assertEquals(compareVersions("1.1.0-rc10", "1.1.0-rc2") < 0, true);
  assertEquals(compareVersions("1.1.0-rc2", "1.1.0-rc10") > 0, true);
});

Deno.test("updateIndex beta channel picks the newest rc by number, not lexically", () => {
  let idx = updateIndex(null, {
    version: "1.1.0-rc2",
    schemaVersion: 1,
    released: "2026-01-01",
    prerelease: true,
  });
  idx = updateIndex(idx, {
    version: "1.1.0-rc10",
    schemaVersion: 1,
    released: "2026-02-01",
    prerelease: true,
  });
  assertEquals(idx.channels.beta, "1.1.0-rc10");
  assertEquals(idx.versions.map((v) => v.version), ["1.1.0-rc10", "1.1.0-rc2"]);
});
