# DarwinKit

[![Code Quality & Tests](https://github.com/HakaiInstitute/DarwinKit/actions/workflows/code-quality.yml/badge.svg)](https://github.com/HakaiInstitute/DarwinKit/actions/workflows/code-quality.yml)

A configuration-driven toolkit for validating and transforming biodiversity data to Darwin Core standards.

## What It Does

DarwinKit maps, transforms, and validates raw biodiversity data to the Darwin Core standard so you can share your research with the world more easily.

### The Problem

Biodiversity data is often collected in a form that's convenient for research or field work rather than compliant with Darwin Core standards. However, the repositories to which we tend to submit our data (OBIS, GBIF, BOLD, etc.) tend to require it to comply with the standard. Worse yet, you can't be certain that the data is entirely valid until you've submitted it, and each repository has its own superset of validation rules.

We can correct this manually or write bespoke scripts to process and transform the data, perhaps even validate it, but this is a time-consuming and error-prone process with variable results. This has proven to be a bottleneck and time-sink, absorbing significant resources and effort.

### The Solution

DarwinKit validates CSV biodiversity data against Darwin Core specifications (and repository supersets) using a YAML configuration file. It checks field mappings, renames columns, can enforce referential integrity across related datasets, validate controlled vocabularies, and ensure other types of data quality before submission to biodiversity repositories. It takes the guess-work and wheel-reinvention out of biodiversity data preparation.

If you know how your data should be mapped to Darwin Core, you can use DarwinKit to validate and transform your data with as little as a YAML configuration file.

## Quick Start

> [!NOTE]
> DarwinKit is currently used as a CLI. It's not yet published or available for download. In the meantime, you can use it via `deno` as described below.
> Talk to @HakaiInstitute/steveadams or @HakaiInstitute/fostermh for support!

**Prerequisites**: [Deno 2.0+](https://deno.land/)

```bash
# macOS/Linux
curl -fsSL https://deno.land/install.sh | sh

# Windows
irm https://deno.land/install.ps1 | iex
```

Create a `darwinkit.yaml` configuration file:

```yaml
id: marine-survey-2024
name: Marine Survey 2024
version: 1.0.0
createdAt: "2024-01-01T00:00:00.000Z"
updatedAt: "2024-01-01T00:00:00.000Z"
validation:
  nullValues:
    - NA
    - N/A
    - ""
    - "NULL"
    - "null"
  failFast: false
  outputDir: ./validation_results
  datasets:
    - name: events
      spec: dwc-event
      path: ./data/events.csv
      fieldMappings:
        - originName: event_id
          targetName: eventID
          requirement: required
        - originName: sample_date
          targetName: eventDate
          requirement: required
        - originName: latitude
          targetName: decimalLatitude
          requirement: required
        - originName: longitude
          targetName: decimalLongitude
          requirement: required
    - name: occurrences
      spec: dwc-occurrence
      path: ./data/occurrences.csv
      fieldMappings:
        - originName: occurrence_id
          targetName: occurrenceID
          requirement: required
        - originName: event_id
          targetName: eventID
          requirement: required
        - originName: species_name
          targetName: scientificName
          requirement: required
datasetRules:
  - ruleType: foreignKey
    sourceDataset: occurrences
    sourceField: eventID
    targetDataset: events
    targetField: eventID
```

Run validation:

```bash
deno task cli validate
deno task cli validate --config ./my-config.yaml
```

Transform data to Darwin Core format:

```bash
deno task cli transform --config ./my-config.yaml
```

## Project Structure

DarwinKit is a Deno workspace with three packages:

| Package                                     | Description                                           |
| ------------------------------------------- | ----------------------------------------------------- |
| [@dwkit/domain](packages/domain/README.md)  | Domain types, schemas, and Darwin Core specifications |
| [@dwkit/core](packages/core/README.md)      | Core business logic for validation and transformation |
| [@dwkit/cli](packages/cli/README.md)        | Command-line interface                                |

## Development

```bash
deno task test   # Run all tests
deno fmt         # Format code
deno lint        # Lint code
```

See individual package READMEs for package-specific commands.

## Project Board

Track development progress: [DarwinKit Project Board](https://github.com/orgs/HakaiInstitute/projects/30)

## Releases & changelog

Commits must follow [Conventional Commits](https://www.conventionalcommits.org)
(`feat:`, `fix:`, `feat!:`/`BREAKING CHANGE:` for majors). The `commitlint`
check enforces this on every PR and is a **required status check** on `main`.

`CHANGELOG.md` and version bumps are generated by
[git-cliff](https://git-cliff.org): pushing to `main` opens a "Release vX.Y.Z"
PR; merging it tags the release and builds the `dwkit` binaries. No release is
possible without new `feat`/`fix` commits — the changelog is therefore always
complete.

**One-time setup:** seed the baseline tag `git tag v1.2.2 && git push origin v1.2.2`;
add a `RELEASE_PAT` repo secret — a personal access token (classic, `repo` scope)
from an account with write access, SSO-authorized for the org if SSO is enforced;
and mark the `commitlint` check required in branch protection. (The release
workflow needs a non-default token because GitHub blocks the built-in
`GITHUB_TOKEN` from triggering the tag-driven `release` build.)

> A PAT is tied to a person and expires — rotate it before it lapses. When org
> admin is available, migrating to a **GitHub App token** (org-owned, auto-expiring,
> minted per run via `actions/create-github-app-token`) is the more robust setup.

**Without `RELEASE_PAT` set**, the automated Release PR can't run; cut a release by
hand from an up-to-date `main` instead (needs only normal repo write access):

```bash
# 1. Bump + changelog in a normal PR (git-cliff picks the next version from commits):
docker run --rm -v "$PWD":/app -w /app orhun/git-cliff --bumped-version   # prints vX.Y.Z
docker run --rm -v "$PWD":/app -w /app orhun/git-cliff --bump -o CHANGELOG.md
# edit packages/cli/deno.json "version" to X.Y.Z, open + merge the PR

# 2. Tag + release from your machine (uses YOUR credentials, so it triggers release.yml):
git tag vX.Y.Z && git push origin vX.Y.Z
gh release create vX.Y.Z --title vX.Y.Z --generate-notes
```

`release.yml` then builds and attaches the release assets automatically. The
tag/release step triggers the build only because it runs under your credentials
— the same step from CI needs `RELEASE_PAT`.

### Distribution contract

DarwinKit ships **only the `dwkit` engine binary**; downstream clients (e.g.
[biocleanr](https://github.com/HakaiInstitute/biocleanr)) download it and shell
out. Each release is a stable, versioned, machine-readable contract — see
[`RELEASE_AND_DISTRIBUTION.md`](RELEASE_AND_DISTRIBUTION.md) for the full spec. A
tagged release publishes:

- Five raw per-target binaries: `dwkit-darwin-arm64`, `dwkit-darwin-x86_64`,
  `dwkit-linux-x86_64`, `dwkit-linux-arm64`, `dwkit-windows-x86_64.exe`
- `SHA256SUMS` (coreutils format) and a per-release `manifest.json` (asset URLs +
  checksums + `schemaVersion`), both attached to the GitHub release
- A global index at `https://hakaiinstitute.github.io/DarwinKit/index.json`
  (`latest`, `stable`/`beta` channels, version history), updated on every publish

Clients resolve a version from the index, read that release's `manifest.json` for
the concrete asset + checksum, verify the download, then confirm compatibility via
`dwkit --version --format json` → `{"version":"…","schemaVersion":N}`. `schemaVersion`
versions the `--format json` output contract and is bumped only on a breaking change.

**One-time setup:** the index is deployed to GitHub Pages via the **GitHub
Actions** source (no `gh-pages` branch). `release.yml`'s deploy job calls
`actions/configure-pages` with `enablement: true`, which turns Pages on
automatically on the first run; if your org restricts that, set _Settings → Pages
→ Source = GitHub Actions_ once by hand. Until the first release publishes, the
index URL 404s and clients bootstrap a fresh index.

## License

MIT
