# Error Classification Matrix

This document catalogs all error handling sites in the DarwinKit codebase and classifies them as either **Expected Errors** or **Defects (Unexpected Errors)**.

## Summary

- **Total Error Sites**: 79
- **Expected Errors**: 23
- **Defects**: 56
- **Needs Review**: 0

---

## Classification Table

| File | Line | Error Type | Current Handling | Should Be | Rationale |
|------|------|------------|------------------|-----------|-----------|
| **packages/core/src/workspace/service.ts** |
| service.ts | 90 | CSV parsing failure | Expected | **Expected** ✅ | User-provided CSV may be invalid |
| service.ts | 143 | Workspace file access check | Expected | **Expected** ✅ | User may request non-existent workspace |
| service.ts | 154-155 | Workspace not found | Expected | **Expected** ✅ | User may request non-existent workspace |
| service.ts | 175-176 | JSON.parse failure on workspace file | Expected | **Defect** ❌ | We control workspace format; corruption = bug |
| service.ts | 202 | fs.readdir failure | Expected | **Defect** ❌ | Our workspace directory should always be readable |
| service.ts | 300 | `throw new Error` - Invalid workspace data | N/A | **Defect** ❌ | Throws escape Effect; we control format |
| service.ts | 322 | `throw new Error` - Invalid schema data | N/A | **Defect** ❌ | Throws escape Effect; we control format |
| service.ts | 360 | `throw new Error` - Invalid fields format | N/A | **Defect** ❌ | Throws escape Effect; we control format |
| **packages/core/src/workspace/workspace-validator.ts** |
| workspace-validator.ts | 70 | Config loading failure | Expected | **Expected** ✅ | Wrapper around config service errors |
| workspace-validator.ts | 163 | DuckDB.create() failure | Expected | **Defect** ❌ | Database connection = system failure |
| workspace-validator.ts | 191 | DROP TABLE query failure | Expected | **Defect** ❌ | Internal SQL should always work |
| workspace-validator.ts | 203 | CREATE TABLE from CSV | Expected | **Expected** ✅ | CSV may be invalid format |
| workspace-validator.ts | 280 | Row count query | Expected | **Defect** ❌ | COUNT(*) should always work |
| workspace-validator.ts | 298 | Invalid spec identifier | Expected | **Expected** ✅ | User configuration error |
| workspace-validator.ts | 379 | Field existence check | Expected | **Defect** ❌ | Querying information_schema should always work |
| workspace-validator.ts | 519 | Cross-dataset rule query | Expected | **Defect** ❌ | JOIN query failure = system issue |
| workspace-validator.ts | 648 | Range validation query | Expected | **Defect** ❌ | SQL validation query should always work |
| workspace-validator.ts | 712 | Vocabulary validation query | Expected | **Defect** ❌ | SQL query should always work |
| workspace-validator.ts | 812 | Uniqueness validation query | Expected | **Defect** ❌ | SQL query should always work |
| **packages/core/src/workspace/workspace-config-service.ts** |
| workspace-config-service.ts | 85 | fs.access check for config file | Expected | **Expected** ✅ | User may not have config file |
| workspace-config-service.ts | 112 | Config not found | Expected | **Expected** ✅ | User may not have config file |
| workspace-config-service.ts | 131 | fs.readFile config file | Expected | **Expected** ✅ | File may not exist or be readable |
| workspace-config-service.ts | 147 | JSON.parse config file | Expected | **Expected** ✅ | User config may be invalid JSON |
| workspace-config-service.ts | 168 | Config validation failure | Expected | **Expected** ✅ | User config may be invalid |
| workspace-config-service.ts | 194 | Dataset file not found | Expected | **Expected** ✅ | User-provided path may be wrong |
| **packages/core/src/workspace/config-service.ts** |
| config-service.ts | 74 | fs.access workspace config | Expected | **Expected** ✅ | User may not have config |
| config-service.ts | 100 | fs.readFile workspace config | Expected | **Expected** ✅ | User config may not exist |
| config-service.ts | 116 | JSON.parse workspace config | Expected | **Expected** ✅ | User config may be invalid JSON |
| config-service.ts | 129 | Config validation failure | Expected | **Expected** ✅ | User config may be invalid |
| config-service.ts | 157 | fs.mkdir for workspace dir | Expected | **Defect** ❌ | Creating our directory should work |
| config-service.ts | 178 | fs.writeFile workspace config | Expected | **Defect** ❌ | Writing to our directory should work |
| config-service.ts | 227 | Validation result creation | Expected | **Defect** ❌ | Internal data construction |
| **packages/core/src/parsing/csv-parser.ts** |
| csv-parser.ts | 63 | `throw` - DuckDB connection | N/A | **Defect** ❌ | Throws escape Effect; connection = system issue |
| csv-parser.ts | 166 | `throw` - CSV parsing | N/A | **Expected** ❌ | Throws escape Effect; should use Effect.fail |
| **packages/core/src/parsing/configurable-csv-parser.ts** |
| configurable-csv-parser.ts | 87 | DuckDB.create() failure | Expected | **Defect** ❌ | Database connection = system failure |
| configurable-csv-parser.ts | 114 | CREATE TABLE from CSV | Expected | **Expected** ✅ | CSV may be invalid |
| configurable-csv-parser.ts | 147 | Type conversion failures | Expected | **Expected** ✅ | User data quality issue |
| configurable-csv-parser.ts | 167 | EXPORT DATABASE failure | Expected | **Defect** ❌ | Exporting should always work |
| configurable-csv-parser.ts | 227 | Get table schema query | Expected | **Defect** ❌ | information_schema query should work |
| configurable-csv-parser.ts | 250 | Get row count query | Expected | **Defect** ❌ | COUNT(*) should always work |
| configurable-csv-parser.ts | 309 | Field existence check | Expected | **Defect** ❌ | information_schema query should work |
| configurable-csv-parser.ts | 345 | Type conversion validation query | Expected | **Defect** ❌ | TRY_CAST query should work |
| configurable-csv-parser.ts | 369 | Success count query | Expected | **Defect** ❌ | COUNT(*) should always work |
| configurable-csv-parser.ts | 434 | Type conversion ALTER TABLE | Expected | **Defect** ❌ | SQL DDL should always work |
| configurable-csv-parser.ts | 448 | Rename table query | Expected | **Defect** ❌ | SQL DDL should always work |
| configurable-csv-parser.ts | 488 | Sample values query | Expected | **Defect** ❌ | SELECT DISTINCT should work |
| **packages/core/src/validation/uniqueness-validator.ts** |
| uniqueness-validator.ts | 119 | Workspace lookup query | Expected | **Defect** ❌ | Internal workspace query |
| uniqueness-validator.ts | 133 | Field count query | Expected | **Defect** ❌ | COUNT(*) should work |
| uniqueness-validator.ts | 205 | Duplicate values query | Expected | **Defect** ❌ | GROUP BY query should work |
| uniqueness-validator.ts | 269 | Cross-dataset duplicates query | Expected | **Defect** ❌ | JOIN query should work |
| uniqueness-validator.ts | 350 | Violation details query | Expected | **Defect** ❌ | SELECT query should work |

