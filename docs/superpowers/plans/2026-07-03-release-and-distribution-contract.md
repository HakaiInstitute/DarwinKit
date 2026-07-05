# dwkit Release & Distribution Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the R package (now in the `biocleanr` repo), rename the engine identity to `dwkit`, and turn DarwinKit's release into the stable, versioned, machine-readable distribution contract that `biocleanr` and other clients consume (per `RELEASE_AND_DISTRIBUTION.md`).

**Architecture:** The engine keeps shipping a single compiled binary, but the *release* becomes the contract: five raw per-target binaries (`dwkit-<os>-<arch>[.exe]`), a `SHA256SUMS` file, a per-release `manifest.json`, and a global gh-pages `index.json`. The engine self-reports `{version, schemaVersion}` via `dwkit --version --format json`. All artifact-shaping logic lives in **testable Deno modules** under `scripts/release/`; CI is thin glue that compiles per target and calls those modules.

**Tech Stack:** Deno 2.x workspace, Cliffy CLI (`rc.7`), Effect v4 beta, DuckDB (`@duckdb/node-api@1.5.3-r.3`, native addon → per-OS native builds), GitHub Actions, git-cliff, `peaceiris/actions-gh-pages`.

## Global Constraints

- **Runtime:** Deno 2.0+ workspace. Every change must pass `deno fmt --check`, `deno lint`, `deno check`, and `deno test` from the repo root.
- **Naming boundary (from the "full rename" decision):**
  - Engine binary / CLI command identity → **`dwkit`**.
  - Internal package import scope → **`@dwkit/*`** (only two: `@dwkit/core`, `@dwkit/domain`).
  - **Unchanged (product/repo identity):** the product/repo name **DarwinKit** (`HakaiInstitute/DarwinKit`), the config filename **`darwinkit.yaml`** (auto-discovered by `Workspace.open`; renaming it breaks every user config and is not required by the contract), and the `config.id || "darwinkit"` export-DB fallback in `transform.ts`. Do **not** touch these.
- **Platform matrix (v1, locked by spec):** exactly five targets. Asset names are raw, uncompressed:
  | spec target | Deno `--target` | native runner | asset filename |
  | --- | --- | --- | --- |
  | `darwin-arm64` | `aarch64-apple-darwin` | `macos-latest` | `dwkit-darwin-arm64` |
  | `darwin-x86_64` | `x86_64-apple-darwin` | `macos-13` | `dwkit-darwin-x86_64` |
  | `linux-x86_64` | `x86_64-unknown-linux-gnu` | `ubuntu-latest` | `dwkit-linux-x86_64` |
  | `linux-arm64` | `aarch64-unknown-linux-gnu` | `ubuntu-24.04-arm` | `dwkit-linux-arm64` |
  | `windows-x86_64` | `x86_64-pc-windows-msvc` | `windows-latest` | `dwkit-windows-x86_64.exe` |
- **No cross-compilation:** the DuckDB native `.node` addon must match the host, so each target builds on a native-arch runner. Release builds embed the **committed** `dwcSchema.json` (no `import`/schema regeneration in the release path → all five assets embed byte-identical schema).
- **schemaVersion:** integer, initial value **`1`**. Bumped only on a breaking change to `--format json` output. Single source of truth: `packages/domain/src/version.ts`.
- **Index hosting:** GitHub Pages at `https://hakaiinstitute.github.io/DarwinKit/index.json` (repo owner must enable Pages → deploy from `gh-pages` branch; see Task 10).
- **`dwcSchema.json` is committed** — the generator must keep writing `deno fmt`-clean output; do not regenerate it as part of this work.
- **Effect v4 conventions:** `Effect.catch`/`Effect.result`; `SchemaError` is not `instanceof Error`.

---

## File Structure

**Removed:**
- `packages/r/` (entire directory — 52 files, now in the `biocleanr` repo).

**Renamed (mechanical, scope/identity only):**
- All `@dwkt/*` → `@dwkit/*` in `deno.json` files (root + 3 packages) and all `.ts` imports (48 files).
- `packages/cli/main.ts` `.name('darwinkit')` → `.name('dwkit')`; `packages/cli/main.test.ts` assertion.

**Created:**
- `packages/domain/src/version.ts` — `SCHEMA_VERSION` constant (single source of truth).
- `scripts/release/manifest.ts` — pure `buildManifest()` + validation (testable).
- `scripts/release/manifest.test.ts`
- `scripts/release/index-json.ts` — pure `updateIndex()` + `compareVersions()` (testable).
- `scripts/release/index-json.test.ts`
- `scripts/release/generate.ts` — I/O glue: reads `dist/`, hashes assets, writes `manifest.json`, `SHA256SUMS`, `index.json`.
- `scripts/release/generate.test.ts` — smoke test against a temp dir.

**Modified:**
- `.gitignore` (drop R remnants; rename runtime dir entries).
- `deno.json` (root: drop `packages/r/docs` exclude; replace compile tasks).
- `packages/cli/deno.json` (5 compile tasks with `dwkit-<os>-<arch>` outputs).
- `packages/domain/deno.json` (add `./version` export; rename scope).
- `packages/cli/main.ts` (`--version --format json`).
- `.github/workflows/release.yml` (full rewrite: 5-target matrix + publish job).
- `.github/workflows/release-pr.yml` (mark prereleases).
- `README.md` (rename references; document the contract + Pages setup).

