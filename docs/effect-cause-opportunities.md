# Effect Cause Type: Opportunities for Improved Error Tracing

**Date:** 2025-10-21
**Status:** ✅ IMPLEMENTED (Config Discovery) + Analysis & Recommendations

## Implementation Status

### ✅ Completed: Config Discovery Enhancement

We've successfully implemented Effect's Cause type to improve config discovery error messages:

**What was built:**
1. **Generic Cause formatting utilities** (`packages/shared/src/utils/cause-formatter.ts`)
   - `prettyPrintCause<E>(cause, formatter)` - Generic infrastructure for any error type
   - `createMultiErrorFormatter()` - Helper for type-safe error formatting
   - Fully reusable across the entire codebase

2. **Config-specific implementation** (`packages/core/src/workspace/workspace-config-service.ts`)
   - Enhanced `ConfigNotFoundError` to track all searched paths
   - Created `formatConfigError` using generic utilities
   - Integrated with CLI for better user experience

3. **Comprehensive tests**
   - Config discovery demonstrations
   - Generic formatter tests with API, database, and file system errors
   - Shows reusability across different domains

**Key Benefits Achieved:**
- Shows all searched paths (not just the starting directory)
- Provides actionable suggestions to fix issues
- Structured data available for programmatic handling
- Single source of truth for error formatting via Cause
- Reusable utilities for future error handling

### Using the Generic Utilities

```typescript
import { prettyPrintCause, createMultiErrorFormatter } from "@dwkt/shared";

// Define your error types
class MyError extends Data.TaggedClass("MyError")<{
  readonly message: string;
  readonly context: string;
}> {}

// Create a formatter
const formatMyErrors = createMultiErrorFormatter<MyError>([
  [MyError, (e) => `Error in ${e.context}: ${e.message}`],
]);

// Use it with any Cause
const cause = getSomeCause();
const message = prettyPrintCause(cause, formatMyErrors);
```

See `test/cause-formatter-generic.test.ts` for examples with API, database, and file system errors.

---

## Executive Summary

This document analyzes DarwinKit's current error handling patterns and identifies opportunities to leverage Effect's `Cause` type for improved error tracing, debugging, and developer experience. The Cause type provides sophisticated error chaining, parallel error aggregation, and explicit distinction between expected failures and defects.

**Key Finding:** DarwinKit already uses Effect extensively with good fail/die separation. We've now added generic Cause formatting utilities and proven their value with config discovery. The remaining opportunities involve applying these utilities to validation pipelines and API error handling.

---

## What is Effect's Cause Type?

The `Cause<E>` data type preserves a complete picture of error context beyond what error type `E` alone captures:

- **Full error chains** - Sequential operations that fail preserve the entire chain
- **Parallel error aggregation** - Concurrent failures are captured together
- **Fail vs Die distinction** - Expected errors vs unexpected defects are explicitly tracked
- **Fiber interruption** - Tracks which fibers were interrupted and why
- **Rich debugging info** - Stack traces, error context, and causal relationships

### Key Capabilities

```typescript
// Pattern matching on causes
Cause.match(cause, {
  onEmpty: () => "No errors",
  onFail: (error) => `Expected error: ${error}`,
  onDie: (defect) => `Unexpected defect: ${defect}`,
  onInterrupt: (fiberId) => `Interrupted: ${fiberId}`,
  onSequential: (left, right) => `First ${left}, then ${right}`,
  onParallel: (left, right) => `Both ${left} and ${right}`,
});

// Pretty printing for debugging
console.log(Cause.pretty(cause));

// Extracting specific error types
const failures = Cause.failures(cause);  // All expected errors
const defects = Cause.defects(cause);    // All unexpected defects

// Creating effects with specific causes
Effect.failCause(Cause.sequential(cause1, cause2));
```

---

## Current Error Handling Patterns in DarwinKit

### Pattern 1: Expected Errors (Effect.fail)

Used for recoverable, user-facing errors like invalid input or missing files:

```typescript
// packages/core/src/parsing/csv-parser.ts:77-87
yield* _(
  Effect.tryPromise({
    try: () => connection.runAndReadAll(query),
    catch: (error) =>
      new ParseError({
        message: `Failed to parse CSV file: ${error}`,
        filePath,
        code: ErrorCode.PARSE_ERROR,
        cause: error instanceof Error ? error : new Error(String(error)),
      }),
  })
);
```

### Pattern 2: Defects (Effect.die / Effect.orDie)

