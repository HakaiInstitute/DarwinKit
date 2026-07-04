# The dwkit engine release & distribution contract

- **Date:** 2026-07-03
- **Branch:** `darwinkit-integration`
- **Status:** Design — awaiting review

## Problem

The prior integration design (`2026-07-02-darwinkit-integration-design.md`)
locked the boundary: **DarwinKit (`HakaiInstitute/DarwinKit`) ships only the
engine binary; biocleanr downloads it and shells out.** Today biocleanr's
`dwc_install_engine()` resolves an asset by **OS only** and always pulls
`releases/latest` with **no integrity check and no version pinning**. That has
three latent failures:

1. **Architecture is ignored.** `dwkt_asset_for()` maps `Darwin`/`Linux`/
   `Windows` → a single asset, so Apple Silicon, Intel Mac, and ARM Linux all
   request the same file. On mismatched hardware that installs a binary that
   cannot run.
2. **`latest` is unpinned.** A breaking change to the engine's `--format json`
   output can silently break an already-installed biocleanr, because a fresh
   `dwc_install_engine()` pulls whatever is newest.
3. **No integrity verification.** The downloaded executable is trusted as-is.

We also want the engine to be consumable by **other future clients** — a
one-line shell/PowerShell installer for humans, other language bindings, CI —
not just biocleanr. The fix is to define the **release itself as a stable,
versioned, machine-readable contract** that every consumer resolves
independently. The contract, not any single installer, is the source of truth;
R does not need to *run* an installer, it reimplements the same resolution
steps natively (as it already does).

The binary has been renamed `dwkt` → `dwkit` (see the working tree on this
branch); this document uses `dwkit` throughout. Internal biocleanr identifiers
(`dwkt_asset_for`, `resolve_dwkt_bin`, `.dwkt_repo`, etc.) retain the old spelling
by the prior spec's decision and are out of scope here.

## Decisions (locked)

1. **Asset format:** raw, uncompressed per-target binaries named
   `dwkit-<os>-<arch>` (`.exe` on Windows). No archives → no extraction step in
   any client. The installed/extracted binary is always plain `dwkit`
   (`dwkit.exe` on Windows); the OS/arch lives only in the *asset* name.
2. **Discovery:** a per-release `manifest.json` (asset details + checksums)
   **plus** a global index (`latest`, channels, version history) at a stable
   URL. A client resolves a version from the index in one fetch, then reads
   that version's manifest for the concrete asset + checksum.
3. **Compatibility:** an integer `schemaVersion` versions the engine's
   `--format json` output contract, independently of the release/semver
   version. Clients declare a supported range and install the newest stable
   release within it.
4. **Platforms (v1):** the five targets Deno can `compile --target` —
   `darwin-arm64`, `darwin-x86_64`, `linux-x86_64`, `linux-arm64`,
   `windows-x86_64`. (Deno has no arm64-Windows target.)
5. **Integrity:** every asset carries a SHA-256, published both in a
   conventional `SHA256SUMS` file (for `sha256sum -c` / tooling) and inline in
   the manifest (for client convenience).
6. **Index hosting:** gh-pages (`https://hakaiinstitute.github.io/DarwinKit/index.json`),
   written by a release CI job. Fallback if Pages is undesirable: commit
   `index.json` to a branch and serve via `raw.githubusercontent.com`.

## Release layout

Each release is tagged `vMAJOR.MINOR.PATCH` (semver). Prereleases
(`v1.5.0-rc1`) are marked as GitHub prereleases so `releases/latest` skips
them; they surface only through the index's `beta` channel. A release publishes
exactly:

```
dwkit-darwin-arm64
dwkit-darwin-x86_64
dwkit-linux-x86_64
dwkit-linux-arm64
dwkit-windows-x86_64.exe
SHA256SUMS
manifest.json
```

`SHA256SUMS` uses the standard coreutils format (`<hex>  <filename>`), covering
the five binaries.

