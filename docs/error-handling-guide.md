# Error Handling Guide for DarwinKit

## Overview

DarwinKit uses Effect's two-error-types model combined with Data.TaggedError for type-safe error handling:

- **Expected errors (Effect.fail)** - Recoverable errors that are part of normal program flow
- **Unexpected errors/defects (Effect.die/orDie)** - Unrecoverable errors indicating system failures or programming bugs
- **Tagged errors (Data.TaggedError)** - Type-safe error classes with pattern matching support

## Quick Reference

### Key Conventions

| Pattern                                     | When to Use                      | Example                                                              |
| ------------------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| `Data.TaggedError("Name")`                  | Define typed error classes       | `class CsvReadError extends Data.TaggedError("CsvReadError")<{...}>` |
| `Effect.fail(new MyError(...))`             | User errors, validation failures | File not found, invalid config                                       |
| `Effect.tryPromise(...).pipe(Effect.orDie)` | Infrastructure operations        | DB connection, system queries                                        |
| `Effect.catchTag("ErrorName", ...)`         | Handle specific error type       | Catch only CsvReadError                                              |
| `Effect.catchTags({...})`                   | Handle multiple error types      | Pattern match on error tag                                           |
| `Effect.acquireRelease(acquire, release)`   | Resource management              | DB connections, file handles                                         |
| `Effect.scoped(...)`                        | Scoped resource usage            | Automatic cleanup on exit                                            |
| `createTaggedFormatter<Union>({...})`       | Type-safe error formatting       | Format errors by tag                                                 |

### Decision Tree

```
Is this error caused by user input/config?
├─ YES → Use Effect.fail with Tagged Error
│         Include helpful context (suggestions, valid values)
│
└─ NO → Is this infrastructure/system operation?
    ├─ YES → Use Effect.orDie (connection, schema queries, DDL)
    │
    └─ NO → Is this data we generated ourselves?
        ├─ YES → Use Effect.orDie (parsing our own JSON)
        │
        └─ NO → Can the user fix this?
            ├─ YES → Use Effect.fail
            └─ NO → Use Effect.orDie
```

---

## Effect Error Types

### Expected Errors (Effect.fail)

**Use for:** Anticipated errors that are part of the domain and can be recovered from.

**Characteristics:**

- Tracked in the Effect type signature: `Effect<Result, ExpectedError, Requirements>`
- Can be caught with `Effect.catchAll`, `Effect.catchTag`, or `Effect.catchTags`
- Part of the API contract - callers should handle these
- Represent business logic failures, not programming errors

**When to use in DarwinKit:**

```typescript
Effect.fail(new SomeError({ ... }))
// or
Effect.tryPromise({
  try: () => someOperation(),
  catch: (error) => new SomeError({ ... })
})
```

### Tagged Errors (Data.TaggedError)

**Use for:** Creating type-safe error classes with automatic tag properties for pattern matching.

**Characteristics:**

- Extends `Data.TaggedError` with a unique tag name
- Automatically includes a `_tag` property for type discrimination
- Works seamlessly with `Effect.catchTag` and `Effect.catchTags`
- Provides proper equality checking and serialization via Data
- Supports union types for exhaustive error handling

**Pattern:**

```typescript
import * as Data from "effect/Data";

// Define tagged errors
export class CsvReadError extends Data.TaggedError("CsvReadError")<{
  readonly message: string;
  readonly csvPath: string;
  readonly fieldName?: string;
  readonly suggestions?: readonly string[];
}> {}

export class ConfigNotFoundError extends Data.TaggedError("ConfigNotFoundError")<{
  readonly message: string;
  readonly searchDir: string;
  readonly searchedPaths: readonly string[];
}> {
  readonly code = ErrorCode.FILE_NOT_FOUND;
}

// Union type for all config errors
export type ConfigError = ConfigNotFoundError | ConfigParseError | ConfigValidationError;
```

**Benefits over Data.TaggedClass:**

- Cleaner syntax (no separate base class needed)
- Better integration with Effect's error handling
- Automatic type inference for catchTag handlers
- Simpler error class definitions

