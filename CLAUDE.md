# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Commands

- `deno task cli` — run CLI commands (e.g. `deno task cli validate`, `deno task cli import`)
- `deno test` — full suite. Note: bare `deno test` fails DuckDB tests (missing `--allow-ffi`); use the task commands below.
- `deno task test:domain` / `test:core` / `test:cli` / `test:integration` — per-package tests
- `deno lint` / `deno fmt` — lint / format

Before committing, run `deno test`, `deno check`, and `deno lint`.

## Architecture Overview

DarwinKit is a modular TypeScript app (Deno workspace) for mapping tabular biodiversity data to the Darwin Core standard, with a CLI for validating and transforming datasets.

**Tech stack:** Deno 2.0+ (workspace support required) · Cliffy CLI · Effect v4 beta (`effect@4.0.0-beta.78`) for data/schema/error handling · DuckDB (in-memory) for CSV parsing, schema inference, and validation · Deno test runner.

### Project Structure

```
packages/
├── domain/          # types, schemas, errors, Darwin Core specs & profiles, constants, utils
│   └── src/specs/   # field-definition.ts (JSON normalization), profiles/, vocabularies/, generated/dwcSchema.json
├── core/            # workspace ops, parsing, validation, transform (all DuckDB-backed)
└── cli/             # Cliffy commands (validate, transform, import) + terminal output
```

`external/` (not shown) holds Darwin Core XML schemas from GBIF and the schema generator.

### Packages & Dependencies

- **@dwkt/domain** — types, schemas, field definitions, business rules, validation profiles. Lightweight (no DuckDB/native modules); must run in browser and Node. New domain types/schemas go in `src/types/` and `src/schemas/`; specs in `src/specs/`.
- **@dwkt/core** — all business logic and data processing. Uses DuckDB; imports from domain. Implementations go in `src/`.
- **@dwkt/cli** — thin wrapper over core with terminal formatting; imports from domain and core. Commands go in `src/cmd/`.

Test utilities go in `test/helpers/`. Define cross-package types domain-first; keep the CLI thin and delegate to core.

**Data storage:** DuckDB (in-memory) for all data ops; `darwinkit.yaml` files for dataset config and field mappings.

## Darwin Core Specifications

Three-layer system: **Specs** (base schemas from Darwin Core) → **Profiles** (variant overlays like OBIS/GBIF) → **ResolvedSpecs** (merged result consumed by validation).

**Specs — base schemas** (`packages/domain/src/specs/generated/dwcSchema.json`):

- Generated from Darwin Core XML via `deno task cli import` (or `import_schema()` from `@dwkt/core/import`).
- Contains 6 specs: `Event`, `Occurrence`, `Taxon`, `ExtendedMeasurementOrFact`, `dnaDerivedData`, `ResourceRelationship`. Each provides canonical `SpecField` records (types, descriptions, obligations, constraints), loaded into `profiles/registry.ts`.
- **Committed to git** — tests and `deno fmt --check` run against it directly (no pre-generation step). The generator must emit `deno fmt`-clean output (e.g. trailing newline); `test/schema-generation.test.ts` regenerates and validates it. A _root-level_ `darwinkit.schema.json` is gitignored, but files under `specs/generated/` are not.

**Profiles — variant overlays** (`packages/domain/src/specs/profiles/`): TypeScript `Profile` objects extending base specs with community requirements.

- `obis.ts` (OBIS base), `obis-event.ts` (OBIS sampling event, extends Event + OBIS), `obis-emof.ts` (OBIS eMoF, has a `DependencyRule` `require: { oneOf: ["eventID", "occurrenceID"] }`).
- Contain `fieldOverrides` (requirement/constraint changes) and optionally `datasetRules`. Overrides may introduce new fields (stub `SpecField` auto-created). Support inheritance via `extends`.

**Standard + Class resolution:** config uses root-level `standard` (e.g. `{ base: "darwin-core", variant: "obis" }`) and per-dataset `class` (e.g. `"Event"`). `resolveProfile(variant, class)` in `registry.ts` → `ResolvedSpec`:

1. Profile lookup by composite key `"${variant}-${class.toLowerCase()}"` (e.g. `"obis-event"`).
2. Base spec lookup by class key (e.g. `"Event"`).
3. Walk profile `extends` chain, collecting field overrides.
4. Normalize JSON validators to typed `Constraint`s via `normalizeField()`.
5. Merge spec + overrides → `ResolvedSpec` (`SpecField` records + `FieldOverride` map).

**Field type progression:** `RawField → (normalize) → SpecField → (resolve) → WorkspaceFieldMapping`

- **`RawField`** — raw JSON from `dwcSchema.json`, string-based validators; only used during import/DDL generation.
- **`SpecField`** — normalized, typed constraints + `ObligationsMap`; lives on `Spec` and `ResolvedSpec`.
- **`FieldOverride`** — partial overlay on a `Profile` (requirement/constraint changes); lives on `ResolvedSpec`.
- **`WorkspaceFieldMapping`** — final field with fully merged constraints (spec + profile + config), from `resolveSpecFields()` in `field-resolution.ts`.

**Constraint system:** constraints are `Data.TaggedClass` instances discriminated by `_tag` (like violations, per Effect convention): `RangeConstraint`, `RequiredConstraint`, `UniqueConstraint`, `PatternConstraint`, `LengthConstraint`, `FormatConstraint`. Each carries typed fields flat (no nested params).

- Only `RequiredConstraint` has `level`: `"required"` (ERROR) / `"recommended"` (WARNING) / `"optional"` (INFO) — controls _presence_ severity. Value constraints (Range/Pattern/Format/Length/Unique) have no level; value validity is always ERROR.
- YAML uses `type: range`; the config parse boundary transforms to `_tag` and constructs the tagged instances.
- Controlled vocabularies enforced at the DuckDB schema level via ENUM types, only for fields with `required`/`strongly recommended` obligation in the active standard; optional vocab fields use TEXT and accept any value.
- Obligation → level mapping: `required` → `"required"`, `strongly recommended` → `"recommended"`, `recommended` → `"optional"`, `optional` → no constraint.

**Dataset rules** (`packages/domain/src/specs/dataset-rules.ts`): group-level rules. The one rule type is `DependencyRule` (`Data.TaggedClass("dependency")`); `DatasetRule` is an alias.

- Conditional presence rule: optional `when` (`DependencyCondition`) gates it; `require` (`DependencyRequire`) is either a `readonly string[]` (all required) or `{ oneOf: readonly string[] }` (at least one). Also supports optional `sourceDataset`, `message`, and `level` (severity). Validated via SQL in `dataset-rule-validators.ts`.
- Sources: profiles (`profile.datasetRules`, auto-applied) and config (`datasetRules` in YAML).
- When a profile uses `{ oneOf: [...] }`, set member fields to `"recommended"` via `fieldOverrides` (the group rule replaces per-field required).
- Produces `DependencyViolation` (`Schema.TaggedClass`), severity from the rule's `level` (narrow via `_tag`).

**3-tier constraint resolution** (`packages/core/src/validation/field-resolution.ts`):

1. **Spec** — base constraints + obligation-derived `RequiredConstraint`s.
2. **Profile** — `fieldOverrides`: `overrideConstraints()` for requirement level (profiles are authoritative, can _weaken_ spec requirements), `mergeProfileConstraints()` for others.
3. **Config** — `fieldMappings` via `addConstraints()`: additive only, cannot weaken spec/profile constraints.

```typescript
// OBIS-Event extends both Event and OBIS
const OBIS_EVENT_PROFILE: Profile = {
  id: "obis-event",
  extends: "obis",
  fieldOverrides: {
    decimalLatitude: {
      requirement: "required",
      constraints: [new RangeConstraint({ min: -90, max: 90, inclusive: true })],
    },
  },
};
```