---

## Phase 0 — Branch cleanup (independently mergeable)

### Task 1: Remove the R package and its config remnants

The useful TypeScript work from this branch (`dwc-relations.ts` + its wiring in `workspace-validator.ts`, `mod.ts` export, `obis-profile.test.ts`) is already present and depends on nothing in `packages/r/` — verified `WorkspaceImportError` exists in `packages/domain/src/errors/workspace.ts`. So this task is a pure deletion plus two config-line removals.

**Files:**
- Delete: `packages/r/` (entire directory)
- Modify: `.gitignore` (remove the `packages/r/docs/` block)
- Modify: `deno.json:65` (remove `"packages/r/docs"` from `exclude`)

- [ ] **Step 1: Delete the R package**

```bash
git rm -r packages/r
```

- [ ] **Step 2: Remove the R exclude from root `deno.json`**

In `deno.json`, the `exclude` array currently reads:

```json
  "exclude": [
    "build",
    "coverage",
    ".context",
    "packages/r/docs"
  ],
```

Change it to:

```json
  "exclude": [
    "build",
    "coverage",
    ".context"
  ],
```

- [ ] **Step 3: Remove the R pkgdown block from `.gitignore`**

Delete these three lines (added on this branch):

```
# pkgdown site output (built + deployed to gh-pages by CI, not committed)
packages/r/docs/
```

> Note: the `.gitignore` also has stale `/dwkt` and `/.dwkt/` runtime-dir entries — leave them for now; Task 3 renames them.

- [ ] **Step 4: Verify the kept TypeScript still passes end-to-end**

Run: `deno fmt --check && deno lint && deno check && deno test`
Expected: PASS. Confirms `dwc-relations.ts` and the `workspace-validator.ts` FK-inference wiring stand alone without the R package.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove R package (moved to biocleanr repo)"
```

---

## Phase 1 — Full rename (independently mergeable)

### Task 2: Rename the import scope `@dwkt/*` → `@dwkit/*`

Purely mechanical: two scope strings (`@dwkt/core`, `@dwkt/domain`) across `deno.json` `name`/`imports`/`exports` and ~48 `.ts` files. Do it with a single tree-wide substitution, then let the type checker prove correctness.

**Files:**
- Modify: `deno.json` (root — 8 `imports` keys)
- Modify: `packages/core/deno.json` (`name` + `imports`), `packages/domain/deno.json` (`name`), `packages/cli/deno.json` (`imports`)
- Modify: all `.ts` files importing `@dwkt/...` (packages + `test/`)

**Interfaces:**
- Produces: the import specifier prefix `@dwkit/` (consumed by every later task's imports, e.g. `@dwkit/domain/version` in Task 4).

- [ ] **Step 1: Substitute the scope tree-wide (excluding vendored + generated dirs)**

```bash
grep -rIl '@dwkt/' --include='*.ts' --include='*.json' . \
  | grep -vE '/\.context/|/node_modules/' \
  | xargs sed -i '' 's|@dwkt/|@dwkit/|g'
```

(On Linux/CI use `sed -i` without the `''`.)

- [ ] **Step 2: Verify no `@dwkt/` remains outside vendored dirs**

Run: `grep -rIn '@dwkt/' --include='*.ts' --include='*.json' . | grep -vE '/\.context/|/node_modules/'`
Expected: no output.

- [ ] **Step 3: Verify types resolve under the new scope**

Run: `deno check && deno test`
Expected: PASS (all workspace imports re-resolve; the path mappings in `deno.json` now use `@dwkit/*`).

- [ ] **Step 4: Format and commit**

```bash
deno fmt
git add -A
git commit -m "refactor: rename package scope @dwkt/* -> @dwkit/*"
```

### Task 3: Rename the engine/CLI identity `darwinkit` → `dwkit`

Engine identity only. **Leave** `darwinkit.yaml`, the `"DarwinKit"` product name, and the `transform.ts` export-DB fallback untouched (see Global Constraints).

**Files:**
- Modify: `packages/cli/main.ts:8` (`.name('darwinkit')`)
- Modify: `packages/cli/main.test.ts:10` (help assertion)
- Modify: `.gitignore` (`/dwkt` → `/dwkit`, `/.dwkt/` → `/.dwkit/`)
- Modify: `README.md` (binary references — handled fully in Task 10; here just the CLI name mentions)

- [ ] **Step 1: Update the failing test first**

In `packages/cli/main.test.ts`, change:

```ts
  assertStringIncludes(output, 'darwinkit');
```

to:

```ts
  assertStringIncludes(output, 'dwkit');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `deno task --cwd packages/cli test --filter 'CLI executable runs'`
Expected: FAIL — help output still says `darwinkit`.

- [ ] **Step 3: Rename the command**

In `packages/cli/main.ts`, change:

```ts
const darwinkit = new Command()
  .name('darwinkit')
```

to:

```ts
const dwkit = new Command()
  .name('dwkit')
```

and update the final two references:

```ts
  .command('transform', transformCommand);

await dwkit.parse(Deno.args);
```

- [ ] **Step 4: Rename the stale runtime-dir gitignore entries**

In `.gitignore`, change:

```
/dwkt
/.dwkt/
```

to:

```
/dwkit
/.dwkit/
```

- [ ] **Step 5: Run tests**

Run: `deno test && deno fmt --check && deno lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename CLI/engine identity darwinkit -> dwkit"
```

---

## Phase 2 — Engine self-reporting

### Task 4: `SCHEMA_VERSION` constant + `dwkit --version --format json`

**Files:**
- Create: `packages/domain/src/version.ts`
- Modify: `packages/domain/deno.json` (add `./version` export)
- Modify: `packages/cli/main.ts` (custom version option)
- Test: `packages/cli/main.test.ts` (new version test)

**Interfaces:**
- Produces: `SCHEMA_VERSION: number` (imported by the CLI and by `scripts/release/generate.ts` in Task 7 as `@dwkit/domain/version`).
- Produces: `dwkit --version --format json` → stdout `{"version":"<x.y.z>","schemaVersion":<n>}` (exact JSON, no name field, per spec §"Compatibility contract").

- [ ] **Step 1: Write the constant**

Create `packages/domain/src/version.ts`:

```ts
/**
 * Versions the engine's `--format json` output contract, independently of the
 * release/semver version. Bump ONLY on a breaking change to the JSON that
 * clients (e.g. biocleanr's `dwc_validate()`) parse. Non-breaking changes keep
 * the same value. Exposed to clients via `dwkit --version --format json` and
 * published per-release in `manifest.json` / `index.json`.
 */