### Unexpected Errors / Defects (Effect.die)

**Use for:** Programming errors, system failures, or truly exceptional conditions.

**Characteristics:**

- NOT tracked in the type signature
- Can only be caught with `Effect.catchAllDefect`
- Indicate bugs or system problems that need fixing
- Should generally crash the program or be logged for investigation

**When to use in DarwinKit:**

```typescript
Effect.die(new Error("Assertion failed: ..."));
// or
Effect.tryPromise(() => someOperation()).pipe(Effect.orDie);
```

---

## Decision Framework for DarwinKit

### Expected Errors (Use Effect.fail)

| Scenario                                           | Error Type                                  | Rationale                                        |
| -------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| **User-provided file not found**                   | `ParseError` with `FILE_NOT_FOUND`          | Users can provide wrong paths - this is expected |
| **CSV validation failures**                        | `ConfigurationParseError`                   | Invalid user data is anticipated                 |
| **Type conversion failures during validation**     | `ConfigurationParseError`                   | User data may not match expected types           |
| **Required field missing from CSV**                | `WorkspaceValidationError`                  | User configuration error                         |
| **Darwin Core vocabulary violations**              | `WorkspaceValidationError`                  | Data quality issues are expected                 |
| **Cross-dataset referential integrity violations** | `WorkspaceValidationError`                  | Expected in real-world datasets                  |
| **Invalid field mappings in config**               | `WorkspaceValidationError`                  | User configuration error                         |
| **Workspace not found**                            | `WorkspaceError` with `WORKSPACE_NOT_FOUND` | User may request non-existent workspace          |
| **Controlled vocabulary mismatches**               | Validation result (not error)               | Data quality issue, not a failure                |

### Unexpected Errors / Defects (Use Effect.die)

| Scenario                                                   | Error Type | Rationale                                   |
| ---------------------------------------------------------- | ---------- | ------------------------------------------- |
| **DuckDB connection failure**                              | Defect     | System problem - user cannot recover        |
| **DuckDB schema query failure**                            | Defect     | `information_schema` should always work     |
| **File system permission errors on workspace directories** | Defect     | Our directories should always be writable   |
| **JSON.parse failure on self-generated data**              | Defect     | We control the format - failure is a bug    |
| **Null pointer errors on required data**                   | Defect     | Programming error - data should exist       |
| **Row count query failure**                                | Defect     | Basic SQL should always work                |
| **Schema inference internal errors**                       | Defect     | DuckDB internal failure                     |
| **Invalid workspace data structure from our own files**    | Defect     | We control the format - corruption is a bug |

---

## Examples from DarwinKit Codebase

### Example 1: File Not Found (Expected Error)

**Scenario:** User provides path to CSV file that doesn't exist.

**Current (Correct):**

```typescript
// packages/core/src/parsing/csv-parser.ts
yield * _(
  Effect.tryPromise({
    try: () => fs.access(filePath),
    catch: () =>
      new ParseError({
        message: `File not found: ${filePath}`,
        filePath,
        code: ErrorCode.FILE_NOT_FOUND,
      }),
  }),
);
```

**Why:** User-provided paths are external input. Missing files are expected and recoverable (user can fix the path).

---

### Example 2: Database Connection Failure (Defect)

**Scenario:** DuckDB.create() fails to establish a connection.

**Current (Correct):**

```typescript
// packages/core/src/validation/csv-row-reader.ts
// Connection creation is infrastructure - use orDie
const connection = yield * _(
  Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
);
```

**Why:** Database connection failures indicate system problems (missing libraries, corrupted installation, etc.). Users cannot fix this - it requires developer intervention. See `docs/effect-ordie-audit.md` for comprehensive audit of all `orDie` usages.

---

### Example 3: CSV Validation Failures (Expected Error)

**Scenario:** User's CSV data fails type conversion validation.

**Current (Correct):**

```typescript
// packages/core/src/parsing/configurable-csv-parser.ts (Line 146)
if (totalFailures > 0) {
  return yield * _(
    Effect.fail(
      new ConfigurationParseError({
        message: `Type conversion failures detected: ${failureMessages.join(", ")}`,
        filePath,
        code: ErrorCode.PARSE_ERROR,
      }),
    ),
  );
}
```