Regenerate base schemas (when Darwin Core updates) with `deno task cli import` — fetches the latest XML schemas + OBIS checklist and rewrites `dwcSchema.json`.

**Key files:**

- `packages/domain/src/specs/generated/dwcSchema.json` — generated specs (committed)
- `packages/core/src/import/get_dwc_schema.ts` — schema generation
- `packages/domain/src/specs/constraints.ts` — `Constraint` classes + merge logic
- `packages/domain/src/specs/constraint-presets.ts` — named constraint bundles for YAML
- `packages/domain/src/specs/field-definition.ts` — `RawField` → `SpecField` normalization, `SpecField` type
- `packages/domain/src/specs/profiles/registry.ts` — registries, resolution, merging
- `packages/core/src/validation/field-resolution.ts` — 3-tier merge
- `packages/core/src/validation/field-validators.ts` — constraint-dispatched SQL validation
- `packages/domain/src/specs/dataset-rules.ts` — `DependencyRule`/`DatasetRule` types
- `packages/core/src/validation/dataset-rule-validators.ts` — SQL dataset-rule validation
- `packages/domain/src/specs/profiles/obis-emof.ts` — profile with a `{ oneOf: [...] }` rule

## Workspace Architecture

Uses Effect resource management.

**`Workspace`** (`packages/core/src/workspace/workspace.ts`):

- `Workspace.open(configPath?)` → `Effect<Workspace, WorkspaceConfigError, Scope.Scope>`. Uses `Effect.acquireRelease` for the DuckDB instance/connection; the connection is released when the `Scope` closes, so wrap usage in `Effect.scoped`.
- `workspace.validate(options?)` runs validation via the internal `WorkspaceValidator`.

**`WorkspaceValidator`** (`packages/core/src/validation/workspace-validator.ts`): `validateFromConfig(configPath)` loads a config and validates end-to-end. Used by `Workspace.validate()`; also callable directly for config-only validation. Workspace error types live in `@dwkt/domain`. Module re-exports are in `workspace/mod.ts`.

## Config-Based Validation

Configuration-driven validation for multi-dataset projects via `darwinkit.yaml`.

```yaml
name: Marine Biodiversity Dataset
version: 1.0.0
standard:
  base: darwin-core
  variant: obis # drives obligation lookup (OBIS, GBIF, ...)
validation:
  nullValues: [NA, "N/A", "", "NULL", "null"]
  failFast: false
  outputDir: ./validation_results
  datasets:
    - name: event_data
      class: Event # Darwin Core class (Event, Occurrence, Taxon, ...)
      path: ../data/FC2022_event.csv
      fieldMappings:
        - originName: eventID
          targetName: eventID
          requirement: required
datasetRules:
  - ruleType: foreignKey
    sourceDataset: occurrence_data
    sourceField: eventID
    targetDataset: event_data
    targetField: eventID
```

`standard` accepts a string (`"darwin-core"`) or object (`{ base, variant }`). Bare known variants like `"obis"`/`"gbif"` normalize to `{ base: "darwin-core", variant: "obis" }` for backward compatibility.

**CLI:** `deno task cli validate` (auto-discovers `darwinkit.yaml` in current/parent dirs) · `--config <path>` · `--format json`.

**Features:** field mappings to Darwin Core · cross-dataset foreign keys · controlled vocabularies · type validation (dates, coordinates) · range constraints · uniqueness.

**Programmatic:**

```typescript
import { Workspace } from "@dwkt/core/workspace";
import * as Effect from "effect/Effect";

// Opens workspace, validates, auto-cleans up DuckDB. Pass options to validate({ failFast: true }).
const result = await Effect.runPromise(
  Effect.scoped(Effect.gen(function* () {
    const workspace = yield* Workspace.open("./darwinkit.yaml");
    return yield* workspace.validate();
  })),
);

// Config-only: new WorkspaceValidator().validateFromConfig("./darwinkit.yaml")
```