---

## Categorization Summary

### Expected Errors (Should Use Effect.fail) ✅

These errors are part of normal program flow and represent user/data quality issues:

1. **User-provided file operations**
   - File not found (user paths)
   - Invalid CSV format
   - Malformed JSON in user configs

2. **User configuration errors**
   - Invalid workspace config
   - Invalid field mappings
   - Missing required fields
   - Invalid spec identifiers

3. **Data quality issues**
   - Type conversion failures during validation
   - CSV parsing errors from malformed data
   - Workspace not found (user requested non-existent)
   - Config file not found in discovery

**Total: 23 sites**

---

### Defects (Should Use Effect.die or Effect.orDie) ❌

These represent programming errors or system failures:

1. **Database operations**
   - DuckDB.create() failures (4 sites)
   - Schema queries (information_schema) (5 sites)
   - Row count queries (COUNT(*)) (4 sites)
   - SQL DDL operations (CREATE, ALTER, DROP) (5 sites)
   - Internal SQL queries (SELECT, JOIN, etc.) (8 sites)

2. **File system operations on our directories**
   - Creating workspace directories (1 site)
   - Writing to workspace directories (1 site)
   - Reading workspace directories (1 site)
   - Exporting DuckDB database (1 site)

3. **Data parsing on self-generated data**
   - JSON.parse on workspace files we created (1 site)
   - Invalid workspace data structure (3 sites with `throw`)
   - Invalid schema data structure (1 site with `throw`)