**Why:** User data quality issues are expected. This is normal program flow for validation.

---

### Example 4: Schema Query Failure (Defect)

**Scenario:** Query to `information_schema.columns` fails.

**Current (Correct):**

```typescript
// packages/core/src/parsing/configurable-csv-parser.ts
// Querying information_schema is infrastructure - should always work (defect if it fails)
return Effect.tryPromise(async () => {
  const result = await connection.runAndReadAll(schemaQuery);
  return result.getRowObjects();
}).pipe(Effect.orDie);
```

**Why:** Querying DuckDB's internal schema should always succeed. If it fails, it's a system problem.

---

### Example 5: Tagged Error for CSV Field Reading

**Scenario:** User references a field name that doesn't exist in the CSV, with helpful suggestions.

**Current (Correct):**

```typescript
// packages/core/src/validation/csv-row-reader.ts

// Define tagged error class
export class CsvReadError extends Data.TaggedError("CsvReadError")<{
  readonly message: string;
  readonly csvPath: string;
  readonly fieldName?: string;
  readonly suggestions?: readonly string[];
}> {}

// Validate field exists before reading
function validateFieldExists(
  connection: typeof DuckDB.prototype,
  csvPath: string,
  fieldName: string,
): Effect.Effect<void, CsvReadError> {
  return Effect.gen(function* (_) {
    const columns = yield* _(getTableColumns(connection, csvPath));

    if (!columns.includes(fieldName)) {
      // Find close matches using fuzzy matching
      const suggestions = findSuggestions(fieldName, columns, {
        maxDistance: 2,
        maxSuggestions: 3,
      });

      return yield* _(
        Effect.fail(
          new CsvReadError({
            message: suggestions.length > 0
              ? `Field '${fieldName}' not found. Did you mean: ${suggestions.join(", ")}?`
              : `Field '${fieldName}' not found in CSV.`,
            csvPath,
            fieldName,
            suggestions,
          }),
        ),
      );
    }
  });
}
```

**Why:** User-provided field names may contain typos. This is expected user error, so we use `Effect.fail` with a helpful error including suggestions. The tagged error makes it easy to handle this specific error type with `Effect.catchTag("CsvReadError", ...)`.

---

## Error Pattern Matching with catchTag/catchTags

Effect provides type-safe error handling using the `_tag` property from `Data.TaggedError`.

### Pattern: Handling Multiple Error Types

```typescript
import * as Effect from "effect/Effect";

// Using catchTags for multiple error types
const result = await Effect.runPromise(
  loadConfig(configPath).pipe(
    Effect.catchTags({
      ConfigNotFoundError: (error) => {
        // error is automatically typed as ConfigNotFoundError!
        console.error(`Config not found in ${error.searchDir}`);
        return Effect.succeed(createDefaultConfig());
      },
      ConfigParseError: (error) => {
        // error is automatically typed as ConfigParseError!
        console.error(`Parse error in ${error.configPath}: ${error.message}`);
        return Effect.fail(new FatalError({ message: "Cannot recover from parse error" }));
      },
      ConfigValidationError: (error) => {
        // error is automatically typed as ConfigValidationError!
        console.error(`Validation errors: ${error.validationErrors.join(", ")}`);
        return Effect.succeed(createDefaultConfig());
      },
    }),
  ),
);
```

### Pattern: Handling a Single Error Type

```typescript
// Using catchTag for a single error type
const csvData = await Effect.runPromise(
  readCsvFieldValue(connection, csvPath, rowNumber, fieldName).pipe(
    Effect.catchTag("CsvReadError", (error) => {
      // error is automatically typed as CsvReadError!
      if (error.suggestions && error.suggestions.length > 0) {
        console.error(`Did you mean: ${error.suggestions.join(", ")}?`);
      }
      return Effect.succeed(null); // Return default value
    }),
  ),
);
```

**Benefits:**

