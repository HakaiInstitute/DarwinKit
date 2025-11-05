# Node.js to Deno Standard Library Migration Guide

**Date:** 2025-01-21
**Status:** Analysis Complete

## Executive Summary

DarwinKit currently uses Node.js built-in modules (`node:fs`, `node:path`, `node:process`, `node:os`) throughout the codebase. This document provides a comprehensive guide for migrating to Deno's standard library (`@std`) where appropriate.

**Key Finding:** Most Node.js module usage can be replaced with Deno's native APIs or `@std` packages, improving Deno-nativeness and reducing dependency on Node.js compatibility layer.

---

## Current Node.js Module Usage

### 1. `node:path` - Path Manipulation

**Used in 25+ files** for:
- `path.join()` - Joining path segments
- `path.resolve()` - Resolving absolute paths
- `path.dirname()` - Getting directory name
- `path.basename()` - Getting file name
- `path.relative()` - Getting relative path between paths
- `path.extname()` - Getting file extension

**Deno Alternative:** `@std/path`

All the same functions are available with identical APIs:
```typescript
// Before (Node.js)
import * as path from "node:path";
const fullPath = path.join(dir, "file.csv");

// After (Deno)
import { join } from "@std/path";
const fullPath = join(dir, "file.csv");
```

**Migration Complexity:** LOW (drop-in replacement)

---

### 2. `node:fs/promises` - File System Operations

**Used in 20+ files** for:
- `fs.readFile()` - Reading file contents
- `fs.writeFile()` - Writing file contents
- `fs.access()` - Checking file existence
- `fs.mkdir()` - Creating directories
- `fs.rm()` / `fs.rmSync()` - Removing files/directories recursively
- `fs.unlink()` - Removing single files
- `fs.mkdtempSync()` - Creating temporary directories

**Deno Alternatives:** Mix of Deno native APIs and `@std/fs`

#### Option A: Deno Native APIs (Recommended)
```typescript
// Before (Node.js)
import * as fs from "node:fs/promises";
const content = await fs.readFile(path, "utf-8");
await fs.writeFile(path, data, "utf-8");
await fs.mkdir(dir, { recursive: true });
await fs.rm(path, { recursive: true });

// After (Deno native)
const content = await Deno.readTextFile(path);
await Deno.writeTextFile(path, data);
await Deno.mkdir(dir, { recursive: true });
await Deno.remove(path, { recursive: true });
```

#### Option B: `@std/fs` (More features)
```typescript
// Before (Node.js)
await fs.access(path); // Check if exists

// After (@std/fs)
import { exists } from "@std/fs";
if (await exists(path)) { /* ... */ }
```

**Migration Complexity:** MEDIUM (API differences require careful migration)

---

### 3. `node:process` - Process Information

**Used in 1 file** (`env.ts`) for:
- `process.env` - Environment variables

**Deno Alternative:** Deno native APIs

```typescript
// Before (Node.js)
import process from "node:process";
const dbUrl = process.env.DATABASE_URL;

// After (Deno)
const dbUrl = Deno.env.get("DATABASE_URL");
// Or for all env vars:
const env = Deno.env.toObject();
```

**Migration Complexity:** LOW (simple replacement)

---

### 4. `node:os` - Operating System Information

**Used in 1 file** (`test/obis-profile.test.ts`) for:
- `os.tmpdir()` - Getting temporary directory path

**Deno Alternative:** Deno native APIs

```typescript
// Before (Node.js)
import * as os from "node:os";
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prefix-"));

// After (Deno)
const tempDir = await Deno.makeTempDir({ prefix: "prefix-" });
```