Used for system failures that indicate bugs or infrastructure issues:

```typescript
// packages/core/src/parsing/csv-parser.ts:61-62
const connection = yield* _(
  Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie)
);

// packages/core/src/parsing/csv-parser.ts:103-105
const schemaResult = yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(schemaQuery)).pipe(Effect.orDie)
);
```

### Pattern 3: Error Transformation (Effect.mapError)

Adding context as errors propagate up the stack:

```typescript
// packages/core/src/workspace/service.ts:91-97
parseFileForWorkspace(options.filePath, options.parseOptions).pipe(
  Effect.mapError((error) =>
    new WorkspaceError({
      message: `Failed to parse file: ${error.message}`,
      code: ErrorCode.PARSE_ERROR,
      cause: error.cause,
    })
  )
)
```

**Current Limitation:** While `cause` field preserves the original error, the typed error information (e.g., `ParseError` vs `ValidationError`) is lost when wrapped.

---

## Critical Error Context Loss Points

### 1. Multi-Step Config Discovery Chain

**Location:** `packages/core/src/workspace/workspace-config-service.ts:213-232`

**Current Code:**
```typescript
static discoverAndLoad(
  searchDir?: string,
): Effect.Effect<
  { config: WorkspaceConfig; configPath: string },
  ConfigNotFoundError | ConfigParseError | ConfigValidationError | DatasetFileNotFoundError
> {
  return Effect.gen(function* (_) {
    // Step 1: Find config file
    const configPath = yield* _(WorkspaceConfigService.discoverConfig(searchDir));

    // Step 2: Load and parse config
    const config = yield* _(WorkspaceConfigService.loadConfig(configPath));

    // Step 3: Validate dataset file paths
    const basePath = path.dirname(configPath);
    yield* _(WorkspaceConfigService.validateDatasetPaths(config, basePath));

    return { config, configPath };
  });
}
```

**Issue:** When this fails, we know which error type occurred, but we lose the causal chain showing:
- Where in the directory tree we searched
- Which config file we tried to parse
- Which dataset path failed validation

**With Cause Enhancement:**
```typescript
// When debugging, you could see:
// ConfigNotFoundError: No darwinkit.json found
//   Sequential: Searched ./config
//   Sequential: Searched ../config
//   Sequential: Searched ../../config
//   Sequential: Searched ~/
```

### 2. Validation Pipeline with Type Erasure

**Location:** `packages/core/src/workspace/workspace-validator.ts:67-77`

**Current Code:**
```typescript
const { config, configPath: resolvedConfigPath } = yield* _(
  WorkspaceConfigService.discoverAndLoad(configPath).pipe(
    Effect.mapError((error) =>
      new WorkspaceValidationError({
        message: `Failed to load workspace config: ${error.message}`,
        code: ErrorCode.VALIDATION_FAILED,
        cause: error instanceof Error ? error : new Error(String(error)),
      })
    ),
  ),
);
```

**Issue:** The union type `ConfigNotFoundError | ConfigParseError | ConfigValidationError | DatasetFileNotFoundError` is flattened to generic `WorkspaceValidationError`. The specific error type discrimination is lost.

**Impact:** API consumers and debugging tools can't distinguish between:
- Config file not found (maybe provide better search paths)
- Config file found but malformed JSON (syntax error in user file)
- Config valid JSON but schema mismatch (version incompatibility)
- Dataset file referenced in config doesn't exist (broken reference)

**With Cause Enhancement:**
```typescript
const { config, configPath: resolvedConfigPath } = yield* _(
  WorkspaceConfigService.discoverAndLoad(configPath).pipe(
    Effect.mapError((error) => {
      // Preserve original error as a Cause
      const originalCause = Effect.asCause(Effect.fail(error));
      return new WorkspaceValidationError({
        message: `Failed to load workspace config: ${error.message}`,
        code: ErrorCode.VALIDATION_FAILED,
        cause: Cause.fail(error),  // Keep the typed error
      });
    }),
  ),
);
```

### 3. API Error Handling Generic Fallback

**Location:** `packages/api/src/routes/workspace.ts:27-37`

**Current Code:**
```typescript
app.get("/:id", async (c) => {
  const id = c.req.param("id");

  try {
    const workspace = await Effect.runPromise(workspaceService.load(id));
    return c.json(workspace);
  } catch (error) {
    console.error("Failed to load workspace:", error);
    return c.json({ error: "Workspace not found" }, 404);
  }
});
```