- Type-safe error handlers - TypeScript knows the exact error type in each handler
- Exhaustive checking - TypeScript ensures you handle all error cases
- Pattern matching similar to match/case in other languages
- No need for instanceof checks

---

## Resource Management with Effect.acquireRelease

Effect provides `acquireRelease` for guaranteed cleanup of resources, even when errors occur.

### Pattern: Database Connection Management

```typescript
import * as Effect from "effect/Effect";

class UniquenessValidator {
  /**
   * Create a managed workspace DuckDB connection resource
   *
   * Uses Effect.acquireRelease to guarantee connection cleanup even on errors.
   * The connection is automatically closed when the scope exits.
   */
  private createWorkspaceDbResource(workspaceId: string) {
    const workspacesDir = this.workspacesDir;

    // Acquire: Create and attach DuckDB connection
    const acquire = Effect.gen(function* (_) {
      const workspaceDir = join(workspacesDir, `workspace-${workspaceId}`);
      const duckdbPath = join(workspaceDir, "data.duckdb");

      // Connection creation is infrastructure - use orDie
      const connection = yield* _(
        Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
      );

      // Attach the database file
      yield* _(
        Effect.tryPromise(() => connection.runAndReadAll(`ATTACH '${duckdbPath}' AS workspace`))
          .pipe(Effect.orDie),
      );

      return { connection, workspaceConnection };
    });

    // Release: Close connection, ignoring errors
    const release = (
      resource: { connection: DuckDBConnection; workspaceConnection: WorkspaceConnection },
    ) =>
      Effect.sync(() => {
        try {
          resource.connection.closeSync();
        } catch {
          // Ignore close errors
        }
      });

    return Effect.acquireRelease(acquire, release);
  }

  /**
   * Validate uniqueness constraints using scoped resource
   */
  validateUniqueness(
    workspaceId: string,
    fieldMappings: ReadonlyArray<FieldMapping>,
  ): Effect.Effect<ReadonlyArray<UniquenessViolation>, UniquenessValidationError> {
    const workspaceDbResource = this.createWorkspaceDbResource(workspaceId);

    return Effect.scoped(
      Effect.gen(function* (_) {
        // Acquire workspace DuckDB connection (guaranteed cleanup)
        const { connection, workspaceConnection } = yield* _(workspaceDbResource);

        // Use the connection - cleanup happens automatically
        const violations = yield* _(performValidation(connection, fieldMappings));

        return violations;
      }),
    );
  }
}
```

**Benefits:**

- Guaranteed cleanup even on errors or interruptions
- No need for try-finally blocks
- Composable resource management
- Scoped lifecycle - resource released when scope exits

**Key Pattern:**

1. Define `acquire` effect to allocate resource
2. Define `release` function to clean up resource
3. Wrap usage in `Effect.scoped` to manage lifecycle
4. Resource automatically cleaned up when scope exits

---

## Error Formatting with createTaggedFormatter

Type-safe error formatting that leverages `Data.TaggedError`'s `_tag` property.

### Pattern: Domain-Specific Error Formatter

```typescript
import { createTaggedFormatter, prettyPrintCause } from "@dwkt/shared";

// Define error union type
export type ConfigError =
  | ConfigNotFoundError
  | ConfigParseError
  | ConfigValidationError
  | DatasetFileNotFoundError;

// Create type-safe formatter using tagged error pattern matching
const formatConfigError = createTaggedFormatter<ConfigError>({
  ConfigNotFoundError: (error) => {
    // error is automatically typed as ConfigNotFoundError!
    const pathsList = error.searchedPaths.map((p) => `  - ${p}`).join("\n");
    return `${error.message}\n\nSearched paths:\n${pathsList}\n\nSuggestion: Create 'darwinkit.json' in your project directory.`;
  },

  ConfigParseError: (error) => {
    // error is automatically typed as ConfigParseError!
    return `Failed to parse configuration file: ${error.configPath}\n\n${error.message}\n\nCause: ${error.cause?.message}`;
  },

  ConfigValidationError: (error) => {
    // error is automatically typed as ConfigValidationError!
    return `Configuration validation failed: ${error.configPath}\n\nValidation errors:\n${
      error.validationErrors.map((e) => `  - ${e}`).join("\n")
    }`;
  },

  DatasetFileNotFoundError: (error) => {
    // error is automatically typed as DatasetFileNotFoundError!
    return `Dataset file not found:\n  Dataset: ${error.datasetName}\n  Path: ${error.filePath}\n\nCheck that the path in darwinkit.json is correct.`;
  },
});

/**
 * Pretty print configuration errors using Effect's Cause
 */
export function prettyPrintConfigError(
  cause: Cause.Cause<ConfigError>,
): string {
  return prettyPrintCause(cause, formatConfigError);
}

// Usage in CLI
try {
  const config = await Effect.runPromise(loadConfig());
} catch (error) {
  if (error instanceof Cause.Cause) {
    console.error(prettyPrintConfigError(error));
  }
  Deno.exit(1);
}
```

