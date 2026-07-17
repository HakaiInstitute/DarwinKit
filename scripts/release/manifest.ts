/**
 * Per-release `manifest.json` builder.
 *
 * Pure + validating: shapes the manifest a release publishes and fails fast on
 * a missing target, malformed checksum, or non-positive size — a bad manifest
 * must never reach a client.
 *
 * @module scripts/release/manifest
 */

/** The v1 distribution targets, in canonical order (spec §Platforms). */
export const PLATFORM_TARGETS = [
  "darwin-arm64",
  "linux-x86_64",
  "linux-arm64",
  "windows-x86_64",
] as const;

export type PlatformTarget = typeof PLATFORM_TARGETS[number];

export interface PlatformAsset {
  readonly target: string;
  readonly os: string;
  readonly arch: string;
  readonly filename: string;
  readonly url: string;
  readonly sha256: string;
  readonly size: number;
}

export interface ManifestInput {
  readonly version: string;
  readonly released: string;
  readonly schemaVersion: number;
  readonly platforms: readonly PlatformAsset[];
}

export interface Manifest extends ManifestInput {
  readonly name: "dwkit";
  readonly platforms: readonly PlatformAsset[];
}

const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Shape + validate a per-release manifest. Fails fast on a missing target, a
 * malformed sha256, or a non-positive size. Platforms are returned in canonical
 * `PLATFORM_TARGETS` order.
 */
export function buildManifest(input: ManifestInput): Manifest {
  const byTarget = new Map(input.platforms.map((p) => [p.target, p]));
  const platforms: PlatformAsset[] = [];
  for (const target of PLATFORM_TARGETS) {
    const p = byTarget.get(target);
    if (!p) throw new Error(`manifest is missing target: ${target}`);
    if (!SHA256_RE.test(p.sha256)) {
      throw new Error(
        `manifest ${target}: sha256 must be 64 lowercase hex chars, got: ${p.sha256}`,
      );
    }
    if (!Number.isInteger(p.size) || p.size <= 0) {
      throw new Error(`manifest ${target}: size must be a positive integer, got: ${p.size}`);
    }
    platforms.push(p);
  }
  return {
    name: "dwkit",
    version: input.version,
    released: input.released,
    schemaVersion: input.schemaVersion,
    platforms,
  };
}