export const SCHEMA_VERSION = 1;
```

- [ ] **Step 2: Export it from the domain package**

In `packages/domain/deno.json`, add to `exports`:

```json
  "exports": {
    "./types": "./src/types/mod.ts",
    "./schemas": "./src/schemas/mod.ts",
    "./errors": "./src/errors/mod.ts",
    "./specs": "./src/specs/mod.ts",
    "./version": "./src/version.ts"
  },
```

Add the matching path mapping to the root `deno.json` `imports` and to `packages/cli/deno.json` `imports`:

```json
    "@dwkit/domain/version": "./packages/domain/src/version.ts",
```

(In `packages/cli/deno.json` the relative form is `"../domain/src/version.ts"`.)

- [ ] **Step 3: Write the failing version test**

Append to `packages/cli/main.test.ts`:

```ts
Deno.test('CLI --version --format json reports version and schemaVersion', async () => {
  const { stdout, code } = await runCli(['--version', '--format', 'json']);
  assertEquals(code, 0);
  const parsed = JSON.parse(stdout.trim());
  assertEquals(typeof parsed.version, 'string');
  assertEquals(parsed.schemaVersion, 1);
});

Deno.test('CLI --version (plain) prints just the version string', async () => {
  const { stdout, code } = await runCli(['--version']);
  assertEquals(code, 0);
  assertEquals(/^\d+\.\d+\.\d+/.test(stdout.trim()), true);
});
```

- [ ] **Step 4: Run to confirm failure**

Run: `deno task --cwd packages/cli test --filter '--version'`
Expected: FAIL — default Cliffy version output is not JSON.

- [ ] **Step 5: Implement the custom version option**

In `packages/cli/main.ts`, add the import:

```ts
import { SCHEMA_VERSION } from '@dwkit/domain/version';
```

Replace `.version(packageInfo.version)` with a `.versionOption` that honors `--format json`:

```ts
  .versionOption(
    '-V, --version',
    'Show the version; use --format json for {version, schemaVersion}.',
    function () {
      const args = Deno.args;
      const eqFormat = args.find((a) => a.startsWith('--format='))?.split('=')[1];
      const flagIdx = args.findIndex((a) => a === '--format' || a === '-f');
      const format = eqFormat ?? (flagIdx >= 0 ? args[flagIdx + 1] : undefined);
      if (format === 'json') {
        console.log(
          JSON.stringify({ version: packageInfo.version, schemaVersion: SCHEMA_VERSION }),
        );
        return;
      }
      console.log(packageInfo.version);
    },
  )
```

- [ ] **Step 6: Run tests**

Run: `deno test && deno fmt --check && deno lint && deno check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: dwkit --version --format json reports schemaVersion"
```

---

## Phase 3 — Release artifact generation (testable core)

### Task 5: Pure `buildManifest()` + validation

**Files:**
- Create: `scripts/release/manifest.ts`
- Test: `scripts/release/manifest.test.ts`

**Interfaces:**
- Produces: `PlatformAsset`, `ManifestInput`, `Manifest` types and `buildManifest(input: ManifestInput): Manifest` (consumed by `generate.ts` in Task 7). The five spec targets are exported as `PLATFORM_TARGETS`.

- [ ] **Step 1: Write failing tests**

Create `scripts/release/manifest.test.ts`:

```ts
import { assertEquals, assertThrows } from '@std/assert';
import { buildManifest, PLATFORM_TARGETS } from './manifest.ts';

