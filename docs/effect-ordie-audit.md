# Effect.orDie Usage Audit

**Date**: 2025-10-29
**Purpose**: Audit all uses of `Effect.orDie` to ensure correct application of infrastructure vs user error distinction

## Summary

**Total orDie usages found**: 27
**Correct usages**: 27 ✅
**Needs correction**: 0 ✅

All `Effect.orDie` usages in the codebase are correctly applied to infrastructure operations and defects, not user errors.

## Decision Framework

Before using `Effect.orDie`, ask:

1. ✅ **Use orDie** if:
   - Infrastructure failure (database connection, file system)
   - Operations on self-generated data (parsing our own JSON)
   - DDL operations on tables we created
   - Queries on information_schema or system tables
   - Would indicate a programming bug if it fails

2. ❌ **Don't use orDie** if:
   - User-provided data validation
   - User-provided file paths
   - User configuration errors
   - Network requests to external services
   - Any error the user can fix

## Audit Results by File

### 1. csv-row-reader.ts (3 usages) ✅

**Lines 120, 188, 271**: DuckDB connection creation
```typescript
// Connection creation is infrastructure - use orDie
const connection = yield* _(
  Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
);
```

**Rationale**: If we can't create a DuckDB connection, the system is unusable. This is an infrastructure failure, not a user error. User-facing errors (file not found, invalid field names) are properly handled as `CsvReadError`.

**Status**: ✅ Correct usage

---

### 2. csv-parser.ts (5 usages) ✅

**Line 62**: DuckDB connection creation
```typescript
// Create DuckDB connection - failure is a system defect
const connection = yield* _(
  Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
);
```

**Line 104**: Information schema query
```typescript
const schemaResult = yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(schemaQuery)).pipe(Effect.orDie),
);
```

**Line 112**: Row count query on self-created table
```typescript
// Get row count - infrastructure query should always work (defect if it fails)
const countResult = yield* _(
  Effect.tryPromise(() =>
    connection.runAndReadAll(`SELECT COUNT(*) as count FROM ${tableName}`)
  ).pipe(Effect.orDie),
);
```

**Line 138**: Sample query on self-created table
```typescript
const sampleResult = yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(sampleQuery)).pipe(Effect.orDie),
);
```

**Line 158**: DROP TABLE on self-created table
```typescript
// Clean up temporary table - DDL should always work (defect if it fails)
yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(`DROP TABLE ${tableName}`)).pipe(
    Effect.orDie,
  ),
);
```

**Rationale**: All operations are on temporary tables we created ourselves. If these fail, it's a system issue (out of memory, disk full, DuckDB bug), not a user error. User data errors are caught during the CSV load phase.

**Status**: ✅ All correct

---

### 3. service.ts (1 usage) ✅

**Line 165**: JSON parsing of self-generated workspace files
```typescript
// Parse JSON - if this fails, it's a defect (file corruption)
const parsedData = yield* _(
  Effect.try({
    try: () => JSON.parse(workspaceData),
    catch: (error) =>
      new Error(
        `Workspace file corrupted: ${error instanceof Error ? error.message : String(error)}`,
      ),
  }).pipe(Effect.orDie),
);
```

**Rationale**: We're parsing workspace files that we created ourselves. If we can't parse our own JSON, either:
1. File got corrupted (system issue)
2. We have a bug in the code that writes the files (programming defect)

In both cases, this is a defect, not a user error the user can fix.

**Status**: ✅ Correct usage

---

### 4. workspace-validator.ts (8 usages) ✅

**Line 164**: DuckDB connection creation
```typescript
// Create DuckDB connection - failure is a system defect
const connection = yield* _(
  Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
);
```

**Line 185**: DROP TABLE DDL
```typescript
// Drop existing table first - DDL operations should always work (defect if they fail)
yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(dropTableQuery)).pipe(
    Effect.orDie,
  ),
);
```

**Line 270**: COUNT query on loaded data
```typescript
// Get row count - infrastructure query should always work (defect if it fails)
const countResult = yield* _(
  Effect.tryPromise(() =>
    connection.runAndReadAll(`SELECT COUNT(*) as count FROM ${tableName}`)
  ).pipe(Effect.orDie),
);
```

**Line 366**: information_schema query
```typescript
// Querying information_schema is infrastructure - should always work (defect if it fails)
const fieldExistsResult = yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(fieldExistsQuery)).pipe(
    Effect.orDie,
  ),
);
```

**Lines 507, 630, 687, 780**: SQL queries for validation
```typescript
// SQL query execution should work - query failure is a defect
const result = yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie),
);
```

**Rationale**: All operations are on tables we've loaded and DDL we control. These are infrastructure queries to validate user data - if the queries themselves fail, it's a system issue. The validation results (finding violations) are returned as data, not errors.

