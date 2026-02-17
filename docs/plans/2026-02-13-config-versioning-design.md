# Config Versioning and Migration Design

## Problem

DarwinKit workspace configs (`darwinkit.yaml`) have no enforced versioning. As the config schema evolves, users need a way to migrate old configs to the current version. Users should only run the latest config version.

## Design Decisions

- **Version format**: Simple integer (`version: 1`, `version: 2`, etc.)
- **Migration strategy**: Stepwise chain — each version bump is a small, isolated migration function (v0→v1, v1→v2, etc.), chained in sequence
- **Migration UX**: `Workspace.open()` refuses outdated configs with a clear error message directing users to run `darwinkit migrate`
- **CLI command**: Standalone `migrate` command that reads the config, runs migrations, validates through the current Effect schema, and writes the updated YAML back
- **Migration module location**: `@dwkt/domain` — operates on raw objects, no DuckDB or file system dependencies

## Version Field Change

The `version` field changes from an optional freeform string to a required integer. Existing YAML files are updated to use `version: 1`. No backward-compatibility normalization of `"1.0.0"` strings.

## Migration System

### Module Structure

```
packages/domain/src/migrations/
├── mod.ts              # Public API: migrate(), CURRENT_CONFIG_VERSION
├── types.ts            # Migration type definition
└── migrations/
    └── v0-to-v1.ts     # Synthetic proof-of-concept migration
```

### Core Types

```typescript
interface Migration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly description: string;
  migrate(config: Record<string, unknown>): Record<string, unknown>;
}
```

### Migration Registry

A simple ordered array in `mod.ts`. Adding a new version means writing one migration function and appending it to the array.

```typescript
const CURRENT_CONFIG_VERSION = 1;
const migrations: Migration[] = [v0ToV1];
```

### `migrate()` Function

```typescript
function migrate(raw: Record<string, unknown>): {
  config: Record<string, unknown>;
  migrationsApplied: Migration[];
}
```

- Reads `version` from raw config
- If already current, returns as-is with empty migrations list
- Chains migrations from detected version to `CURRENT_CONFIG_VERSION`
- Throws if there's a gap in the migration chain or version is newer than current

## Config Loading Integration

The loading flow in `Workspace.open()` inserts a version check between YAML parsing and Effect schema decoding:

```
YAML parse → check version → fail with ConfigVersionError if outdated → Effect decode → proceed
```

### New Error Type

`ConfigVersionError` in `packages/domain/src/errors/workspace.ts`:
- Contains: detected version, expected version, list of migration descriptions
- CLI formats this as a user-friendly message directing them to run `darwinkit migrate`

## CLI `migrate` Command

```
deno task cli migrate [--config <path>]
```

### Flow

1. Discover and read config file (reuses existing `discoverConfig`)
2. Parse YAML to raw object
3. Call `migrate()` — get migrated config + list of applied migrations
4. If no migrations needed: print "Config is already up to date (version N)." and exit
5. If migrations applied:
   - **Decode** migrated raw object through `workspaceConfigSchema` to validate it
   - **Encode** back to a plain object for clean serialization
   - Show migration descriptions to user
   - Write YAML back to file
   - Print "Config migrated from version X to Y."

The schema decode step is the critical gate — if a migration produces invalid output, it fails with schema errors rather than writing a broken config.

## Synthetic v0→v1 Migration

A fabricated v0 config shape exercises three common migration patterns and serves as a template for future migrations:

| Pattern | v0 | v1 |
|---|---|---|
| Field rename | `naValues: [...]` | `nullValues: [...]` |
| Nesting change | `datasets: [...]` at top level | `validation.datasets: [...]` |
| Default injection | no `failFast` field | `failFast: false` |

Each migration function includes doc comments explaining what changed and why.

### v0 Fixture

```yaml
version: 0
name: Legacy Config
naValues:
  - NA
  - N/A
datasets:
  - name: events
    spec: dwc-event
    path: ./events.csv
```

### After Migration

```yaml
version: 1
name: Legacy Config
validation:
  nullValues:
    - NA
    - N/A
  failFast: false
  datasets:
    - name: events
      spec: dwc-event
      path: ./events.csv
```

## Testing Strategy

**Unit tests** (`packages/domain/`):
- v0→v1 migration function: input v0 raw config, assert v1 output shape
- `migrate()` chain: multi-step migration applies in sequence
- Edge cases: already current version, unknown future version, missing version

**Integration test** (`packages/core/` or `test/`):
- Fixture YAML with old version → full load → migrate → schema decode → encode pipeline
- Assert output is valid current-version config

**CLI test** (`packages/cli/`):
- `Workspace.open()` fails with `ConfigVersionError` on outdated configs
- Migrate command produces correct output

## Files Changed

- `packages/domain/src/schemas/workspace-config.ts` — `version` field becomes required integer
- `packages/domain/src/migrations/` — new migration module
- `packages/domain/src/errors/workspace.ts` — new `ConfigVersionError`
- `packages/core/src/workspace/workspace.ts` — version check in `loadConfig`
- `packages/cli/src/cmd/migrate/` — new CLI command
- `packages/domain/src/schemas/generate-json-schema.ts` — regenerate schema
- `darwinkit.schema.json` — updated schema output
- All existing `darwinkit.yaml` files — `version: "1.0.0"` → `version: 1`