**Benefits:**

- Type-safe formatting - TypeScript ensures exhaustive handling
- Automatic error type inference in each formatter
- Consistent error formatting across the application
- Separation of error formatting from error handling logic

**Key Functions:**

- `createTaggedFormatter<ErrorUnion>()` - Creates type-safe formatter using tag-based dispatch
- `prettyPrintCause()` - Handles Effect Cause structure (failures, defects, multiple errors)

---

## User-Friendly Error Messages with Suggestions

When user input doesn't match expected values, provide helpful suggestions using fuzzy matching.

### Pattern: Field Name Validation with Suggestions

```typescript
import { findSuggestions } from "../utils/string-utils.ts";

/**
 * Validate that a field exists in the CSV schema
 * Returns helpful error with suggestions if field not found
 */
function validateFieldExists(
  connection: typeof DuckDB.prototype,
  csvPath: string,
  fieldName: string,
): Effect.Effect<void, CsvReadError> {
  return Effect.gen(function* (_) {
    const columns = yield* _(getTableColumns(connection, csvPath));

    if (!columns.includes(fieldName)) {
      // Find close matches using fuzzy matching (Levenshtein distance)
      const suggestions = findSuggestions(fieldName, columns, {
        maxDistance: 2,
        maxSuggestions: 3,
      });

      return yield* _(
        Effect.fail(
          new CsvReadError({
            message: suggestions.length > 0
              ? `Field '${fieldName}' not found in CSV. Did you mean: ${suggestions.join(", ")}?`
              : `Field '${fieldName}' not found in CSV.`,
            csvPath,
            fieldName,
            availableFields: columns,
            suggestions,
          }),
        ),
      );
    }
  });
}
```

**Example Output:**

```
Field 'evntID' not found in CSV. Did you mean: eventID, eventType, eventDate?
```

**Benefits:**

- Helps users quickly identify typos
- Reduces frustration from configuration errors
- Uses Levenshtein distance for smart matching
- Configurable distance threshold and max suggestions

---

## Common Patterns

### Pattern 1: User Input Validation (Expected)

```typescript
// Validate user configuration
function validateConfig(
  config: unknown,
): Effect.Effect<ValidConfig, WorkspaceValidationError> {
  return Effect.gen(function* () {
    if (!isValidConfig(config)) {
      return yield* Effect.fail(
        new WorkspaceValidationError({
          message: "Invalid configuration format",
          code: ErrorCode.VALIDATION_FAILED,
        }),
      );
    }
    return config as ValidConfig;
  });
}
```

### Pattern 2: System Resource Access (Defect)

```typescript
// Connect to database
function connectToDatabase(): Effect.Effect<Connection, never> {
  return Effect.tryPromise(() => DuckDB.create()).pipe(
    Effect.orDie, // System failure
  );
}
```

### Pattern 3: Data Quality Issues (Expected)

```typescript
// Validate vocabulary values
function validateVocabulary(
  value: string,
  field: FieldDefinition,
): Effect.Effect<void, WorkspaceValidationError> {
  return Effect.gen(function* () {
    const isValid = yield* checkVocabulary(value, field.vocabulary);

    if (!isValid) {
      return yield* Effect.fail(
        new WorkspaceValidationError({
          message: `Invalid vocabulary value: ${value}`,
          code: ErrorCode.VALIDATION_FAILED,
        }),
      );
    }
  });
}
```