**Issue:** All errors become 404, even if it's:
- `WorkspaceIOError` (500 - server file system issue)
- `WorkspaceError` with `PARSE_ERROR` (500 - corrupted workspace file)
- `WorkspaceError` with `WORKSPACE_NOT_FOUND` (404 - legitimately missing)

**With Cause Enhancement:**
```typescript
app.get("/:id", async (c) => {
  const id = c.req.param("id");

  const result = await Effect.runPromiseExit(workspaceService.load(id));

  if (Exit.isFailure(result)) {
    const cause = result.cause;

    return Cause.match(cause, {
      onFail: (error) => {
        // Expected errors - map to appropriate HTTP codes
        if (error.code === ErrorCode.WORKSPACE_NOT_FOUND) {
          return c.json({ error: error.message }, 404);
        }
        if (error.code === ErrorCode.WORKSPACE_IO_ERROR) {
          return c.json({ error: "Internal server error" }, 500);
        }
        return c.json({ error: error.message }, 400);
      },
      onDie: (defect) => {
        // Unexpected defects - always 500
        console.error("Unexpected defect:", defect);
        return c.json({ error: "Internal server error" }, 500);
      },
      onInterrupt: () => {
        return c.json({ error: "Request interrupted" }, 499);
      },
    });
  }

  return c.json(Exit.getOrThrow(result));
});
```

---

## High-Value Opportunities for Cause Usage

### Opportunity 1: Config Discovery with Full Search Path Trace

**Priority:** HIGH
**Complexity:** LOW
**Impact:** Better user error messages

**Location:** `packages/core/src/workspace/workspace-config-service.ts:48-104`

**Current Behavior:**
```
Error: Configuration file not found
```

**Enhanced with Cause:**
```
Error: Configuration file not found
  Searched paths:
    - /Users/steve/project/darwinkit.json
    - /Users/steve/darwinkit.json
    - /Users/darwinkit.json
  Suggestion: Create darwinkit.json in your project directory
```

**Implementation Approach:**
```typescript
static discoverConfig(
  searchDir?: string,
): Effect.Effect<string, ConfigNotFoundError> {
  return Effect.gen(function* (_) {
    const startDir = searchDir ? path.resolve(searchDir) : Deno.cwd();
    let currentDir = startDir;
    const searchedPaths: string[] = [];

    while (true) {
      const configPath = path.join(currentDir, CONFIG_FILENAME);
      searchedPaths.push(configPath);

      const exists = yield* _(
        Effect.tryPromise({
          try: () => fs.access(configPath),
          catch: () => new Error("not found"),
        }).pipe(
          Effect.map(() => true),
          Effect.catchAll(() => Effect.succeed(false)),
        ),
      );

      if (exists) {
        return configPath;
      }

      const parent = path.dirname(currentDir);
      if (parent === currentDir) {
        // Reached root - not found
        return yield* _(
          Effect.fail(
            new ConfigNotFoundError({
              message: `Configuration file not found. Searched paths:\n${
                searchedPaths.map(p => `  - ${p}`).join('\n')
              }`,
              searchedPaths,  // Include in error for programmatic access
            })
          )
        );
      }

      currentDir = parent;
    }
  });
}
```

### Opportunity 2: Multi-Dataset Validation Error Aggregation

**Priority:** MEDIUM
**Complexity:** MEDIUM
**Impact:** See all validation failures at once instead of fail-fast

**Location:** `packages/core/src/workspace/workspace-validator.ts:90-115`

**Current Behavior:**
- Validates datasets sequentially
- Stops on first critical error if `failFast: true`
- Even with `failFast: false`, only returns first Effect error

**Enhanced with Cause:**
```typescript
// Collect all validation results, both successes and failures
const datasetResultsOrErrors = yield* _(
  Effect.all(
    config.datasets.map(dataset =>
      validateDataset(connection, dataset, validationProfile).pipe(
        Effect.either,  // Convert to Either<Error, Success>
      )
    ),
    { concurrency: "unbounded" }  // Validate in parallel
  )
);

// Partition into successes and failures
const successes: DatasetValidationResult[] = [];
const failures: Array<{ dataset: string; error: ValidationError }> = [];

datasetResultsOrErrors.forEach((result, idx) => {
  if (Either.isLeft(result)) {
    failures.push({
      dataset: config.datasets[idx].name,
      error: result.left,
    });
  } else {
    successes.push(result.right);
  }
});

// If any failures, create aggregated Cause
if (failures.length > 0 && config.validation.failFast) {
  const causes = failures.map(f => Cause.fail(f.error));
  const aggregatedCause = causes.reduce(
    (acc, c) => Cause.sequential(acc, c),
    Cause.empty
  );

  return yield* _(Effect.failCause(aggregatedCause));
}
```