4. **Programming errors**
   - `throw new Error` inside Effect functions (5 sites)
   - Assertion failures on internal state

**Total: 56 sites**

---

## Priority Actions

### Critical Issues (Fix First)

1. **Remove all `throw` statements** - 5 sites
   - These bypass Effect's error channel entirely
   - Located in: service.ts, csv-parser.ts

2. **Database connection failures** - 4 sites
   - Currently treated as expected errors
   - Should be defects (system failures)

3. **Schema/metadata queries** - 5 sites
   - information_schema queries should never fail
   - These are infrastructure, not user data

### Medium Priority

4. **Internal SQL queries** - 20+ sites
   - COUNT(*), GROUP BY, JOIN operations
   - Should use Effect.orDie since they're infrastructure

5. **File operations on our directories** - 4 sites
   - Creating/writing to workspace directories
   - Should be defects (permission errors = system issue)

### Low Priority (But Important)

6. **JSON parsing on self-generated data** - 1 site
   - Workspace files we control
   - Corruption = defect, not expected error

---

## Migration Guide

### Pattern 1: Database Connection
**Before:**
```typescript
const connection = yield* _(
  Effect.tryPromise({
    try: () => DuckDB.create(),
    catch: (error) => new SomeError({ ... })
  })
);
```

**After:**
```typescript
const connection = yield* _(
  Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie)
);
```

### Pattern 2: Infrastructure Queries
**Before:**
```typescript
const result = yield* _(
  Effect.tryPromise({
    try: () => connection.runAndReadAll(query),
    catch: (error) => new ValidationError({ ... })
  })
);
```

**After:**
```typescript
const result = yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(query)).pipe(Effect.orDie)
);
```

### Pattern 3: Replace `throw` with Effect
**Before:**
```typescript
function parseWorkspace(data: unknown): Workspace {
  if (!data) {
    throw new Error("Invalid data");
  }
  // ...
}
```

**After:**
```typescript
function parseWorkspace(data: unknown): Effect.Effect<Workspace, never> {
  if (!data) {
    return Effect.die(new Error("Invalid workspace data structure"));
  }

  return Effect.try(() => {
    // ... parsing
  }).pipe(Effect.orDie);
}
```

### Pattern 4: User Data Queries (Keep as Expected)
**Before & After (No Change):**
```typescript
// Creating table from user CSV - failures are expected
const result = yield* _(
  Effect.tryPromise({
    try: () => connection.runAndReadAll(createTableQuery),
    catch: (error) => new ParseError({ ... })  // ✅ Keep this
  })
);
```

---

## Testing Checklist

For each refactored site:

- [ ] Expected errors catchable with `Effect.catchAll`
- [ ] Defects require `Effect.catchAllDefect`
- [ ] Error messages remain helpful
- [ ] Existing tests still pass
- [ ] New tests added for error scenarios

---

## References

- Implementation Plan: `IMPLEMENTATION_PLAN.md`
- Error Handling Guide: `docs/error-handling-guide.md`
- Effect Documentation: https://effect.website/docs/error-management/two-error-types/