**Status**: ✅ All correct

---

### 5. configurable-csv-parser.ts (10 usages) ✅

**Line 92**: DuckDB connection creation
```typescript
// Create DuckDB connection - failure is a system defect
const connection = yield* _(
  Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
);
```

**Line 164**: EXPORT DATABASE DDL
```typescript
// Save to persistent DuckDB file - this is infrastructure and should always work (defect if it fails)
yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(`EXPORT DATABASE '${duckdbPath}'`)).pipe(
    Effect.orDie,
  ),
);
```

**Lines 219, 234, 287**: Infrastructure queries (schema, count, metadata)
```typescript
// Querying information_schema is infrastructure - should always work (defect if it fails)
return Effect.tryPromise(async () => {
  const result = await connection.runAndReadAll(schemaQuery);
  return result.getRowObjects();
}).pipe(Effect.orDie);
```

**Lines 315, 332, 423**: SQL queries for type validation and sampling
```typescript
// SQL query execution should work - query failure is a defect
const failures = yield* _(
  Effect.tryPromise(async () => {
    const result = await connection.runAndReadAll(failuresQuery);
    return result.getRowObjects();
  }).pipe(Effect.orDie),
);
```

**Lines 384, 391**: DDL operations (CREATE TABLE, ALTER TABLE)
```typescript
// SQL DDL operations should always work - query failure is a defect
yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(convertQuery)).pipe(Effect.orDie),
);
```

**Rationale**: All infrastructure operations on tables and data we control. If these fail, it's a system issue (disk full, DuckDB bug, etc.), not a user error.

**Status**: ✅ All correct

---

## Common Patterns

### Pattern 1: Database Connection Creation
```typescript
const connection = yield* _(
  Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
);
```
**Why orDie**: System can't function without database. Infrastructure failure.

### Pattern 2: Information Schema Queries
```typescript
const schemaResult = yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(informationSchemaQuery)).pipe(
    Effect.orDie,
  ),
);
```
**Why orDie**: Querying system tables should always work. Failure indicates system issue.

### Pattern 3: DDL on Self-Created Tables
```typescript
yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(`DROP TABLE ${tableName}`)).pipe(
    Effect.orDie,
  ),
);
```
**Why orDie**: We created these tables. If we can't drop them, it's a system issue.

### Pattern 4: Queries on Loaded Data
```typescript
const result = yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(validationQuery)).pipe(
    Effect.orDie,
  ),
);
```
**Why orDie**: The query itself failing is different from finding violations. Query execution failure is a defect. Violations are returned as data, not errors.

## Anti-Pattern (Not Found in Codebase) ❌

**Bad Example** (what we're NOT doing):
```typescript
// ❌ WRONG - User-provided path should use Effect.fail
const csvData = yield* _(
  Effect.tryPromise(() => Deno.readFile(userProvidedPath)).pipe(
    Effect.orDie  // ❌ Wrong! User can fix this
  ),
);
```

**Correct version** (what we ARE doing):
```typescript
// ✅ CORRECT - User errors use Effect.fail with typed errors
const csvData = yield* _(
  Effect.tryPromise({
    try: () => Deno.readFile(userProvidedPath),
    catch: (error) => new CsvReadError({
      message: `File not found: ${userProvidedPath}`,
      csvPath: userProvidedPath,
    })
  }),
);
```

## Recommendations

### ✅ Current State is Good
All `Effect.orDie` usages in the codebase follow the correct pattern:
- Infrastructure operations only
- Self-generated data operations only
- Proper comments explaining why it's a defect

### ✅ Documentation Added
Most uses already have clear comments like:
- "Connection creation is infrastructure - use orDie"
- "DDL should always work (defect if it fails)"
- "SQL query execution should work - query failure is a defect"

### 📝 Recommendation: Keep This Pattern

When adding new code:

1. **Default to Effect.fail** for new error paths
2. **Only use orDie** when you can justify it with one of these reasons:
   - Infrastructure initialization (connections, system resources)
   - Operations on data we generated ourselves
   - System metadata queries
   - Would indicate a programming bug if it fails

3. **Always add a comment** explaining why it's a defect:
   ```typescript
   // Connection creation is infrastructure - use orDie
   const connection = yield* _(
     Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
   );
   ```

## Related Documentation

- See `docs/error-handling-guide.md` for comprehensive error handling patterns
- See `docs/effect-scope-mechanism.md` for resource management patterns
- See Stage 1-3 refactoring in `IMPLEMENTATION_PLAN.md` for typed error examples

## Conclusion

✅ **Audit Result**: All `Effect.orDie` usages are correct
✅ **No changes needed**: Current code follows best practices
✅ **Documentation exists**: Most usages have clear comments
📝 **Recommendation**: Maintain current patterns in new code