**User Experience:**
```
Validation failed for 3 datasets:

1. event_data:
   - Field 'eventDate': Invalid date format 'not-a-date' at row 42
   - Field 'country': Value 'XYZ' not in controlled vocabulary

2. occurrence_data:
   - Field 'eventID': Missing required field
   - Field 'scientificName': 150 rows have empty values

3. measurement_data:
   - Foreign key violation: 23 records reference non-existent eventID
```

### Opportunity 3: API Error Type Discrimination

**Priority:** MEDIUM
**Complexity:** LOW
**Impact:** Better HTTP status codes and error responses

**Location:** All API routes in `packages/api/src/routes/`

**Pattern to Implement:**
```typescript
// Shared error handler utility
export function handleEffectResult<A, E extends DarwinKitError>(
  result: Exit.Exit<A, E>,
  c: Context,
): Response {
  if (Exit.isSuccess(result)) {
    return c.json(result.value);
  }

  const cause = result.cause;

  return Cause.match(cause, {
    onEmpty: () => c.json({ error: "Unknown error" }, 500),

    onFail: (error) => {
      // Map error codes to HTTP status codes
      const statusMap: Record<string, number> = {
        [ErrorCode.WORKSPACE_NOT_FOUND]: 404,
        [ErrorCode.INVALID_INPUT]: 400,
        [ErrorCode.VALIDATION_FAILED]: 422,
        [ErrorCode.WORKSPACE_IO_ERROR]: 500,
        [ErrorCode.DATABASE_ERROR]: 500,
        [ErrorCode.UNAUTHORIZED]: 401,
        [ErrorCode.FILE_NOT_FOUND]: 404,
      };

      const status = statusMap[error.code] ?? 500;

      return c.json({
        error: error.message,
        code: error.code,
        details: error.details,
      }, status);
    },

    onDie: (defect) => {
      console.error("Unexpected defect:", defect);
      return c.json({
        error: "Internal server error",
        message: "An unexpected error occurred",
      }, 500);
    },

    onInterrupt: () => {
      return c.json({ error: "Request cancelled" }, 499);
    },

    onSequential: (left, right) => {
      // Handle chained errors - show first failure
      return handleCause(left, c);
    },

    onParallel: (left, right) => {
      // Multiple concurrent failures
      const leftErrors = Cause.failures(left);
      const rightErrors = Cause.failures(right);

      return c.json({
        error: "Multiple validation errors",
        errors: [...leftErrors, ...rightErrors].map(e => ({
          message: e.message,
          code: e.code,
        })),
      }, 422);
    },
  });
}

function handleCause<E extends DarwinKitError>(
  cause: Cause.Cause<E>,
  c: Context,
): Response {
  return Cause.match(cause, {
    onFail: (error) => handleError(error, c),
    onDie: (defect) => handleDefect(defect, c),
    // ... other cases
  });
}
```

**Usage in routes:**
```typescript
app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const result = await Effect.runPromiseExit(workspaceService.load(id));
  return handleEffectResult(result, c);
});
```

### Opportunity 4: Pretty Error Printing for CLI

**Priority:** LOW
**Complexity:** LOW
**Impact:** Better debugging experience

**Location:** `packages/cli/src/commands/validate.ts`

**Enhancement:**
```typescript
const result = await Effect.runPromiseExit(
  validator.validateFromConfig(configPath)
);

if (Exit.isFailure(result)) {
  console.error("\n❌ Validation failed\n");
  console.error(Cause.pretty(result.cause));

  // Additionally, show structured error info
  const failures = Cause.failures(result.cause);
  const defects = Cause.defects(result.cause);

  if (failures.length > 0) {
    console.error("\n📋 Expected Errors:");
    failures.forEach(error => {
      console.error(`  - [${error.code}] ${error.message}`);
    });
  }

  if (defects.length > 0) {
    console.error("\n💥 Unexpected Defects:");
    defects.forEach(defect => {
      console.error(`  - ${defect}`);
    });
  }

  Deno.exit(1);
}
```

---

## Recommended Implementation Strategy

