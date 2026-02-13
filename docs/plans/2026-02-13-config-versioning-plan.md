# Config Versioning and Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add integer-based config versioning to `darwinkit.yaml` with a stepwise migration chain, a standalone `migrate` CLI command, and a synthetic v0-to-v1 proof-of-concept migration.

**Architecture:** The migration system lives in `@dwkt/domain` as pure functions operating on raw parsed objects. A version check is inserted into `Workspace.open()` (in `@dwkt/core`) that rejects outdated configs. A new `migrate` CLI command reads, migrates, validates through the current schema, and writes the config back.

**Tech Stack:** Effect (schemas, errors, tagged errors), Cliffy (CLI command), `@std/yaml` (parse/stringify)

---

### Task 1: Migration Types and Module Scaffold

**Files:**
- Create: `packages/domain/src/migrations/types.ts`
- Create: `packages/domain/src/migrations/mod.ts`
- Modify: `packages/domain/deno.json`
- Modify: `deno.json` (root)

**Step 1: Create the Migration type**

Create `packages/domain/src/migrations/types.ts`:

```typescript
/**
 * Configuration migration types
 *
 * Each migration transforms a raw config object from one version to the next.
 * Migrations operate on plain objects (parsed YAML) before Effect schema decoding.
 */

/**
 * A migration transforms a raw config from version N to N+1.
 *
 * Migrations receive and return plain objects (not typed configs) because
 * the old version may not conform to the current schema.
 */
export interface Migration {
  /** The version this migration upgrades from */
  readonly fromVersion: number;
  /** The version this migration upgrades to (must be fromVersion + 1) */
  readonly toVersion: number;
  /** Human-readable description of what this migration changes */
  readonly description: string;
  /** Transform the raw config object from fromVersion to toVersion */
  migrate(config: Record<string, unknown>): Record<string, unknown>;
}
```

**Step 2: Create the migration module entry point**

Create `packages/domain/src/migrations/mod.ts`:

```typescript
/**
 * Configuration versioning and migration
 *
 * Provides a stepwise migration chain for upgrading darwinkit.yaml configs
 * from older versions to the current version. Each migration is a small,
 * isolated function that transforms a raw config from version N to N+1.
 *
 * @module migrations
 */

export { CURRENT_CONFIG_VERSION, migrate } from "./migrate.ts";
export type { Migration } from "./types.ts";
```

