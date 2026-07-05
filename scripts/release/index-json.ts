/**
 * Global `index.json` updater (see RELEASE_AND_DISTRIBUTION.md §Global index).
 *
 * Pure: folds a newly published version into the index a client fetches once to
 * resolve a release. Idempotent by version; tracks `latest`/`channels`.
 *
 * @module scripts/release/index-json
 */

export interface VersionEntry {
  readonly version: string;
  readonly schemaVersion: number;
  readonly released: string;
  readonly prerelease: boolean;
}

export interface IndexJson {
  readonly name: "dwkit";
  readonly latest: string;
  readonly channels: { stable?: string; beta?: string };
  readonly versions: readonly VersionEntry[];
}

/** Parse `MAJOR.MINOR.PATCH[-prerelease]` into comparable parts. */
function parse(v: string): { core: [number, number, number]; pre: string | null } {
  const [core, ...preParts] = v.split("-");
  const nums = core.split(".").map((n) => Number(n) || 0);
  return {
    core: [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0],
    pre: preParts.length ? preParts.join("-") : null,
  };
}

/** Split a prerelease tag into its label and trailing integer (`rc10` → `["rc", 10]`). */
function splitPre(pre: string): { label: string; num: number | null } {
  const m = pre.match(/^(.*?)(\d+)$/);
  return m ? { label: m[1], num: Number(m[2]) } : { label: pre, num: null };
}

/**
 * Descending semver comparator. A release outranks its own prerelease
 * (`1.1.0` > `1.1.0-rc1`); two prereleases with the same label compare by their
 * trailing integer (`-rc10` > `-rc2`), falling back to reverse lexical order
 * when labels differ or lack a number. Sufficient for v1's channels.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a), pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pb.core[i] - pa.core[i];
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return -1; // a is the full release → sorts first
  if (pb.pre === null) return 1;
  const sa = splitPre(pa.pre), sb = splitPre(pb.pre);
  if (sa.label === sb.label && sa.num !== null && sb.num !== null) {
    return sb.num - sa.num; // higher rc number is newer → sorts first
  }
  return pb.pre.localeCompare(pa.pre);
}

/**
 * Fold a newly published version into the global index. Idempotent by version.
 * `latest` and `channels.stable` track the newest non-prerelease; `channels.beta`
 * tracks the newest prerelease.
 */
export function updateIndex(existing: IndexJson | null, entry: VersionEntry): IndexJson {
  const kept = (existing?.versions ?? []).filter((v) => v.version !== entry.version);
  const versions = [...kept, entry].sort((a, b) => compareVersions(a.version, b.version));

  const newestStable = versions.find((v) => !v.prerelease);
  const newestPre = versions.find((v) => v.prerelease);
  const channels: { stable?: string; beta?: string } = {};
  if (newestStable) channels.stable = newestStable.version;
  if (newestPre) channels.beta = newestPre.version;

  return {
    name: "dwkit",
    latest: newestStable?.version ?? versions[0].version,
    channels,
    versions,
  };
}