### Pattern 4: Internal Assertion (Defect)

```typescript
// Assert invariant
function processField(
  field: FieldSchema | undefined,
): Effect.Effect<ProcessedField, never> {
  if (!field) {
    return Effect.die(
      new Error("Assertion failed: field should always exist at this point"),
    );
  }

  return Effect.succeed(processFieldInternal(field));
}
```

---

## Migration Checklist

When refactoring existing error handling:

1. **Identify the error source**
   - [ ] Is this user input/data? → Expected error
   - [ ] Is this system resource? → Defect
   - [ ] Is this internal data we control? → Defect
   - [ ] Is this a programming assertion? → Defect

2. **Check recoverability**
   - [ ] Can the user fix this? → Expected error
   - [ ] Does this indicate a bug? → Defect
   - [ ] Is this a data quality issue? → Expected error
   - [ ] Is this a system failure? → Defect

3. **Update the code**
   - [ ] Use `Effect.fail()` for expected errors
   - [ ] Use `Effect.die()` or `Effect.orDie` for defects
   - [ ] Remove `throw new Error` inside Effect functions
   - [ ] Remove try-catch inside Effect.gen

4. **Update tests**
   - [ ] Expected errors: Test with `Effect.catchAll`
   - [ ] Defects: Test with `Effect.catchAllDefect`
   - [ ] Verify error messages are helpful

5. **Update type signatures**
   - [ ] Expected errors in error channel: `Effect<A, E, R>`
   - [ ] Defects only: `Effect<A, never, R>`

---

## Anti-Patterns to Avoid

### ❌ Don't: Try-catch inside Effect.gen

```typescript
// BAD
return Effect.gen(function* () {
  try {
    yield* Effect.tryPromise(() => someOperation());
  } catch (error) {
    return yield* Effect.fail(new SomeError({ ... }));
  }
});
```

**Why:** Effect already manages the error channel. Try-catch interferes with Effect's error handling.

### ❌ Don't: Throw inside Effect functions

```typescript
// BAD
function parse(data: unknown): Workspace {
  if (!data) {
    throw new Error("Invalid data"); // Escapes Effect's error channel
  }
  // ...
}
```

**Why:** Thrown errors bypass Effect's type system and error handling mechanisms.

### ❌ Don't: Treat system failures as expected errors

```typescript
// BAD
const connection = yield* Effect.tryPromise({
  try: () => DuckDB.create(),
  catch: (error) => new DatabaseError({ ... })  // Wrong!
});
```

**Why:** Users can't recover from database connection failures. This is a system defect.

### ❌ Don't: Treat user errors as defects

```typescript
// BAD
if (!fileExists(userProvidedPath)) {
  return Effect.die(new Error("File not found")); // Wrong!
}
```

**Why:** Users providing wrong paths is expected and recoverable.

---

## Testing Error Handling

### Test Expected Errors

```typescript
Deno.test("File not found is catchable", async () => {
  const result = await Effect.runPromise(
    parseFile("nonexistent.csv").pipe(
      Effect.catchAll((error) => Effect.succeed({ errorCaught: true, error })),
    ),
  );

  assertEquals(result.errorCaught, true);
  assertEquals(result.error.code, ErrorCode.FILE_NOT_FOUND);
});
```

### Test Defects

```typescript
Deno.test("Database connection failure is a defect", async () => {
  // Mock DuckDB to fail
  const mockDuckDB = {
    create: () => Promise.reject(new Error("Connection failed")),
  };

  let defectCaught = false;
  await Effect.runPromise(
    createConnection().pipe(
      Effect.catchAllDefect((defect) => {
        defectCaught = true;
        return Effect.succeed(null);
      }),
    ),
  );

  assertEquals(defectCaught, true);
});
```

---

## Questions to Ask

When encountering an error in the code, ask:

1. **Who caused this error?**
   - User → Expected error
   - System → Defect
   - Our code → Defect