const sha = 'a'.repeat(64);
const asset = (target: string) => ({
  target,
  os: target.split('-')[0],
  arch: target.split('-').slice(1).join('-'),
  filename: `dwkit-${target}${target.startsWith('windows') ? '.exe' : ''}`,
  url: `https://example.com/${target}`,
  sha256: sha,
  size: 100,
});

Deno.test('buildManifest shapes a valid manifest with platforms sorted by target', () => {
  const m = buildManifest({
    version: '1.3.2',
    released: '2026-06-15',
    schemaVersion: 1,
    platforms: [...PLATFORM_TARGETS].reverse().map(asset),
  });
  assertEquals(m.name, 'dwkit');
  assertEquals(m.version, '1.3.2');
  assertEquals(m.schemaVersion, 1);
  assertEquals(m.platforms.map((p) => p.target), [...PLATFORM_TARGETS]);
});

Deno.test('buildManifest rejects a missing target', () => {
  assertThrows(
    () =>
      buildManifest({
        version: '1.3.2',
        released: '2026-06-15',
        schemaVersion: 1,
        platforms: PLATFORM_TARGETS.slice(1).map(asset),
      }),
    Error,
    'missing target',
  );
});

Deno.test('buildManifest rejects a bad sha256', () => {
  assertThrows(
    () =>
      buildManifest({
        version: '1.3.2',
        released: '2026-06-15',
        schemaVersion: 1,
        platforms: PLATFORM_TARGETS.map((t) => ({ ...asset(t), sha256: 'nope' })),
      }),
    Error,
    'sha256',
  );
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `deno test scripts/release/manifest.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `scripts/release/manifest.ts`:

```ts
/** The five v1 distribution targets, in canonical order (spec §Platforms). */
export const PLATFORM_TARGETS = [
  'darwin-arm64',
  'darwin-x86_64',
  'linux-x86_64',
  'linux-arm64',
  'windows-x86_64',
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
  readonly name: 'dwkit';
  readonly platforms: readonly PlatformAsset[];
}

const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Shape + validate a per-release manifest. Fails fast on a missing target, a
 * malformed sha256, or a non-positive size — a bad manifest must never reach a
 * client. Platforms are returned in canonical `PLATFORM_TARGETS` order.
 */
export function buildManifest(input: ManifestInput): Manifest {
  const byTarget = new Map(input.platforms.map((p) => [p.target, p]));
  const platforms: PlatformAsset[] = [];
  for (const target of PLATFORM_TARGETS) {
    const p = byTarget.get(target);
    if (!p) throw new Error(`manifest is missing target: ${target}`);
    if (!SHA256_RE.test(p.sha256)) {
      throw new Error(`manifest ${target}: sha256 must be 64 lowercase hex chars, got: ${p.sha256}`);
    }
    if (!Number.isInteger(p.size) || p.size <= 0) {
      throw new Error(`manifest ${target}: size must be a positive integer, got: ${p.size}`);
    }
    platforms.push(p);
  }
  return {
    name: 'dwkit',
    version: input.version,
    released: input.released,
    schemaVersion: input.schemaVersion,
    platforms,
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `deno test scripts/release/manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
deno fmt
git add scripts/release/manifest.ts scripts/release/manifest.test.ts
git commit -m "feat: add testable release manifest builder"
```

### Task 6: Pure `updateIndex()` + `compareVersions()`

**Files:**
- Create: `scripts/release/index-json.ts`
- Test: `scripts/release/index-json.test.ts`

**Interfaces:**
- Produces: `VersionEntry`, `IndexJson` types; `compareVersions(a, b): number` (descending helper); `updateIndex(existing: IndexJson | null, entry: VersionEntry): IndexJson` (consumed by `generate.ts` in Task 7).

- [ ] **Step 1: Write failing tests**

Create `scripts/release/index-json.test.ts`:

```ts
import { assertEquals } from '@std/assert';
import { updateIndex } from './index-json.ts';

const stable = (version: string, schemaVersion = 1, released = '2026-01-01') => ({
  version,
  schemaVersion,
  released,
  prerelease: false,
});

Deno.test('updateIndex bootstraps from null', () => {
  const idx = updateIndex(null, stable('1.0.0'));
  assertEquals(idx.name, 'dwkit');
  assertEquals(idx.latest, '1.0.0');
  assertEquals(idx.channels, { stable: '1.0.0' });
  assertEquals(idx.versions.length, 1);
});

Deno.test('updateIndex puts newest stable first and advances latest', () => {
  const idx = updateIndex(updateIndex(null, stable('1.0.0')), stable('1.1.0'));
  assertEquals(idx.latest, '1.1.0');
  assertEquals(idx.channels.stable, '1.1.0');
  assertEquals(idx.versions.map((v) => v.version), ['1.1.0', '1.0.0']);
});

Deno.test('updateIndex: a prerelease updates beta but not latest/stable', () => {
  const base = updateIndex(null, stable('1.0.0'));
  const idx = updateIndex(base, {
    version: '1.1.0-rc1',
    schemaVersion: 2,
    released: '2026-02-01',
    prerelease: true,
  });
  assertEquals(idx.latest, '1.0.0');
  assertEquals(idx.channels.stable, '1.0.0');
  assertEquals(idx.channels.beta, '1.1.0-rc1');
});

Deno.test('updateIndex is idempotent on the same version', () => {
  const once = updateIndex(null, stable('1.0.0'));
  const twice = updateIndex(once, stable('1.0.0'));
  assertEquals(twice.versions.length, 1);
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `deno test scripts/release/index-json.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `scripts/release/index-json.ts`:

```ts
export interface VersionEntry {
  readonly version: string;
  readonly schemaVersion: number;
  readonly released: string;
  readonly prerelease: boolean;
}

export interface IndexJson {
  readonly name: 'dwkit';
  readonly latest: string;
  readonly channels: { stable?: string; beta?: string };
  readonly versions: readonly VersionEntry[];
}

/** Parse `MAJOR.MINOR.PATCH[-prerelease]` into comparable parts. */
function parse(v: string): { core: [number, number, number]; pre: string | null } {
  const [core, ...preParts] = v.split('-');
  const [maj, min, pat] = core.split('.').map((n) => Number(n) || 0);
  return { core: [maj, min, pat], pre: preParts.length ? preParts.join('-') : null };
}

/**
 * Descending semver comparator. A release outranks its own prerelease
 * (`1.1.0` > `1.1.0-rc1`); two prereleases of the same core fall back to
 * reverse lexical order (`-rc2` > `-rc1`). Good enough for v1's channels.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parse(a), pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if (pa.core[i] !== pb.core[i]) return pb.core[i] - pa.core[i];
  }
  if (pa.pre === pb.pre) return 0;
  if (pa.pre === null) return -1; // a is the full release → sorts first
  if (pb.pre === null) return 1;
  return pb.pre.localeCompare(pa.pre);
}

/**
 * Fold a newly published version into the global index. Idempotent by version.
 * `latest` and `channels.stable` track the newest non-prerelease; `channels.beta`
 * tracks the newest prerelease (spec §Global index).
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
    name: 'dwkit',
    latest: newestStable?.version ?? versions[0].version,
    channels,
    versions,
  };
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `deno test scripts/release/index-json.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
deno fmt
git add scripts/release/index-json.ts scripts/release/index-json.test.ts
git commit -m "feat: add testable global index updater"
```

### Task 7: `generate.ts` glue (hash assets → manifest.json, SHA256SUMS, index.json)

**Files:**
- Create: `scripts/release/generate.ts`
- Test: `scripts/release/generate.test.ts`

**Interfaces:**
- Consumes: `buildManifest`/`PLATFORM_TARGETS` (Task 5), `updateIndex` (Task 6), `SCHEMA_VERSION` (Task 4).
- Produces: an executable Deno program invoked by CI (Task 9). Also exports `sha256Hex(bytes)`, `sha256SumsFile(entries)`, and `generateReleaseArtifacts(opts)` for the smoke test.
- CLI contract (env-driven, so CI passes them plainly):
  - `DIST_DIR` — dir containing the five built assets (filenames = asset names).
  - `VERSION` — semver without `v` prefix.
  - `RELEASED` — ISO date (`YYYY-MM-DD`).
  - `BASE_URL` — release download base, e.g. `https://github.com/HakaiInstitute/DarwinKit/releases/download/v1.3.2`.
  - `PRERELEASE` — `"true"` | `"false"`.
  - `INDEX_URL` — URL of the current published `index.json` (404/empty → bootstrap).
  - `OUT_DIR` — where to write `manifest.json`, `SHA256SUMS`, and `index.json`.

- [ ] **Step 1: Write the smoke test**

Create `scripts/release/generate.test.ts`:

```ts
import { assertEquals } from '@std/assert';
import { join } from '@std/path';
import { generateReleaseArtifacts, sha256Hex } from './generate.ts';
import { PLATFORM_TARGETS } from './manifest.ts';

Deno.test('generateReleaseArtifacts writes manifest, SHA256SUMS, and index', async () => {
  const dist = await Deno.makeTempDir({ prefix: 'dwkit-dist-' });
  const out = await Deno.makeTempDir({ prefix: 'dwkit-out-' });
  const names = PLATFORM_TARGETS.map((t) => `dwkit-${t}${t.startsWith('windows') ? '.exe' : ''}`);
  for (const n of names) await Deno.writeTextFile(join(dist, n), `binary:${n}`);

  const { manifest, index, sha256sums } = await generateReleaseArtifacts({
    distDir: dist,
    version: '1.3.2',
    released: '2026-06-15',
    baseUrl: 'https://example.com/v1.3.2',
    prerelease: false,
    currentIndex: null,
    schemaVersion: 1,
    outDir: out,
  });

  assertEquals(manifest.platforms.length, 5);
  assertEquals(index.latest, '1.3.2');
  // SHA256SUMS lines agree with the manifest's inline hashes.
  for (const p of manifest.platforms) {
    const expected = await sha256Hex(await Deno.readFile(join(dist, p.filename)));
    assertEquals(p.sha256, expected);
    assertEquals(sha256sums.includes(`${expected}  ${p.filename}`), true);
  }
  // Files landed on disk.
  await Deno.stat(join(out, 'manifest.json'));
  await Deno.stat(join(out, 'SHA256SUMS'));
  await Deno.stat(join(out, 'index.json'));
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `deno test --allow-read --allow-write scripts/release/generate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `scripts/release/generate.ts`:

```ts
import { encodeHex } from '@std/encoding/hex';
import { join } from '@std/path';
import { SCHEMA_VERSION } from '@dwkit/domain/version';
import { buildManifest, type Manifest, type PlatformAsset, PLATFORM_TARGETS } from './manifest.ts';
import { type IndexJson, updateIndex } from './index-json.ts';

/** Lowercase hex SHA-256 of raw bytes. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return encodeHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

/** coreutils `sha256sum` format: `<hex>  <filename>` (two spaces), LF-terminated. */
export function sha256SumsFile(entries: readonly { sha256: string; filename: string }[]): string {
  return entries.map((e) => `${e.sha256}  ${e.filename}`).join('\n') + '\n';
}

function osArch(target: string): { os: string; arch: string } {
  const [os, ...rest] = target.split('-');
  return { os, arch: rest.join('-') };
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
    const filename = `dwkit-${target}${target === 'windows-x86_64' ? '.exe' : ''}`;
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
  const sha256sums = sha256SumsFile(platforms.map((p) => ({ sha256: p.sha256, filename: p.filename })));

  await Deno.mkdir(opts.outDir, { recursive: true });
  await Deno.writeTextFile(join(opts.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await Deno.writeTextFile(join(opts.outDir, 'SHA256SUMS'), sha256sums);
  await Deno.writeTextFile(join(opts.outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  return { manifest, index, sha256sums };
}

/** Fetch the current published index; a 404 (first release) bootstraps to null. */
async function fetchCurrentIndex(url: string | undefined): Promise<IndexJson | null> {
  if (!url) return null;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetching current index ${url} failed: ${res.status}`);
  return await res.json() as IndexJson;
}

if (import.meta.main) {
  const env = (k: string) => Deno.env.get(k) ?? '';
  const distDir = env('DIST_DIR');
  const outDir = env('OUT_DIR');
  const version = env('VERSION');
  if (!distDir || !outDir || !version) {
    console.error('DIST_DIR, OUT_DIR, and VERSION are required');
    Deno.exit(1);
  }
  await generateReleaseArtifacts({
    distDir,
    version,
    released: env('RELEASED'),
    baseUrl: env('BASE_URL'),
    prerelease: env('PRERELEASE') === 'true',
    currentIndex: await fetchCurrentIndex(Deno.env.get('INDEX_URL')),
    schemaVersion: SCHEMA_VERSION,
    outDir,
  });
  console.log(`Wrote manifest.json, SHA256SUMS, index.json to ${outDir}`);
}
```

> Verify `@std/encoding` resolves; if not present in the workspace `imports`, add `"@std/encoding": "jsr:@std/encoding@^1.0.0"` to the root `deno.json` `imports` in this step.

- [ ] **Step 4: Run to confirm pass**

Run: `deno test --allow-read --allow-write --allow-env --allow-net scripts/release/generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + lint + commit**

Run: `deno fmt --check && deno lint && deno check && deno test`
```bash
git add scripts/release/generate.ts scripts/release/generate.test.ts deno.json
git commit -m "feat: add release artifact generator (manifest, SHA256SUMS, index)"
```

---

## Phase 4 — CI wiring (verified only by a real tagged release)

> These tasks change GitHub Actions and cannot be fully verified locally. Each step below states the local check that *is* possible (YAML validity, task runs) and marks what only a real `v*` tag can confirm.

### Task 8: Five compile tasks with `dwkit-<os>-<arch>` outputs

**Files:**
- Modify: `packages/cli/deno.json` (`tasks`)
- Modify: `deno.json` (root `tasks` — replace the 3 compile wrappers)

- [ ] **Step 1: Replace the CLI compile tasks**

In `packages/cli/deno.json`, replace the three `compile:*` tasks with five. Each keeps the current flags and `--include ../domain/src/specs/generated/dwcSchema.json`, and outputs the asset name directly:

```json
    "compile:darwin-arm64": "deno compile --target aarch64-apple-darwin --allow-read --allow-write --allow-env --allow-run --allow-ffi --allow-net --self-extracting --include ../domain/src/specs/generated/dwcSchema.json --output ./dist/dwkit-darwin-arm64 main.ts",
    "compile:darwin-x86_64": "deno compile --target x86_64-apple-darwin --allow-read --allow-write --allow-env --allow-run --allow-ffi --allow-net --self-extracting --include ../domain/src/specs/generated/dwcSchema.json --output ./dist/dwkit-darwin-x86_64 main.ts",
    "compile:linux-x86_64": "deno compile --target x86_64-unknown-linux-gnu --allow-read --allow-write --allow-env --allow-run --allow-ffi --allow-net --self-extracting --include ../domain/src/specs/generated/dwcSchema.json --output ./dist/dwkit-linux-x86_64 main.ts",
    "compile:linux-arm64": "deno compile --target aarch64-unknown-linux-gnu --allow-read --allow-write --allow-env --allow-run --allow-ffi --allow-net --self-extracting --include ../domain/src/specs/generated/dwcSchema.json --output ./dist/dwkit-linux-arm64 main.ts",
    "compile:windows-x86_64": "deno compile --target x86_64-pc-windows-msvc --allow-read --allow-write --allow-env --allow-run --allow-ffi --allow-net --self-extracting --include ../domain/src/specs/generated/dwcSchema.json --output ./dist/dwkit-windows-x86_64.exe main.ts",
```

- [ ] **Step 2: Replace the root compile wrappers**

In the root `deno.json` `tasks`, remove the old `compile:macos`/`compile:linux`/`compile:windows` entries (which had `dependencies: ["import"]`) and add plain pass-throughs — **no `import` dependency**, so release builds use the committed schema:

```json
    "compile:darwin-arm64": "deno task --cwd packages/cli compile:darwin-arm64",
    "compile:darwin-x86_64": "deno task --cwd packages/cli compile:darwin-x86_64",
    "compile:linux-x86_64": "deno task --cwd packages/cli compile:linux-x86_64",
    "compile:linux-arm64": "deno task --cwd packages/cli compile:linux-arm64",
    "compile:windows-x86_64": "deno task --cwd packages/cli compile:windows-x86_64",
```

- [ ] **Step 3: Verify the native build works locally (host target only)**

On an Apple-Silicon dev machine, run: `deno task compile:darwin-arm64 && ls -la packages/cli/dist/dwkit-darwin-arm64`
Expected: a runnable binary. Then: `packages/cli/dist/dwkit-darwin-arm64 --version --format json`
Expected: `{"version":"...","schemaVersion":1}`.
(The other four targets are verified in CI — Task 9 — because they need native runners.)

- [ ] **Step 4: Commit**

```bash
git add deno.json packages/cli/deno.json
git commit -m "build: five per-target compile tasks emitting dwkit-<os>-<arch> assets"
```

### Task 9: Rewrite `release.yml` — 5-target matrix + publish job

**Files:**
- Modify: `.github/workflows/release.yml` (full replacement)

- [ ] **Step 1: Replace the workflow**

Overwrite `.github/workflows/release.yml`:

```yaml
name: release
on:
  release:
    types: [published]
  workflow_dispatch:
permissions:
  contents: write
jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        include:
          - runner: macos-latest
            target: darwin-arm64
          - runner: macos-13
            target: darwin-x86_64
          - runner: ubuntu-latest
            target: linux-x86_64
          - runner: ubuntu-24.04-arm
            target: linux-arm64
          - runner: windows-latest
            target: windows-x86_64
    runs-on: ${{ matrix.runner }}
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - name: Compile
        run: deno task compile:${{ matrix.target }}
      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: dwkit-${{ matrix.target }}
          path: packages/cli/dist/dwkit-${{ matrix.target }}*
          if-no-files-found: error

  publish:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - name: Gather built binaries into dist/
        uses: actions/download-artifact@v4
        with:
          path: artifacts
      - name: Flatten artifacts
        run: |
          mkdir -p dist
          find artifacts -type f -exec cp {} dist/ \;
          ls -la dist
      - name: Resolve release facts
        id: rel
        env:
          TAG: ${{ github.event.release.tag_name || github.ref_name }}
          PRE: ${{ github.event.release.prerelease }}
        run: |
          echo "version=${TAG#v}" >> "$GITHUB_OUTPUT"
          echo "prerelease=${PRE:-false}" >> "$GITHUB_OUTPUT"
          echo "released=$(date -u +%Y-%m-%d)" >> "$GITHUB_OUTPUT"
      - name: Generate manifest.json, SHA256SUMS, index.json
        env:
          DIST_DIR: dist
          OUT_DIR: out
          VERSION: ${{ steps.rel.outputs.version }}
          RELEASED: ${{ steps.rel.outputs.released }}
          PRERELEASE: ${{ steps.rel.outputs.prerelease }}
          BASE_URL: https://github.com/${{ github.repository }}/releases/download/v${{ steps.rel.outputs.version }}
          INDEX_URL: https://hakaiinstitute.github.io/DarwinKit/index.json
        run: |
          deno run --allow-read --allow-write --allow-env --allow-net scripts/release/generate.ts
          cp out/manifest.json out/SHA256SUMS dist/
      - name: Attach assets to the release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            dist/dwkit-darwin-arm64
            dist/dwkit-darwin-x86_64
            dist/dwkit-linux-x86_64
            dist/dwkit-linux-arm64
            dist/dwkit-windows-x86_64.exe
            dist/SHA256SUMS
            dist/manifest.json
      - name: Publish index.json to gh-pages
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: out
          keep_files: true
          # publish only index.json (out/ also holds manifest.json + SHA256SUMS,
          # which belong on the release, not the site)
          exclude_assets: 'manifest.json,SHA256SUMS'
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `deno run --allow-read npm:js-yaml .github/workflows/release.yml >/dev/null && echo OK`
(or any local YAML linter). Expected: parses without error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish five per-target assets + manifest + index on release"
```

> **CI-only verification (cannot run locally):** a real published `v*` release must produce all five binaries, `SHA256SUMS`, `manifest.json` on the release, and an updated `index.json` on gh-pages. This is the plan's final acceptance gate (see Verification).

### Task 10: Prerelease flagging, Pages enablement, and docs

**Files:**
- Modify: `.github/workflows/release-pr.yml` (mark prereleases)
- Modify: `README.md` (rename binary references; document the contract + Pages)

- [ ] **Step 1: Mark prereleases in the tag-release job**

In `.github/workflows/release-pr.yml`, in the `tag-release` job's final step, replace the `gh release create` line so a version containing `-` becomes a GitHub prerelease (so `releases/latest` skips it, per spec §Release layout):

```bash
          git tag "v${VERSION}"
          git push origin "v${VERSION}"
          docker run --rm -v "$PWD":/app -w /app ghcr.io/orhun/git-cliff/git-cliff:2.13.1 --latest --strip all > NOTES.md
          PRERELEASE_FLAG=""
          case "$VERSION" in *-*) PRERELEASE_FLAG="--prerelease" ;; esac
          gh release create "v${VERSION}" --title "v${VERSION}" --notes-file NOTES.md $PRERELEASE_FLAG
```

- [ ] **Step 2: Update README binary/contract references**

In `README.md`:
- Replace `dwkt` binary references (lines ~139, ~168) and any `dwkt-*` asset names with the new scheme (`dwkit-<os>-<arch>`).
- Update the `@dwkt/*` package table entries to `@dwkit/*`.
- Add a short "Releases & distribution" section pointing to `RELEASE_AND_DISTRIBUTION.md`, listing the five assets, `SHA256SUMS`, `manifest.json`, and the index URL `https://hakaiinstitute.github.io/DarwinKit/index.json`.

- [ ] **Step 3: Document Pages enablement (repo owner action)**

Add a note to the README release section (and surface it in the handoff): **GitHub Pages must be enabled on `HakaiInstitute/DarwinKit` with source = deploy from branch `gh-pages` / root**, or the index URL 404s. The first `release.yml` run creates the `gh-pages` branch via `peaceiris/actions-gh-pages`; Pages must then be pointed at it once in repo Settings.

- [ ] **Step 4: Final full verification + commit**

Run: `deno fmt --check && deno lint && deno check && deno test`
Expected: PASS.
```bash
git add README.md .github/workflows/release-pr.yml
git commit -m "docs+ci: mark prereleases, document dwkit release contract"
```

---

## Verification (maps to spec §Done criteria)

**Locally testable now:**
- `dwkit --version --format json` → `{version, schemaVersion}` (Task 4 test).
- `manifest.json` shape/validation + `SHA256SUMS` agreement + `index.json` channel logic (Tasks 5–7 unit tests).
- Host-target compile produces a runnable binary (Task 8, Step 3).
- `deno fmt --check && deno lint && deno check && deno test` green after every task.

**Verifiable only by a real published release (final acceptance gate):**
- A tagged `v*` release publishes the five binaries + `SHA256SUMS` + `manifest.json`, reachable at both pinned (`releases/download/v.../`) and `releases/latest/download/` URLs.
- `manifest.json` `sha256`/`size` correct per asset; `SHA256SUMS` agrees.
- gh-pages `index.json` updated with correct `latest`, `channels`, and `versions[]` (with per-entry `schemaVersion`) — **requires Pages enabled (Task 10, Step 3)**.
- A from-scratch resolution (index → manifest → download → verify → `dwkit --version --format json`) succeeds on each of the five targets.

## Risks & notes

- **New targets unproven in CI:** `darwin-x86_64` (`macos-13`) and `linux-arm64` (`ubuntu-24.04-arm`) are new. DuckDB ships prebuilt bindings for both (`@duckdb/node-bindings-{darwin-x64,linux-arm64}`), so they *should* build, but this is only confirmed on the first real matrix run. Unsupported-platform handling is the client's `build-from-source` fallback (spec §Consumer resolution step 4) — not DarwinKit's concern.
- **`RELEASE_PAT`:** `release-pr.yml` already uses `secrets.RELEASE_PAT`; `release.yml`'s publish job uses the default `GITHUB_TOKEN` for both the release upload and gh-pages push — confirm branch protection doesn't block the `gh-pages` push.
- **Out of scope (spec §Non-goals):** shell/PowerShell installer, Homebrew/Scoop/winget, signing/notarization, arm64-Windows. The manifest leaves room for a future `signatures` block without breaking the resolution algorithm.
- **`git commit` is disabled in this environment** — the commit steps above will need to be run by you (or the executing session hands them off).

## Self-review notes

- **Spec coverage:** asset format (Task 8), five assets + `SHA256SUMS` + `manifest.json` (Tasks 5,7,9), global index + channels (Tasks 6,9), `schemaVersion` (Task 4), integrity/SHA-256 (Task 7), gh-pages hosting (Tasks 9,10), consumer-resolution inputs (all present in manifest/index shape). Platform normalization + biocleanr changes are the client's plan (out of scope, per spec).
- **Type consistency:** `PLATFORM_TARGETS`, `PlatformAsset`, `buildManifest`, `IndexJson`, `VersionEntry`, `updateIndex`, `generateReleaseArtifacts`, `sha256Hex`, `SCHEMA_VERSION` are named identically across Tasks 4–7 and the CI invocation.