## Per-release `manifest.json`

Attached as a release asset, so it is reachable at both a pinned and a
floating URL:

- Pinned: `.../releases/download/v1.3.2/manifest.json`
- Newest stable: `.../releases/latest/download/manifest.json`

```json
{
  "name": "dwkit",
  "version": "1.3.2",
  "released": "2026-06-15",
  "schemaVersion": 1,
  "platforms": [
    {
      "target": "darwin-arm64",
      "os": "darwin",
      "arch": "arm64",
      "filename": "dwkit-darwin-arm64",
      "url": "https://github.com/HakaiInstitute/DarwinKit/releases/download/v1.3.2/dwkit-darwin-arm64",
      "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      "size": 41231872
    }
    // …one entry per target in the platform matrix
  ]
}
```

Field notes:
- `version` — the release semver, without the `v` tag prefix.
- `schemaVersion` — integer; see the compatibility contract.
- `platforms[].url` — absolute; a client never has to construct download URLs.
- `sha256` — lowercase hex of the raw binary; the primary integrity source for
  clients (must agree with `SHA256SUMS`).
- `size` — bytes; advisory (progress/sanity), not a correctness gate.

## Global index

At the stable gh-pages URL. Carries `schemaVersion` **per version** so a client
can pick the right release from a single fetch, without walking every release's
manifest:

```json
{
  "name": "dwkit",
  "latest": "1.4.0",
  "channels": { "stable": "1.4.0", "beta": "1.5.0-rc1" },
  "versions": [
    { "version": "1.4.0", "schemaVersion": 2, "released": "2026-07-01", "prerelease": false },
    { "version": "1.3.2", "schemaVersion": 1, "released": "2026-06-15", "prerelease": false },
    { "version": "1.3.1", "schemaVersion": 1, "released": "2026-05-30", "prerelease": false }
  ]
}
```

- `latest` — newest non-prerelease version (mirrors GitHub's `releases/latest`).
- `channels` — named pointers; v1 defines `stable` and `beta`. `beta` points at
  the newest prerelease if any.
- `versions[]` — descending by release order; each entry is enough to resolve a
  version without fetching its manifest. `prerelease` distinguishes channels.

The release CI job appends the new version to `versions[]` and updates
`latest`/`channels` on every publish.

## Compatibility contract

- `schemaVersion` is an integer, bumped **only** on a breaking change to the
  engine's `--format json` output (the JSON that biocleanr's `dwc_validate()`
  parses). Non-breaking engine changes keep the same `schemaVersion`.
- The engine exposes it machine-readably for post-install verification:
  `dwkit --version --format json` → `{"version":"1.3.2","schemaVersion":1}`.
- Each client declares the range it understands. **biocleanr v1: `>= 1, < 2`.**
- Resolution installs the newest stable release whose `schemaVersion` is in
  range. Thus the engine can ship `1.x` fixes freely; a bump to `schemaVersion:
  2` will not be auto-installed by a biocleanr that only supports `1`, and that
  biocleanr keeps installing the newest `schemaVersion: 1` release until it is
  updated to support `2`.

## Consumer resolution algorithm (shared protocol)

Any client — biocleanr, the shell installer, a future binding — follows the
same steps:

1. Normalize the runtime `(os, arch)` to a target string (table below).
2. Fetch the global index (1 request).
3. From `versions[]`, keep entries in the chosen channel (for `stable`,
   `prerelease == false`) **and** with `schemaVersion` in the client's
   supported range. Pick the newest → `V`.
4. Fetch `manifest.json` for `V` (1 request). Find the `platforms[]` entry whose
   `target` matches. If none → unsupported-platform error with build-from-source
   guidance (the existing `resolve_dwkt_bin()` fallback).
5. Download `url`; compute SHA-256 and compare to `sha256`. Mismatch → hard
   error, discard the download.