**Example:** `test/example-config/darwinkit.yaml` (+ data in `test/data/`) uses real FC2022 marine survey data — multi-dataset events+occurrences, foreign keys, date/coordinate/vocabulary/uniqueness validation. Run `deno test test/example-config.test.ts --allow-all` (or `test/date-validation.test.ts` for date-focused output).

## Export Behavior

`exportTablesToCSV` writes via DuckDB's native `COPY … TO (FORMAT CSV, HEADER)` — LF line endings, header row, values unquoted unless they contain a delimiter/quote/newline. (Previously `@std/csv`, which emitted CRLF.)

## Development Guidelines

### Security Context

SQL injection is not a risk here — the app processes user-owned CSVs against local in-memory DuckDB with no multi-tenant or network-exposed SQL surface. `sanitizeTableName()` sanitizes table/column names as defense-in-depth.

### Code Conventions

- Use TypeScript strictly — never `any`; avoid `unknown` unless technically correct.
- Follow existing patterns per package; keep docs concise; don't explain self-explanatory code.
- Prefer `Match` + exhaustive over switch/if-else; tighten stringly-typed values to literal unions first.

### Effect

DarwinKit uses Effect heavily (pipelines, error handling, Schema, services/context/DI). Reference material in `.context/` (not tracked in git):

- `.context/effect/` — Effect source, **pinned at `effect@3.19.15` (v3), NOT the v4 beta the project targets**. Use only for v3-era patterns. For v4 API specifics, consult the effect-smol migration guides (`MIGRATION.md`) and the installed `node_modules/.deno/effect@4.0.0-beta.78` `.d.ts` files.
- `.context/effect-patterns/`, `.context/effect-solutions/` — patterns and worked examples.
- Prefer narrow, targeted searches to avoid saturating context.

Set up with:

```bash
git clone --branch effect@3.19.15 --depth 1 https://github.com/Effect-TS/effect.git .context/effect
git clone --depth=1 git@github.com:PaulJPhilp/EffectPatterns.git .context/effect-patterns
git clone --depth=1 git@github.com:kitlangton/effect-solutions.git .context/effect-solutions
```

**Error model (two error types):**

- **`Effect.fail`** — expected, user-fixable errors: file-not-found (user paths), invalid CSV, workspace-not-found, validation failures, config errors.
- **`Effect.die` / `.orDie`** — defects/system failures: DB connection failures, infrastructure queries (schema, row count), file ops on our own workspace dirs, JSON parsing of self-generated data, programming assertions.
- Decide by: can the user fix it? → `fail`. System failure or bug? → `die`. Normal flow → `fail`. Programming error → `die`.

**Effect v4 gotchas:** recovery uses `Effect.catch` (v3 `catchAll`, same signature) and `Effect.result` (v3 `either`). `Effect.result(e)` yields a `Result` (from `effect/Result`), not an `Either` — inspect with `Result.isFailure`/`isSuccess`, read `.failure`/`.success` (not `.left`/`.right`). For `Effect.all(es, { mode })`, v4 mode is `"result"` (v3 `"either"`) and elements become `Result`s. In v4 a `SchemaError` is **not** an `instanceof Error` — match via the error channel / `_tag`, not `instanceof`.

## Future Enhancements

- **Enhanced reporting** — summary statistics in validation reports.
- **More profiles** — GBIF, iNaturalist, etc.
- **Transformation pipelines** — advanced data transformation workflows.
- **Performance** — caching, incremental validation for large datasets.
- **Transform config migration** — transform configs still use `profile:` instead of `class:`, and transform profile resolution ignores `standard`.
- **Constraint-tightening warnings** — warn when config constraints are semantically meaningless (e.g. wider range than spec).
- **DuckDB CHECK constraints** — schema creation currently runs before constraint resolution; restructuring would let range/format constraints reject bad data at INSERT time.
- **Replace `markdown_summary_action` format** — it conflates format/destination/filename in one enum; should become `--format markdown` + explicit destination flags once the GitHub Action can update in lockstep.