(We'll create `migrate.ts` in the next task.)

**Step 3: Add exports to `packages/domain/deno.json`**

Add `"./migrations": "./src/migrations/mod.ts"` to the exports object.

**Step 4: Add import mapping to root `deno.json`**

Add `"@dwkt/domain/migrations": "./packages/domain/src/migrations/mod.ts"` to the imports object.

**Step 5: Commit**

```bash
git add packages/domain/src/migrations/types.ts packages/domain/src/migrations/mod.ts packages/domain/deno.json deno.json
git commit -m "feat: scaffold migration types and module structure"
```

---

### Task 2: Core `migrate()` Function

**Files:**
- Create: `packages/domain/src/migrations/migrate.ts`
- Test: `packages/domain/src/migrations/migrate.test.ts`

**Step 1: Write failing tests**

Create `packages/domain/src/migrations/migrate.test.ts`:

```typescript
import { assertEquals, assertThrows } from "@std/assert";
import { migrate, CURRENT_CONFIG_VERSION } from "./migrate.ts";

Deno.test("migrate - returns config unchanged when already at current version", () => {
  const config = { version: CURRENT_CONFIG_VERSION, name: "test" };
  const result = migrate(config);
  assertEquals(result.config.version, CURRENT_CONFIG_VERSION);
  assertEquals(result.migrationsApplied.length, 0);
});

Deno.test("migrate - treats missing version as version 1", () => {
  const config = { name: "test" };
  const result = migrate(config);
  assertEquals(result.config.version, CURRENT_CONFIG_VERSION);
});

Deno.test("migrate - throws on version newer than current", () => {
  const config = { version: CURRENT_CONFIG_VERSION + 1, name: "test" };
  assertThrows(
    () => migrate(config),
    Error,
    "newer than current",
  );
});

Deno.test("migrate - throws on non-integer version", () => {
  const config = { version: "1.0.0", name: "test" };
  assertThrows(
    () => migrate(config),
    Error,
    "must be an integer",
  );
});
```

**Step 2: Run tests to verify they fail**

Run: `deno test packages/domain/src/migrations/migrate.test.ts`
Expected: FAIL (module not found)

**Step 3: Implement `migrate.ts`**

Create `packages/domain/src/migrations/migrate.ts`:

```typescript
/**
 * Core migration logic
 *
 * Chains stepwise migrations to upgrade raw config objects from any
 * known version to CURRENT_CONFIG_VERSION.
 */

import type { Migration } from "./types.ts";
import { v0ToV1 } from "./migrations/v0-to-v1.ts";

/** The current config version that DarwinKit expects */
export const CURRENT_CONFIG_VERSION = 1;

/** Ordered list of all migrations. Each migrates from version N to N+1. */
const migrations: readonly Migration[] = [v0ToV1];

/**
 * Migrate a raw parsed config to the current version.
 *
 * @param raw - Raw parsed YAML object (before Effect schema decoding)
 * @returns The migrated config and list of migrations that were applied
 * @throws If version is newer than current, not an integer, or migration chain has gaps
 */
export function migrate(raw: Record<string, unknown>): {
  config: Record<string, unknown>;
  migrationsApplied: Migration[];
} {
  const version = raw.version;

  // Validate version field
  if (version === undefined) {
    throw new Error(
      "Config is missing a 'version' field. Add 'version: " +
        CURRENT_CONFIG_VERSION +
        "' to your darwinkit.yaml.",
    );
  }

  if (typeof version !== "number" || !Number.isInteger(version)) {
    throw new Error(
      `Config version must be an integer, got: ${JSON.stringify(version)}`,
    );
  }

  if (version > CURRENT_CONFIG_VERSION) {
    throw new Error(
      `Config version ${version} is newer than current version ${CURRENT_CONFIG_VERSION}. ` +
        "Update DarwinKit to the latest version.",
    );
  }

  if (version === CURRENT_CONFIG_VERSION) {
    return { config: raw, migrationsApplied: [] };
  }

  // Find and chain migrations from current version to target
  let currentConfig = { ...raw };
  let currentVersion = version;
  const applied: Migration[] = [];

  while (currentVersion < CURRENT_CONFIG_VERSION) {
    const migration = migrations.find((m) => m.fromVersion === currentVersion);
    if (!migration) {
      throw new Error(
        `No migration found from version ${currentVersion} to ${currentVersion + 1}. ` +
          "This is a bug in DarwinKit.",
      );
    }
    currentConfig = migration.migrate(currentConfig);
    applied.push(migration);
    currentVersion = migration.toVersion;
  }

  return { config: currentConfig, migrationsApplied: applied };
}
```

Note: This references `v0ToV1` which doesn't exist yet. We'll create a placeholder in the next step so tests can run.

**Step 4: Create placeholder v0-to-v1 migration**

Create `packages/domain/src/migrations/migrations/v0-to-v1.ts`:

```typescript
/**
 * Synthetic v0 to v1 migration (proof-of-concept)
 *
 * Demonstrates three common migration patterns:
 *
 * 1. **Field rename**: `naValues` -> nested under `validation.nullValues`
 * 2. **Nesting change**: top-level `datasets` -> `validation.datasets`
 * 3. **Default injection**: adds `validation.failFast: false` if missing
 *
 * This migration is synthetic — v0 never existed in production. It serves
 * as a template for writing real migrations and as a test fixture.
 */

import type { Migration } from "../types.ts";

export const v0ToV1: Migration = {
  fromVersion: 0,
  toVersion: 1,
  description:
    "Restructure config: move naValues/datasets under validation section, rename naValues to nullValues",

  migrate(config: Record<string, unknown>): Record<string, unknown> {
    const result = { ...config };

    // 1. Field rename: naValues -> nullValues (will be nested under validation)
    const nullValues = result.naValues ?? ["NA", "N/A", "", "NULL", "null"];
    delete result.naValues;

    // 2. Nesting change: top-level datasets -> validation.datasets
    const datasets = result.datasets ?? [];
    delete result.datasets;

    // 3. Build validation section with defaults
    result.validation = {
      nullValues,
      failFast: false,
      datasets,
    };

    // Update version
    result.version = 1;

    return result;
  },
};
```

**Step 5: Run tests to verify they pass**

Run: `deno test packages/domain/src/migrations/migrate.test.ts`
Expected: All 4 tests PASS

**Step 6: Commit**

```bash
git add packages/domain/src/migrations/
git commit -m "feat: implement core migrate() function with v0-to-v1 placeholder"
```

---

### Task 3: v0-to-v1 Migration Tests

**Files:**
- Test: `packages/domain/src/migrations/migrations/v0-to-v1.test.ts`

**Step 1: Write tests for the v0-to-v1 migration**

Create `packages/domain/src/migrations/migrations/v0-to-v1.test.ts`:

```typescript
import { assertEquals } from "@std/assert";
import { v0ToV1 } from "./v0-to-v1.ts";
import { decodeWorkspaceConfig } from "../../schemas/workspace-config.ts";

Deno.test("v0ToV1 - renames naValues to validation.nullValues", () => {
  const v0Config: Record<string, unknown> = {
    version: 0,
    name: "Test Config",
    naValues: ["NA", "N/A"],
    datasets: [{ name: "events", spec: "dwc-event", path: "./events.csv" }],
  };

  const result = v0ToV1.migrate(v0Config);
  const validation = result.validation as Record<string, unknown>;
  assertEquals(validation.nullValues, ["NA", "N/A"]);
  assertEquals(result.naValues, undefined);
});

Deno.test("v0ToV1 - moves top-level datasets under validation", () => {
  const datasets = [
    { name: "events", spec: "dwc-event", path: "./events.csv" },
    { name: "occs", spec: "dwc-occurrence", path: "./occs.csv" },
  ];
  const v0Config: Record<string, unknown> = {
    version: 0,
    name: "Test Config",
    naValues: ["NA"],
    datasets,
  };

  const result = v0ToV1.migrate(v0Config);
  const validation = result.validation as Record<string, unknown>;
  assertEquals(validation.datasets, datasets);
  assertEquals(result.datasets, undefined);
});

Deno.test("v0ToV1 - injects failFast default", () => {
  const v0Config: Record<string, unknown> = {
    version: 0,
    name: "Test Config",
    naValues: ["NA"],
    datasets: [],
  };

  const result = v0ToV1.migrate(v0Config);
  const validation = result.validation as Record<string, unknown>;
  assertEquals(validation.failFast, false);
});

Deno.test("v0ToV1 - sets version to 1", () => {
  const v0Config: Record<string, unknown> = {
    version: 0,
    name: "Test Config",
    naValues: ["NA"],
    datasets: [{ name: "events", spec: "dwc-event", path: "./events.csv" }],
  };

  const result = v0ToV1.migrate(v0Config);
  assertEquals(result.version, 1);
});

Deno.test("v0ToV1 - uses default nullValues when naValues is missing", () => {
  const v0Config: Record<string, unknown> = {
    version: 0,
    name: "Test Config",
    datasets: [],
  };

  const result = v0ToV1.migrate(v0Config);
  const validation = result.validation as Record<string, unknown>;
  assertEquals(validation.nullValues, ["NA", "N/A", "", "NULL", "null"]);
});

Deno.test("v0ToV1 - migrated output validates against current schema", () => {
  const v0Config: Record<string, unknown> = {
    version: 0,
    name: "Test Config",
    naValues: ["NA", "N/A"],
    datasets: [{ name: "events", spec: "dwc-event", path: "./events.csv" }],
  };

  const migrated = v0ToV1.migrate(v0Config);

  // This should not throw — the migrated config must conform to the current schema
  const decoded = decodeWorkspaceConfig(migrated);
  assertEquals(decoded.version, 1);
  assertEquals(decoded.validation?.nullValues, ["NA", "N/A"]);
  assertEquals(decoded.validation?.datasets.length, 1);
  assertEquals(decoded.validation?.failFast, false);
});
```

**Step 2: Run tests**

Run: `deno test packages/domain/src/migrations/migrations/v0-to-v1.test.ts`
Expected: All 6 tests PASS

**Step 3: Commit**

```bash
git add packages/domain/src/migrations/migrations/v0-to-v1.test.ts
git commit -m "test: add v0-to-v1 migration tests including schema validation"
```

---

### Task 4: Change `version` Field to Required Integer

**Files:**
- Modify: `packages/domain/src/schemas/workspace-config.ts:213-233` (workspaceConfigSchema)
- Test: Run existing tests to verify nothing breaks

**Step 1: Update the version field in the schema**

In `packages/domain/src/schemas/workspace-config.ts`, replace the `version` field definition (lines 227-233) in `workspaceConfigSchema`. Change from:

```typescript
  version: S.optionalWith(
    S.String.annotations({
      description: "Configuration version. Default: '1.0.0'.",
      default: DEFAULT_VERSION,
    }),
    { default: () => DEFAULT_VERSION },
  ).pipe(S.withConstructorDefault(() => DEFAULT_VERSION)),
```

To:

```typescript
  version: S.Number.pipe(S.int()).annotations({
    description: "Configuration schema version.",
  }),
```

Also remove the `DEFAULT_VERSION` constant (line 17) since it's no longer used.

**Step 2: Run domain tests to check for breakage**

Run: `deno task test:domain`
Expected: Some tests may fail if they create configs without an integer `version`. Fix any failures by adding `version: 1` to test config objects.

**Step 3: Search for test configs that need updating**

Search for `makeWorkspaceConfig` and `decodeWorkspaceConfig` calls across the test suite. Any test that constructs a config without `version: 1` needs updating.

Also search for test fixtures that construct `WorkspaceConfig` objects inline.

**Step 4: Run all tests**

Run: `deno test`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/domain/src/schemas/workspace-config.ts
git commit -m "feat: change config version field to required integer"
```

---

### Task 5: Update Existing YAML Config Files

**Files:**
- Modify: `test/example-config/darwinkit.yaml` (line 3)
- Modify: `packages/cli/test-fixtures/valid-datasets/fc2022-complete/darwinkit.yaml` (line 3)
- Modify: `packages/cli/test-fixtures/invalid-datasets/mixed-validity/darwinkit.yaml`
- Modify: `packages/cli/test-fixtures/invalid-datasets/na-type-failures/darwinkit.yaml`
- Modify: `external/rocky-subtidal-fish-invertebrate_darwinkit.yaml` (line 3)

**Step 1: Update each YAML file**

In each file, change `version: 1.0.0` (or `version: "1.0.0"`) to `version: 1`.

**Step 2: Run all tests**

Run: `deno test`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add test/example-config/darwinkit.yaml packages/cli/test-fixtures/ external/rocky-subtidal-fish-invertebrate_darwinkit.yaml
git commit -m "chore: update all darwinkit.yaml files to use integer version"
```

---

### Task 6: Add `ConfigVersionError` and Version Check in `loadConfig`

**Files:**
- Modify: `packages/domain/src/errors/workspace.ts` (add new error class, update union type and formatter)
- Modify: `packages/core/src/workspace/workspace.ts:391-437` (add version check in `loadConfig`)

**Step 1: Add `ConfigVersionError` to `packages/domain/src/errors/workspace.ts`**

After `NoDatasetsDefinedError` (line 87), add:

```typescript
/**
 * Error when configuration version is outdated and needs migration
 */
export class ConfigVersionError extends Data.TaggedError("ConfigVersionError")<{
  readonly message: string;
  readonly configPath: string;
  readonly foundVersion: number;
  readonly expectedVersion: number;
  readonly migrationDescriptions: readonly string[];
}> {}
```

Add `ConfigVersionError` to the `WorkspaceConfigError` union type (line 125-132).

Add a formatter entry in `formatWorkspaceConfigError` (line 139):

```typescript
ConfigVersionError: (error) =>
  `Configuration version outdated\n\n` +
  `File: ${error.configPath}\n` +
  `Found version: ${error.foundVersion}\n` +
  `Expected version: ${error.expectedVersion}\n\n` +
  `Pending migrations:\n${error.migrationDescriptions.map((d) => `  - ${d}`).join("\n")}\n\n` +
  `Run 'darwinkit migrate' to update your configuration.`,
```

**Step 2: Add version check in `loadConfig`**

In `packages/core/src/workspace/workspace.ts`, add an import for `CURRENT_CONFIG_VERSION` and `migrate` from `@dwkt/domain/migrations`, and `ConfigVersionError` from `@dwkt/domain/errors`.

In the `loadConfig` function, insert a version check **between** the YAML parse (line 416) and the schema decode (line 418). After `parsedConfig` is available, add:

```typescript
    // Check config version before schema decoding
    const rawConfig = parsedConfig as Record<string, unknown>;
    const version = rawConfig.version;
    if (typeof version === "number" && version < CURRENT_CONFIG_VERSION) {
      const { migrationsApplied } = migrate(rawConfig);
      return yield* Effect.fail(
        new ConfigVersionError({
          message: `Config version ${version} is outdated (current: ${CURRENT_CONFIG_VERSION})`,
          configPath,
          foundVersion: version,
          expectedVersion: CURRENT_CONFIG_VERSION,
          migrationDescriptions: migrationsApplied.map((m) => m.description),
        }),
      );
    }
```

Update the `loadConfig` return type to include `ConfigVersionError` in its error channel.

**Step 3: Run tests**

Run: `deno test`
Expected: All tests PASS (existing configs are already at version 1)

**Step 4: Commit**

```bash
git add packages/domain/src/errors/workspace.ts packages/core/src/workspace/workspace.ts
git commit -m "feat: add ConfigVersionError and version check in loadConfig"
```

---

### Task 7: Handle `ConfigVersionError` in CLI Validate Command

**Files:**
- Modify: `packages/cli/src/cmd/validate/validate.ts:174-279` (add Match.tag handler)

**Step 1: Add ConfigVersionError handler**

In the `handleValidateError` function, add a new `Match.tag` case before the `Match.exhaustive` call (line 274):

```typescript
    Match.tag("ConfigVersionError", (e) => {
      Output.error("❌ Configuration version outdated:");
      Output.error(e.message);
      Output.muted(`File: ${e.configPath}`);
      Output.muted(`Found: version ${e.foundVersion}, expected: version ${e.expectedVersion}`);
      Output.blank();
      Output.muted("Pending migrations:");
      for (const desc of e.migrationDescriptions) {
        Output.muted(`  - ${desc}`);
      }
      Output.blank();
      Output.warning("💡 Run 'darwinkit migrate' to update your configuration.");
      return 3;
    }),
```

**Step 2: Check if the transform command also needs updating**

Read `packages/cli/src/cmd/transform/transform.ts` and check if it handles `WorkspaceConfigError` exhaustively. If it uses `Workspace.open()`, it will now receive `ConfigVersionError` too and needs a handler. If it delegates error handling generically (e.g., just prints `error.message`), no change needed.

**Step 3: Run all tests**

Run: `deno test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/cli/src/cmd/validate/validate.ts
git commit -m "feat: handle ConfigVersionError in CLI validate command"
```

---

### Task 8: CLI `migrate` Command

**Files:**
- Create: `packages/cli/src/cmd/migrate/migrate.ts`
- Modify: `packages/cli/main.ts` (register command)

**Step 1: Implement the migrate command**

Create `packages/cli/src/cmd/migrate/migrate.ts`:

```typescript
import { Command } from "@cliffy/command";
import { parse as parseYAML, stringify as stringifyYAML } from "@std/yaml";
import { dirname, resolve } from "@std/path";
import { CURRENT_CONFIG_VERSION, migrate } from "@dwkt/domain/migrations";
import { decodeWorkspaceConfig } from "@dwkt/domain/schemas";
import * as S from "effect/Schema";
import { workspaceConfigSchema } from "@dwkt/domain/schemas";
import { Output } from "../../utils/output.ts";

/**
 * Discover config file path.
 * Reuses the same search logic as Workspace.open() but without creating
 * a DuckDB connection. Searches for darwinkit.yaml up the directory tree.
 */
async function findConfig(configPath?: string): Promise<string> {
  if (configPath) {
    try {
      await Deno.stat(configPath);
      return resolve(configPath);
    } catch {
      throw new Error(`Config file not found: ${configPath}`);
    }
  }

  // Search up directory tree for darwinkit.yaml
  let dir = Deno.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = resolve(dir, "darwinkit.yaml");
    try {
      await Deno.stat(candidate);
      return candidate;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }

  throw new Error("No darwinkit.yaml found in current or parent directories.");
}

async function migrateConfig(options: { config?: string }) {
  // 1. Find and read config file
  const configPath = await findConfig(options.config);
  const content = await Deno.readTextFile(configPath);
  const raw = parseYAML(content) as Record<string, unknown>;

  // 2. Run migrations
  let result;
  try {
    result = migrate(raw);
  } catch (error) {
    Output.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }

  // 3. Check if any migrations were applied
  if (result.migrationsApplied.length === 0) {
    Output.success(
      `Config is already up to date (version ${CURRENT_CONFIG_VERSION}).`,
    );
    return;
  }

  // 4. Validate migrated config against current schema
  let decoded;
  try {
    decoded = decodeWorkspaceConfig(result.config);
  } catch (error) {
    Output.error("Migrated config failed schema validation:");
    Output.error(error instanceof Error ? error.message : String(error));
    Output.blank();
    Output.muted("This is likely a bug in the migration. Please report it.");
    Deno.exit(1);
  }

  // 5. Encode back to plain object for clean YAML serialization
  const encoded = S.encodeSync(workspaceConfigSchema)(decoded);

  // 6. Write migrated config
  const yaml = stringifyYAML(encoded as Record<string, unknown>);
  await Deno.writeTextFile(configPath, yaml);

  // 7. Report results
  Output.success(
    `Config migrated from version ${raw.version} to ${CURRENT_CONFIG_VERSION}.`,
  );
  Output.blank();
  Output.muted("Migrations applied:");
  for (const m of result.migrationsApplied) {
    Output.muted(`  - v${m.fromVersion} -> v${m.toVersion}: ${m.description}`);
  }
  Output.blank();
  Output.muted(`Updated: ${configPath}`);
}

export const migrateCommand = new Command()
  .description("Migrate a darwinkit.yaml configuration to the current version.")
  .option(
    "--config <path:string>",
    "Path to configuration file (defaults to auto-discovery)",
  )
  .action(migrateConfig);
```

**Step 2: Register the command in `packages/cli/main.ts`**

Add import:

```typescript
import { migrateCommand } from "./src/cmd/migrate/migrate.ts";
```

Add command registration (chain after existing `.command()` calls):

```typescript
  .command("migrate", migrateCommand)
```

**Step 3: Run the CLI help to verify registration**

Run: `deno task cli --help`
Expected: `migrate` command appears in the list

Run: `deno task cli migrate --help`
Expected: Shows migrate command description and options

**Step 4: Commit**

```bash
git add packages/cli/src/cmd/migrate/migrate.ts packages/cli/main.ts
git commit -m "feat: add CLI migrate command for config version upgrades"
```

---

### Task 9: Regenerate JSON Schema

**Files:**
- Modify: `packages/domain/src/schemas/generate-json-schema.ts` (may need tweaks)
- Regenerate: `darwinkit.schema.json`

**Step 1: Regenerate the JSON schema**

Run: `deno task schema:generate`
Expected: `darwinkit.schema.json` is regenerated with `version` as `{ "type": "integer" }` instead of `{ "type": "string" }`.

**Step 2: Verify the output**

Read `darwinkit.schema.json` and confirm:
- `version` property has `"type": "integer"` (or `"type": "number"` with integer constraint)
- `version` is listed in `required` array (or verify Effect's JSONSchema output handles this)

**Step 3: Run all tests**

Run: `deno test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add darwinkit.schema.json packages/domain/src/schemas/generate-json-schema.ts
git commit -m "chore: regenerate JSON schema with integer version field"
```

---

### Task 10: Integration Test — Full Migration Pipeline

**Files:**
- Create: `packages/domain/src/migrations/migrate-integration.test.ts`

**Step 1: Write an integration test that runs the full pipeline**

```typescript
import { assertEquals, assertThrows } from "@std/assert";
import { migrate, CURRENT_CONFIG_VERSION } from "./migrate.ts";
import { decodeWorkspaceConfig } from "../schemas/workspace-config.ts";
import * as S from "effect/Schema";
import { workspaceConfigSchema } from "../schemas/workspace-config.ts";

Deno.test("full migration pipeline - v0 config migrates and validates", () => {
  // Simulate a v0 config as it would appear after YAML parsing
  const v0Raw: Record<string, unknown> = {
    version: 0,
    name: "Legacy Marine Survey",
    description: "A dataset from the old config format",
    naValues: ["NA", "N/A", ""],
    datasets: [
      { name: "events", spec: "dwc-event", path: "./data/events.csv" },
      {
        name: "occurrences",
        spec: "dwc-occurrence",
        path: "./data/occurrences.csv",
      },
    ],
  };

  // Step 1: Migrate
  const { config: migrated, migrationsApplied } = migrate(v0Raw);
  assertEquals(migrationsApplied.length, 1);
  assertEquals(migrated.version, CURRENT_CONFIG_VERSION);

  // Step 2: Validate through current schema (decode)
  const decoded = decodeWorkspaceConfig(migrated);
  assertEquals(decoded.version, 1);
  assertEquals(decoded.name, "Legacy Marine Survey");
  assertEquals(decoded.validation?.nullValues, ["NA", "N/A", ""]);
  assertEquals(decoded.validation?.datasets.length, 2);
  assertEquals(decoded.validation?.failFast, false);

  // Step 3: Encode back to plain object (for YAML serialization)
  const encoded = S.encodeSync(workspaceConfigSchema)(decoded);
  assertEquals(typeof encoded, "object");
  assertEquals((encoded as Record<string, unknown>).version, 1);
});

Deno.test("full migration pipeline - current version passes through unchanged", () => {
  const currentRaw: Record<string, unknown> = {
    version: CURRENT_CONFIG_VERSION,
    name: "Current Config",
    validation: {
      datasets: [{ name: "events", spec: "dwc-event", path: "./events.csv" }],
    },
  };

  const { config, migrationsApplied } = migrate(currentRaw);
  assertEquals(migrationsApplied.length, 0);

  // Still validates against schema
  const decoded = decodeWorkspaceConfig(config);
  assertEquals(decoded.version, CURRENT_CONFIG_VERSION);
});

Deno.test("full migration pipeline - rejects future version", () => {
  const futureRaw: Record<string, unknown> = {
    version: 999,
    name: "Future Config",
  };

  assertThrows(() => migrate(futureRaw), Error, "newer than current");
});
```

**Step 2: Run tests**

Run: `deno test packages/domain/src/migrations/migrate-integration.test.ts`
Expected: All 3 tests PASS

**Step 3: Run the full test suite**

Run: `deno test`
Expected: All tests PASS

**Step 4: Commit**

```bash
git add packages/domain/src/migrations/migrate-integration.test.ts
git commit -m "test: add integration tests for full migration pipeline"
```

---

### Task 11: Final Verification

**Step 1: Run linter**

Run: `deno lint`
Expected: No warnings

**Step 2: Run formatter**

Run: `deno fmt`
Expected: No changes (or apply formatting)

**Step 3: Run full test suite**

Run: `deno test`
Expected: All tests PASS

**Step 4: Final commit if formatter made changes**

```bash
git add -A
git commit -m "chore: apply formatting"
```