### Phase 1: Foundation (Low Risk)
1. **Add Cause.pretty to CLI error output** - Better debugging immediately
2. **Update API routes to use Effect.runPromiseExit** - Preserve error types
3. **Create error handler utility** - Consistent HTTP status mapping

### Phase 2: Enhanced Tracing (Medium Risk)
1. **Config discovery search path tracking** - Better user messages
2. **Validation error aggregation** - See all errors at once
3. **Add cause field to error types** - `cause?: Cause.Cause<E>`

### Phase 3: Advanced Features (Higher Risk)
1. **Parallel validation with Cause.parallel** - True concurrent validation
2. **Sequential cause chains** - Explicit multi-step tracing
3. **Fiber interruption handling** - Graceful cancellation

---

## Code Examples: Before & After

### Example 1: Config Loading with Context Preservation

**Before:**
```typescript
const config = yield* _(
  WorkspaceConfigService.loadConfig(configPath).pipe(
    Effect.mapError(error =>
      new WorkspaceValidationError({
        message: `Failed to load config: ${error.message}`,
        code: ErrorCode.VALIDATION_FAILED,
        cause: error instanceof Error ? error : new Error(String(error)),
      })
    )
  )
);
```

**After:**
```typescript
const config = yield* _(
  WorkspaceConfigService.loadConfig(configPath).pipe(
    Effect.catchAllCause(cause => {
      // Preserve the full cause chain
      return Effect.failCause(
        Cause.sequential(
          cause,
          Cause.fail(new WorkspaceValidationError({
            message: "Validation failed during config loading",
            code: ErrorCode.VALIDATION_FAILED,
          }))
        )
      );
    })
  )
);
```

**Debug Output:**
```
WorkspaceValidationError: Validation failed during config loading
  Sequential:
    ConfigParseError: JSON syntax error at line 15
      Sequential:
        SyntaxError: Unexpected token '}' in JSON at position 342
```

### Example 2: Parallel Validation with Aggregation

**Before:**
```typescript
// Sequential validation - stops on first error
for (const dataset of config.datasets) {
  const result = yield* _(validateDataset(connection, dataset, validationProfile));
  datasetResults.push(result);

  if (config.validation.failFast && result.status === "fail") {
    break;
  }
}
```

**After:**
```typescript
// Parallel validation with error aggregation
const results = yield* _(
  Effect.all(
    config.datasets.map(dataset =>
      validateDataset(connection, dataset, validationProfile).pipe(
        Effect.either
      )
    ),
    { concurrency: 4 }  // Validate 4 datasets at a time
  )
);

// Partition results
const failures = results.flatMap((r, idx) =>
  Either.isLeft(r)
    ? [{ dataset: config.datasets[idx].name, error: r.left }]
    : []
);

if (failures.length > 0) {
  const causes = failures.map(f => Cause.fail(f.error));
  const aggregated = causes.reduce(Cause.parallel, Cause.empty);

  return yield* _(
    Effect.failCause(
      Cause.fail(new WorkspaceValidationError({
        message: `${failures.length} dataset(s) failed validation`,
        code: ErrorCode.VALIDATION_FAILED,
        failedDatasets: failures.map(f => f.dataset),
      })).pipe(
        cause => Cause.sequential(aggregated, cause)
      )
    )
  );
}
```

---

## Trade-offs and Considerations

### Benefits
- **Better debugging** - Full error chains visible in logs
- **Better UX** - More specific error messages with context
- **Better API design** - Proper HTTP status codes
- **Better testing** - Can assert on specific error chains
- **Better observability** - Structured error data for monitoring

### Costs
- **Learning curve** - Team needs to understand Cause API
- **Verbosity** - More code for error handling
- **Type complexity** - Cause types can be complex
- **Migration effort** - Need to update existing error handling

### When NOT to use Cause

- **Simple operations** - Single operation with one error type
- **Already clear errors** - Existing error has sufficient context
- **Performance critical** - Cause tracking has overhead
- **External APIs** - Can't control their error format

---

## Next Steps

1. **Review with team** - Discuss which opportunities align with priorities
2. **Prototype one use case** - Try config discovery with search paths
3. **Measure impact** - Does it actually improve debugging?
4. **Document patterns** - Add to error-handling-guide.md
5. **Gradual rollout** - Start with CLI, then API, then core validation

---

## References

- [Effect Cause Documentation](https://effect.website/docs/data-types/cause/)
- [DarwinKit Error Handling Guide](./error-handling-guide.md)
- [Effect Error Management Guide](https://effect.website/docs/error-management/error-management)
