/**
 * Versions the engine's `--format json` output contract, independently of the
 * release/semver version. Bump ONLY on a breaking change to the JSON that
 * clients (e.g. biocleanr's `dwc_validate()`) parse. Non-breaking changes keep
 * the same value. Exposed to clients via `dwkit --version --format json` and
 * published per-release in `manifest.json` / `index.json`.
 */
export const SCHEMA_VERSION = 1;