6. Move into the client's managed location as `dwkit` / `dwkit.exe`; `chmod
   0755` on unix. (biocleanr: `tools::R_user_dir("biocleanr", "data")/bin`.)
7. Run `dwkit --version --format json`; verify the reported `schemaVersion` is
   in range (guards against a stale/tampered binary).

Total network cost: two small JSON fetches + one binary. Pinning to an exact
version skips steps 2–3 and fetches that version's manifest directly.

## Platform normalization

| Source | → `os` | → `arch` |
| --- | --- | --- |
| R `Sys.info()[["sysname"]]` | `Darwin`→`darwin`, `Linux`→`linux`, `Windows`→`windows` | — |
| R `R.version$arch` / `Sys.info()[["machine"]]` | — | `x86_64`/`amd64`→`x86_64`; `aarch64`/`arm64`→`arm64` |
| shell `uname -s` | `Darwin`→`darwin`, `Linux`→`linux` | — |
| shell `uname -m` | — | `x86_64`/`amd64`→`x86_64`; `aarch64`/`arm64`→`arm64` |
| PowerShell `$env:PROCESSOR_ARCHITECTURE` | `windows` | `AMD64`→`x86_64` |

An `(os, arch)` pair with no matching `target` in the manifest is an
unsupported platform → build-from-source guidance, never a wrong-arch download.

## Security

- Integrity via SHA-256 on every asset (`SHA256SUMS` + inline in manifest),
  verified by every client before a binary is trusted (step 5).
- **Out of scope for v1 but designed for:** signing/notarization. A future
  `signatures` block in the manifest (minisign/cosign) slots in without
  breaking the resolution algorithm — clients that don't verify signatures
  ignore it.

## Impact on biocleanr (feeds a separate implementation plan)

The engine-resolution internals change from "OS → asset, `releases/latest`, no
verification" to the protocol above. Concretely:

- `dwkt_asset_for()` → target resolution keyed on `(os, arch)`.
- New: fetch + parse the global index and per-release manifest (`jsonlite`,
  `httr2` — both already in `Imports`).
- New: SHA-256 verification of the download (e.g. `openssl::sha256()` or
  `digest`), before moving into place.
- New: a declared supported `schemaVersion` range and a post-install engine
  check (`dwkit --version --format json`).
- `dwc_install_engine()` gains a `version`/`channel` argument (default: newest
  in-range stable) for reproducible pins.
- Managed path stays `R_user_dir("biocleanr","data")/bin/dwkit[.exe]` — no
  change.

This is specified separately as its own plan; this document defines only the
contract it consumes.

## Non-goals (v1)

- The shell/PowerShell installer *implementation* (a separate client of this
  contract).
- Homebrew / Scoop / winget packaging (additive; the contract enables it).
- Code signing / notarization / SBOM (hook reserved; not built).
- Delta/differential updates, mirrors, or a CDN in front of GitHub Releases.
- arm64-Windows (no Deno compile target).

## Done criteria (for the DarwinKit side)

- A tagged release publishes the five binaries + `SHA256SUMS` + `manifest.json`,
  all reachable at the documented pinned and `latest` URLs.
- `manifest.json` validates against the schema above; `sha256`/`size` are
  correct for each asset; `SHA256SUMS` agrees.
- The gh-pages `index.json` is updated on publish and correctly reflects
  `latest`, `channels`, and `versions[]` (including `schemaVersion` per entry).
- `dwkit --version --format json` emits `{version, schemaVersion}`.
- A from-scratch resolution (index → manifest → download → verify) succeeds on
  each of the five targets.

## Open questions

- **gh-pages vs raw branch** for the index (defaulted to gh-pages — confirm the
  DarwinKit repo will run Pages).
- **Initial `schemaVersion`** for the current engine output (assumed `1`).
- Whether the index should also list per-version asset counts / a `yanked`
  flag for pulled releases (deferred unless needed).