**Migration Complexity:** LOW (Deno's API is simpler)

---

## File-by-File Migration Priority

### High Priority (Core Packages)

These are production code files that should be migrated first:

1. **`packages/core/src/workspace/workspace-config-service.ts`**
   - Uses: `node:fs/promises`, `node:path`
   - Impact: Core config discovery functionality
   - Functions: `fs.readFile`, `fs.access`, `path.join`, `path.resolve`, `path.dirname`

2. **`packages/core/src/workspace/service.ts`**
   - Uses: `node:fs/promises`, `node:path`
   - Impact: Core workspace management
   - Functions: `fs.mkdir`, `fs.writeFile`, `path.join`

3. **`packages/core/src/workspace/config-service.ts`**
   - Uses: `node:fs/promises`, `node:path`
   - Impact: Legacy config service (may be deprecated)
   - Functions: `fs.readFile`, `path.resolve`

4. **`packages/core/src/workspace/workspace-validator.ts`**
   - Uses: `node:path`
   - Impact: Validation logic
   - Functions: `path.resolve`, `path.dirname`

5. **`packages/core/src/parsing/configurable-csv-parser.ts`**
   - Uses: `node:path`
   - Impact: CSV parsing
   - Functions: `path.resolve`

6. **`packages/core/src/validation/uniqueness-validator.ts`**
   - Uses: `node:path`
   - Impact: Validation
   - Functions: `path.basename`

7. **`packages/core/src/utils/effect-utils.ts`**
   - Uses: `node:fs/promises`
   - Impact: Shared Effect utilities
   - Functions: `fs.readFile`, `fs.writeFile`, `fs.mkdir`

8. **`packages/cli/src/cmd/validate/validate.ts`**
   - Uses: `node:path`, `node:fs/promises`
   - Impact: CLI validation command
   - Functions: `path.join`, `fs.mkdir`, `fs.writeFile`

9. **`env.ts`** (Root)
   - Uses: `node:process`
   - Impact: Environment configuration
   - Functions: `process.env`

### Medium Priority (Tests)

These are test files that can be migrated after production code:

10. **`test/helpers/workspace-test-utils.ts`**
    - Uses: `node:path`, `node:fs/promises`
    - Functions: `path.join`, `fs.mkdir`, `fs.rm`, `fs.access`, `fs.readFile`

11. **`test/obis-profile.test.ts`**
    - Uses: `node:fs`, `node:path`, `node:os`
    - Functions: `fs.mkdtempSync`, `fs.writeFileSync`, `fs.rmSync`, `os.tmpdir`

12. **`test/workspace-service.test.ts`**
13. **`test/config-discovery-cause-demo.test.ts`**
14. **`test/csv-row-reader.test.ts`**
15. **`test/duckdb-inference-behavior.test.ts`**
16. **`test/date-validation.test.ts`**
17. **`test/error-handling/*.test.ts`** (multiple files)

### Low Priority (Scripts)

18. **`scripts/demo-cause-improvement.ts`**
    - Uses: `node:path`
    - Functions: `path.join`

---

## Recommended Migration Strategy

### Phase 1: Path Operations (Low Risk)

**Replace `node:path` with `@std/path` across all files**

1. Add `@std/path` to imports section in `deno.json`
2. Replace imports systematically:
   ```diff
   - import * as path from "node:path";
   + import { join, resolve, dirname, basename, relative, extname } from "@std/path";
   ```
3. Run tests to verify no regressions

**Benefits:**
- Drop-in replacement (same API)
- Reduces Node.js dependency footprint
- More Deno-native

**Risk:** VERY LOW (APIs are identical)

---

### Phase 2: File System Operations (Medium Risk)

**Replace `node:fs/promises` with Deno native APIs**

#### Step 1: Read/Write Operations
```typescript
// Replace fs.readFile
- const content = await fs.readFile(path, "utf-8");
+ const content = await Deno.readTextFile(path);

// Replace fs.writeFile
- await fs.writeFile(path, content, "utf-8");
+ await Deno.writeTextFile(path, content);
```

#### Step 2: Directory Operations
```typescript
// Replace fs.mkdir
- await fs.mkdir(dir, { recursive: true });
+ await Deno.mkdir(dir, { recursive: true });

// Or use @std/fs for convenience
+ import { ensureDir } from "@std/fs";
+ await ensureDir(dir);
```

#### Step 3: File Existence Checks
```typescript
// Replace fs.access
- await fs.access(path);
+ import { exists } from "@std/fs";
+ await exists(path);

// Or use Deno.stat
+ try {
+   await Deno.stat(path);
+ } catch {
+   // doesn't exist
+ }
```

#### Step 4: Remove Operations
```typescript
// Replace fs.rm / fs.unlink
- await fs.rm(path, { recursive: true });
+ await Deno.remove(path, { recursive: true });

- await fs.unlink(path);
+ await Deno.remove(path);
```

**Benefits:**
- Native Deno APIs (no compatibility layer)
- Better error messages
- More consistent with Deno idioms

**Risk:** MEDIUM (requires testing file operations carefully)

---

### Phase 3: Process and OS Operations (Low Risk)

#### Environment Variables
```typescript
// In env.ts
- import process from "node:process";
- const dbUrl = process.env.DATABASE_URL;
+ const dbUrl = Deno.env.get("DATABASE_URL");
```

#### Temporary Directories
```typescript
// In test files
- import * as os from "node:os";
- const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prefix-"));
+ const tempDir = await Deno.makeTempDir({ prefix: "prefix-" });
```

**Benefits:**
- Simpler API
- Async by default (better for Deno)
- No sync operations

**Risk:** LOW (simple replacements)

---

## Migration Checklist

### Pre-Migration
- [ ] Review current Node.js module usage (this document)
- [ ] Ensure comprehensive test coverage for affected code
- [ ] Create feature branch for migration

### Phase 1: Path Operations
- [ ] Replace `node:path` imports with `@std/path` in core packages
- [ ] Replace `node:path` imports in CLI
- [ ] Replace `node:path` imports in tests
- [ ] Replace `node:path` imports in scripts
- [ ] Run full test suite and verify no regressions

### Phase 2: File System Operations
- [ ] Replace `fs.readFile`/`fs.writeFile` with `Deno.readTextFile`/`Deno.writeTextFile`
- [ ] Replace `fs.mkdir` with `Deno.mkdir` or `@std/fs/ensureDir`
- [ ] Replace `fs.access` with `@std/fs/exists` or `Deno.stat`
- [ ] Replace `fs.rm`/`fs.unlink` with `Deno.remove`
- [ ] Replace `fs.mkdtempSync` with `Deno.makeTempDir`
- [ ] Update `packages/core/src/utils/effect-utils.ts` (shared utilities)
- [ ] Run full test suite and verify no regressions

### Phase 3: Process and OS Operations
- [ ] Replace `process.env` with `Deno.env` in `env.ts`
- [ ] Replace `os.tmpdir()` with `Deno.makeTempDir()` in tests
- [ ] Run full test suite and verify no regressions

### Post-Migration
- [ ] Remove unused Node.js compatibility imports
- [ ] Update documentation to reflect Deno-native APIs
- [ ] Consider removing `node:*` from allowed imports in linter config

---

## API Equivalence Reference

### Path Operations (`@std/path`)

| Node.js (`node:path`) | Deno (`@std/path`) | Notes |
|-----------------------|-------------------|-------|
| `path.join()` | `join()` | Identical API |
| `path.resolve()` | `resolve()` | Identical API |
| `path.dirname()` | `dirname()` | Identical API |
| `path.basename()` | `basename()` | Identical API |
| `path.extname()` | `extname()` | Identical API |
| `path.relative()` | `relative()` | Identical API |
| `path.normalize()` | `normalize()` | Identical API |
| `path.isAbsolute()` | `isAbsolute()` | Identical API |

### File System Operations

| Node.js (`node:fs/promises`) | Deno Native | `@std/fs` Alternative |
|------------------------------|-------------|----------------------|
| `fs.readFile(path, "utf-8")` | `Deno.readTextFile(path)` | - |
| `fs.writeFile(path, data, "utf-8")` | `Deno.writeTextFile(path, data)` | - |
| `fs.access(path)` | `Deno.stat(path)` (throws if not exists) | `exists(path)` (returns boolean) |
| `fs.mkdir(path, { recursive: true })` | `Deno.mkdir(path, { recursive: true })` | `ensureDir(path)` (never fails) |
| `fs.rm(path, { recursive: true })` | `Deno.remove(path, { recursive: true })` | - |
| `fs.unlink(path)` | `Deno.remove(path)` | - |
| `fs.mkdtempSync(prefix)` | `await Deno.makeTempDir({ prefix })` | - |
| `fs.readdir(path)` | `Deno.readDir(path)` (async iterable) | - |

### Process and OS Operations

| Node.js | Deno Native | Notes |
|---------|-------------|-------|
| `process.env.VAR` | `Deno.env.get("VAR")` | Returns `string \| undefined` |
| `process.env` | `Deno.env.toObject()` | Returns all env vars as object |
| `process.cwd()` | `Deno.cwd()` | Identical behavior |
| `process.exit(code)` | `Deno.exit(code)` | Identical behavior |
| `os.tmpdir()` | `Deno.makeTempDir()` | Deno creates the dir, Node just returns path |
| `os.homedir()` | `Deno.env.get("HOME")` | Platform-dependent |
| `os.platform()` | `Deno.build.os` | Returns `"darwin" \| "linux" \| "windows"` |

---

## Trade-offs and Considerations

### Benefits of Migration

1. **More Deno-native** - Uses Deno's built-in APIs instead of Node.js compatibility layer
2. **Better error messages** - Deno's native errors are more descriptive
3. **Reduced dependencies** - No need for Node.js built-in polyfills
4. **Better TypeScript support** - Deno's APIs have better type definitions
5. **Async by default** - Deno prefers async operations (no sync file ops)

### Costs of Migration

1. **Migration effort** - Need to update 30+ files
2. **Testing required** - Must verify all file operations work correctly
3. **Breaking changes** - Some APIs have subtle differences (e.g., `Deno.makeTempDir` creates dir, `os.tmpdir()` just returns path)
4. **Learning curve** - Team needs to learn Deno APIs vs Node.js APIs

### When NOT to Migrate

- **Third-party libraries** - If a library requires `node:*` modules, keep them
- **Performance-critical code** - If Node.js APIs are proven faster (unlikely)
- **Complex edge cases** - If Node.js API has specific behavior that's hard to replicate

---

## Testing Strategy

### Unit Tests
- Run existing test suite after each phase
- Add specific tests for file operations edge cases
- Test error handling (file not found, permission denied, etc.)

### Integration Tests
- Test workspace creation and loading
- Test config discovery with nested directories
- Test CSV parsing with real files

### Manual Testing
- Test CLI commands (`deno task dev:cli`)
- Test validation workflows
- Test workspace management

---

## Example Migration: `effect-utils.ts`

**Before:**
```typescript
import * as Effect from "effect/Effect";
import * as fs from "node:fs/promises";

export function readFile(filePath: string): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf-8"),
    catch: toError,
  });
}

export function writeFile(filePath: string, content: string): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => fs.writeFile(filePath, content, "utf-8"),
    catch: toError,
  });
}

export function ensureDir(dirPath: string): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => fs.mkdir(dirPath, { recursive: true }),
    catch: toError,
  });
}
```

**After:**
```typescript
import * as Effect from "effect/Effect";
import { ensureDir as stdEnsureDir } from "@std/fs";

export function readFile(filePath: string): Effect.Effect<string, Error> {
  return Effect.tryPromise({
    try: () => Deno.readTextFile(filePath),
    catch: toError,
  });
}

export function writeFile(filePath: string, content: string): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => Deno.writeTextFile(filePath, content),
    catch: toError,
  });
}

export function ensureDir(dirPath: string): Effect.Effect<void, Error> {
  return Effect.tryPromise({
    try: () => stdEnsureDir(dirPath),
    catch: toError,
  });
}
```

---

## Next Steps

1. **Review with team** - Discuss migration priority and timeline
2. **Start with Phase 1** - Low-risk path operations migration
3. **Monitor test results** - Ensure no regressions
4. **Gradually migrate** - Don't rush, ensure quality
5. **Update documentation** - Keep CLAUDE.md and other docs current

---

## References

- [Deno Standard Library](https://deno.land/std)
- [Deno File System API](https://deno.land/manual/runtime/file_system)
- [Deno Environment Variables](https://deno.land/manual/runtime/environment_variables)
- [@std/path documentation](https://deno.land/std/path)
- [@std/fs documentation](https://deno.land/std/fs)
