# Changelog

## [1.3.0] - 2026-07-05

### Features

- Add `install.sh` and `install.ps1` for one-line, checksum-verified installation of the `dwkit` binary

### Bug Fixes

- Use the correct git-cliff container image (`ghcr.io/orhun/git-cliff/git-cliff`) in the release workflow
- Harden release version computation so merges with nothing to release no longer fail

### CI

- Add shellcheck and install-script test gates, plus a post-release install smoke test across all supported targets
- Enforce Conventional Commit PR titles