2. **Can the user fix this?**
   - Yes → Expected error
   - No → Defect

3. **Is this normal program flow?**
   - Yes → Expected error
   - No → Defect

4. **Would this error indicate a bug?**
   - Yes → Defect
   - No → Expected error

5. **Should this error appear in API documentation?**
   - Yes → Expected error
   - No → Defect

---

## Best Practices Summary

### ✅ DO

1. **Use Data.TaggedError for all error classes**
   ```typescript
   export class MyError extends Data.TaggedError("MyError")<{
     readonly message: string;
     // ... other fields
   }> {}
   ```

2. **Always comment why you use orDie**
   ```typescript
   // Connection creation is infrastructure - use orDie
   const connection = yield * _(
     Effect.tryPromise(() => DuckDB.create()).pipe(Effect.orDie),
   );
   ```

3. **Provide helpful error messages with context**
   ```typescript
   new CsvReadError({
     message: `Field not found. Did you mean: ${suggestions.join(", ")}?`,
     csvPath,
     fieldName,
     suggestions,
   });
   ```

4. **Use Effect.catchTags for multiple error types**
   ```typescript
   effect.pipe(
     Effect.catchTags({
       ErrorTypeA: (error) => handleA(error),
       ErrorTypeB: (error) => handleB(error),
     }),
   );
   ```

5. **Use Effect.acquireRelease for resources**
   ```typescript
   const resource = Effect.acquireRelease(acquire, release);
   return Effect.scoped(Effect.gen(function* (_) {
     const conn = yield* _(resource);
     // Use connection - cleanup automatic
   }));
   ```

6. **Define error union types for domain boundaries**
   ```typescript
   export type ConfigError =
     | ConfigNotFoundError
     | ConfigParseError
     | ConfigValidationError;
   ```

### ❌ DON'T

1. **Don't use Data.TaggedClass** - Use `Data.TaggedError` instead
2. **Don't throw inside Effect functions** - Use `Effect.fail` or `Effect.die`
3. **Don't use try-catch in Effect.gen** - Use Effect's error handling
4. **Don't use orDie for user errors** - Only for infrastructure/system operations
5. **Don't use instanceof for error checking** - Use `Effect.catchTag` instead
6. **Don't forget cleanup** - Use `Effect.acquireRelease` for resources
7. **Don't create formatters without createTaggedFormatter** - Leverage type safety

### Migration Checklist

When refactoring error handling:

- [ ] Replace `Data.TaggedClass("Name")<Props>` with `Data.TaggedError("Name")<Props>`
- [ ] Define error union types for each domain module
- [ ] Create typed formatters using `createTaggedFormatter`
- [ ] Replace `instanceof` checks with `Effect.catchTag/catchTags`
- [ ] Use `Effect.acquireRelease` for resources instead of try-finally
- [ ] Add helpful context to error messages (suggestions, available values)
- [ ] Verify all `Effect.orDie` usage follows infrastructure pattern
- [ ] Add comments explaining why each error is expected or defect

---

## References

### Internal Documentation

- [`docs/effect-ordie-audit.md`](./effect-ordie-audit.md) - Comprehensive audit of all `Effect.orDie` usage
- [`docs/effect-scope-mechanism.md`](./effect-scope-mechanism.md) - Resource management patterns
- [`IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) - Staged refactoring plan
- [`CLAUDE.md`](../CLAUDE.md) - Project conventions

### Effect Documentation

- [Effect Error Management - Two Error Types](https://effect.website/docs/error-management/two-error-types/)
- [Effect Data Module](https://effect.website/docs/data-types/data/)
- [Effect Resource Management](https://effect.website/docs/resource-management/scope/)
- [Effect Schema](https://effect.website/docs/schema/introduction/)

### Example Code

- `packages/core/src/validation/csv-row-reader.ts` - Tagged errors with suggestions
- `packages/core/src/validation/uniqueness-validator.ts` - Effect.acquireRelease usage
- `packages/core/src/workspace/workspace-config-service.ts` - Tagged errors and formatter
- `packages/shared/src/utils/cause-formatter.ts` - createTaggedFormatter implementation
