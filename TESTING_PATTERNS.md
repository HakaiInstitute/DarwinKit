# Testing Patterns Guide

This guide documents data-driven testing patterns used in DarwinKit to make tests more concise, maintainable, and easier to extend.

## Table of Contents

1. [Overview](#overview)
2. [Test Utilities](#test-utilities)
3. [Pattern 1: Full Consolidation](#pattern-1-full-consolidation)
4. [Pattern 2: Partial Consolidation with Callbacks](#pattern-2-partial-consolidation-with-callbacks)
5. [Pattern 3: Keep Separate](#pattern-3-keep-separate)
6. [Examples from the Codebase](#examples-from-the-codebase)
7. [Benefits](#benefits)
8. [When to Refactor](#when-to-refactor)

---

## Overview

**Data-driven testing** consolidates multiple similar test cases into a single test function that iterates over an array of test data. This approach:

- **Reduces boilerplate** by eliminating repeated setup/teardown code
- **Improves readability** by grouping related test cases together
- **Simplifies maintenance** - adding new test cases requires only adding to the array
- **Provides better test output** with hierarchical step organization

### Basic Structure

```typescript
type TestCase = {
  description: string;
  input: InputType;
  expected: ExpectedType;
};

const testCases: TestCase[] = [
  { description: "...", input: ..., expected: ... },
  // More cases
];

Deno.test("functionName", async (t) => {
  for (const testCase of testCases) {
    await t.step(testCase.description, () => {
      const result = functionUnderTest(testCase.input);
      assertEquals(result, testCase.expected);
    });
  }
});
```

---

## Test Utilities

DarwinKit provides standardized utilities for common testing operations. **Always use these utilities** instead of direct `Deno.*` calls for file operations in tests.

### Utility Modules

| Module | Location | Purpose |
|--------|----------|---------|
| **Core Testing** | `packages/core/src/testing/mod.ts` | CSV fixtures, temp directories, data generation |
| **Config Utils** | `test/helpers/config-utils.ts` | Workspace configs, JSON files (re-exports core utilities) |

### Available Utilities

#### Temp Directory Management

```typescript
import { withTestDirectory, createTestDirectory } from "./helpers/config-utils.ts";

// Recommended: Auto-cleanup with withTestDirectory
await withTestDirectory(async (tempDir) => {
  // Test code here
  // Directory is automatically deleted after test
});

// Alternative: Manual cleanup (avoid if possible)
const tempDir = await createTestDirectory();
try {
  // Test code here
} finally {
  await Deno.remove(tempDir, { recursive: true });
}
```

#### CSV File Writing

```typescript
import { writeCsvFile, writeCsvFileWithHeaders, toCsvString } from "./helpers/config-utils.ts";

// Write CSV from object array (preferred)
const csvPath = await writeCsvFile(tempDir, "events", [
  { eventID: "E1", country: "Canada", decimalLatitude: "49.5" },
  { eventID: "E2", country: "USA", decimalLatitude: "38.9" },
]);

// Write CSV with explicit headers (for empty files or custom headers)
const emptyPath = await writeCsvFileWithHeaders(tempDir, "empty", ["id", "name"]);

// Convert to CSV string without writing to file
const csvString = toCsvString([{ id: "1", name: "Test" }]);
```

#### JSON and Config File Writing

```typescript
import { writeJsonFile, writeWorkspaceConfig, createTestConfig } from "./helpers/config-utils.ts";

// Write any JSON content (valid objects or invalid strings for error testing)
await writeJsonFile(tempDir, "config.json", { key: "value" });
await writeJsonFile(tempDir, "invalid.json", "{ invalid json }");  // For error testing

// Write a full WorkspaceConfig to darwinkit.json
await writeWorkspaceConfig(tempDir, myWorkspaceConfig);

// Create a test config with defaults (for ConfigWithValidation)
const { config, configPath } = await createTestConfig(tempDir, {
  name: "My Test",
  validation: {
    datasets: [{ name: "test", spec: "dwc-event", path: "./test.csv", fieldMappings: [] }],
    nullValues: [""],
    failFast: false,
    outputDir: "./output",
  },
});
```

#### CSV Reading and Parsing

```typescript
import { readCsvFile, parseCsvString } from "./helpers/config-utils.ts";

// Read CSV file into objects
const data = await readCsvFile<{ eventID: string; country: string }>(csvPath);

// Parse CSV string into objects
const parsed = parseCsvString<{ id: string }>("id,name\n1,Test");
```

#### Test Data Generation

```typescript
import { generateTestData, createCsvFixture } from "./helpers/config-utils.ts";

// Generate large datasets for performance testing
const largeData = generateTestData(1000, (i) => ({
  id: String(i),
  value: i * 100,
  name: `Item ${i}`,
}));

// Create a fixture with metadata
const fixture = await createCsvFixture(tempDir, "events", testData);
// fixture.filePath, fixture.data, fixture.rowCount
```

### Before/After Examples

#### Example 1: Temp Directory with Manual Cleanup → Auto-Cleanup

**Before (avoid):**
```typescript
Deno.test("my test", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "my_test_" });
  try {
    // test code
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});
```

**After (preferred):**
```typescript
Deno.test("my test", async () => {
  await withTestDirectory(async (tempDir) => {
    // test code - auto cleanup
  });
});
```

#### Example 2: Inline CSV String → Object Array

**Before (avoid):**
```typescript
await Deno.writeTextFile(
  join(tempDir, "data.csv"),
  "name,age,city\nAlice,30,New York\nBob,25,London",
);
```

**After (preferred):**
```typescript
await writeCsvFile(tempDir, "data", [
  { name: "Alice", age: "30", city: "New York" },
  { name: "Bob", age: "25", city: "London" },
]);
```

#### Example 3: Direct Config Writing → Utility Function

**Before (avoid):**
```typescript
await Deno.writeTextFile(
  join(tempDir, "darwinkit.json"),
  JSON.stringify(config, null, 2),
);
```

**After (preferred):**
```typescript
await writeWorkspaceConfig(tempDir, config);
// Or for ConfigWithValidation with defaults:
await createTestConfig(tempDir, { name: "Test", validation: { ... } });
```

### Why Use These Utilities?

1. **Consistency** - All tests use the same patterns
2. **Auto-cleanup** - `withTestDirectory` ensures cleanup even on test failure
3. **Type safety** - Object arrays for CSV data catch typos at compile time
4. **Readability** - Object syntax is more readable than CSV strings
5. **Maintainability** - Changes to patterns only need updating in one place
6. **Centralized logic** - CSV serialization, temp dir prefixes, etc. in one place

---

## Pattern 1: Full Consolidation

**Use for:** Pure unit tests where all test cases share identical structure and assertions.

### Characteristics
- All tests call the same function
- All tests use the same assertions
- Input and expected output are the primary variables
- No complex setup or teardown

### Example: String Utility Tests

```typescript
// packages/core/src/utils/string-utils.test.ts

type LevenshteinDistanceTestCase = {
  description: string;
  string1: string;
  string2: string;
  expected: number;
};

const levenshteinDistanceTestCases: LevenshteinDistanceTestCase[] = [
  // Exact matches
  {
    description: "exact match: empty strings",
    string1: "",
    string2: "",
    expected: 0,
  },
  {
    description: "exact match: single character",
    string1: "a",
    string2: "a",
    expected: 0,
  },

  // Single character operations - Insertion
  {
    description: "insertion: append character",
    string1: "cat",
    string2: "cats",
    expected: 1,
  },

  // Case sensitivity
  {
    description: "case sensitive: first letter",
    string1: "Event",
    string2: "event",
    expected: 1,
  },
];

Deno.test("levenshteinDistance", async (t) => {
  for (const testCase of levenshteinDistanceTestCases) {
    await t.step(testCase.description, () => {
      const result = levenshteinDistance(testCase.string1, testCase.string2);
      assertEquals(result, testCase.expected);
    });
  }
});
```

**Before refactoring:** 5 separate `Deno.test()` calls, ~52 lines
**After refactoring:** 1 test with 19 steps, ~159 lines (but better organized)

### Benefits
- Adding a new test case: **5 lines** instead of entire test function
- All test cases visible at a glance
- Clear categorical organization with comments

---

## Pattern 2: Partial Consolidation with Callbacks

**Use for:** Integration tests where setup is identical but verification logic varies per test case.

### Characteristics
- Shared async setup/teardown (e.g., `withTestConnection`, `withTempDir`)
- Different verification logic per test case
- Each test case can have unique assertions
- Use callback functions for custom verification

### Example: CSV Import Tests

```typescript
// packages/core/src/validation/database/csv-import.test.ts

type BasicImportTestCase = {
  description: string;
  csvContent: string;
  tableName: string;
  nullStrings: string;
  expectedRowCount: number;
  verify: (rows: Array<Record<string, unknown>>) => void;  // Callback for custom assertions
};

const basicImportTestCases: BasicImportTestCase[] = [
  {
    description: "basic import with row numbers",
    csvContent: "id,name,value\n1,Alice,100\n2,Bob,200\n3,Charlie,300",
    tableName: "test_table",
    nullStrings: "'NA'",
    expectedRowCount: 3,
    verify: (rows) => {
      // Custom verification logic
      assertEquals(Number(rows[0]._row_number), 1);
      assertEquals(Number(rows[1]._row_number), 2);
      assertEquals(Number(rows[2]._row_number), 3);
      assertEquals(rows[0].name, "Alice");
      assertEquals(rows[1].name, "Bob");
      assertEquals(rows[2].name, "Charlie");
    },
  },
  {
    description: "null value handling",
    csvContent: "id,name,status\n1,Alice,active\n2,Bob,NA\n3,Charlie,N/A\n4,David,",
    tableName: "test_nulls",
    nullStrings: "'NA', 'N/A', ''",
    expectedRowCount: 4,
    verify: (rows) => {
      // Different verification logic
      assertEquals(rows[0].status, "active");
      assertEquals(rows[1].status, null);
      assertEquals(rows[2].status, null);
      assertEquals(rows[3].status, null);
    },
  },
];

Deno.test("importCsvToWorkspace - basic functionality", async (t) => {
  for (const testCase of basicImportTestCases) {
    await t.step(testCase.description, async () => {
      await withTempDir(async (tempDir) => {
        await withTestConnection(async (connection) => {
          // Shared setup
          const csvPath = join(tempDir, `${testCase.tableName}.csv`);
          await Deno.writeTextFile(csvPath, testCase.csvContent);

          await Effect.runPromise(
            importCsvToWorkspace(
              connection,
              testCase.tableName,
              csvPath,
              testCase.nullStrings,
              true,
            ),
          );

          // Shared assertions
          const countResult = await connection.runAndReadAll(
            `SELECT COUNT(*) as count FROM ${testCase.tableName}`,
          );
          assertEquals(
            Number(countResult.getRowObjects()[0].count),
            testCase.expectedRowCount,
          );

          // Custom verification per test case
          if (testCase.expectedRowCount > 0) {
            const result = await connection.runAndReadAll(
              `SELECT * FROM ${testCase.tableName} ORDER BY _row_number`,
            );
            testCase.verify(result.getRowObjects());
          }
        });
      });
    });
  }
});
```

**Before refactoring:** 11 separate tests, ~302 lines
**After refactoring:** 5 tests (1 with 6 steps + 4 standalone), ~273 lines

### Key Innovation: Callback-Based Verification

The `verify` function allows each test case to have unique assertion logic while sharing setup/teardown:

```typescript
type TestCaseWithCallback = {
  // ... other fields
  verify: (result: ResultType) => void;
};
```

This pattern works well when:
- Test setup is identical (creating CSV files, database connections)
- Assertions vary significantly per test case
- You want to avoid duplicating complex setup code

---

## Pattern 3: Keep Separate

**Don't consolidate** when tests have unique characteristics that make consolidation impractical.

### When to Keep Tests Separate

1. **Unique Setup Requirements**
   - Tests that need different initialization
   - Tests with complex multi-step setup

2. **Sequential Dependencies**
   - Tests that perform operations in a specific order
   - Tests that modify state and check results

3. **Dynamic Data Generation**
   - Tests that generate large datasets (e.g., 1000 rows)
   - Tests where data generation logic is part of what's being tested

4. **Complex Error Scenarios**
   - Tests using special assertion helpers (`assertEffectFails`)
   - Tests checking multiple error conditions

5. **Integration Tests with Side Effects**
   - Tests that check file system state
   - Tests that verify logs or warnings
   - Tests with significant environmental setup

### Example: Keep Separate

```typescript
// Large file test - dynamic data generation
Deno.test("importCsvToWorkspace - handles large CSV files", async () => {
  await withTempDir(async (tempDir) => {
    await withTestConnection(async (connection) => {
      const csvPath = join(tempDir, "large.csv");

      // Generate CSV with 1000 rows (part of test logic)
      const lines = ["id,value"];
      for (let i = 1; i <= 1000; i++) {
        lines.push(`${i},${i * 100}`);
      }
      await Deno.writeTextFile(csvPath, lines.join("\n"));

      await Effect.runPromise(
        importCsvToWorkspace(connection, "test_large", csvPath, "'NA'", true),
      );

      const result = await connection.runAndReadAll(
        "SELECT COUNT(*) as count, MIN(_row_number) as min_row, MAX(_row_number) as max_row FROM test_large",
      );

      const stats = result.getRowObjects()[0];
      assertEquals(Number(stats.count), 1000);
      assertEquals(Number(stats.min_row), 1);
      assertEquals(Number(stats.max_row), 1000);
    });
  });
});

// Error handling test - uses special assertion helper
Deno.test("importCsvToWorkspace - fails with nonexistent file", async () => {
  await withTestConnection(async (connection) => {
    await assertEffectFails(
      importCsvToWorkspace(
        connection,
        "test_fail",
        "/nonexistent/path/file.csv",
        "'NA'",
        true,
      ),
      WorkspaceImportError,
    );
  });
});
```

---

## Examples from the Codebase

### Example 1: Simple Enum Mapping (Full Consolidation)

```typescript
// packages/domain/src/types/validation-violation.test.ts

type EnforcementToSeverityTestCase = {
  description: string;
  input: EnforcementLevel;
  expected: ErrorSeverity;
};

const enforcementToSeverityTestCases: EnforcementToSeverityTestCase[] = [
  {
    description: "maps required to ERROR",
    input: "required",
    expected: ErrorSeverity.ERROR,
  },
  {
    description: "maps recommended to WARNING",
    input: "recommended",
    expected: ErrorSeverity.WARNING,
  },
  {
    description: "maps optional to INFO",
    input: "optional",
    expected: ErrorSeverity.INFO,
  },
];

Deno.test("enforcementToSeverity", async (t) => {
  for (const testCase of enforcementToSeverityTestCases) {
    await t.step(testCase.description, () => {
      const result = enforcementToSeverity(testCase.input);
      assertEquals(result, testCase.expected);
    });
  }
});
```

**Simplest form:** Input → Function → Expected output

---

### Example 2: Profile Resolution (Full Consolidation with Flexible Assertions)

```typescript
// packages/domain/src/specs/profiles/registry.test.ts

type ProfileResolutionTestCase = {
  description: string;
  dataset: DatasetConfig;
  expected: {
    id?: string;
    name?: string;
    isUndefined?: boolean;
  };
};

const profileResolutionTestCases: ProfileResolutionTestCase[] = [
  {
    description: "resolves from explicit profile",
    dataset: {
      name: "events",
      spec: "dwc-event",
      path: "./test.csv",
      profile: "obis-event",
      fieldMappings: [],
    },
    expected: {
      id: "obis-event",
      name: "OBIS Event Core",
    },
  },
  {
    description: "returns undefined for invalid spec",
    dataset: {
      name: "unknown",
      spec: "invalid-spec",
      path: "./test.csv",
      fieldMappings: [],
    },
    expected: {
      isUndefined: true,
    },
  },
];

Deno.test("resolveDatasetProfile", async (t) => {
  for (const testCase of profileResolutionTestCases) {
    await t.step(testCase.description, () => {
      const profile = resolveDatasetProfile(testCase.dataset);

      if (testCase.expected.isUndefined) {
        assertEquals(profile, undefined);
      } else {
        if (testCase.expected.id !== undefined) {
          assertEquals(profile?.id, testCase.expected.id);
        }
        if (testCase.expected.name !== undefined) {
          assertEquals(profile?.name, testCase.expected.name);
        }
      }
    });
  }
});
```

**Flexible assertions:** Use optional fields in `expected` to check different aspects

---

### Example 3: Database Schema Tests (Partial Consolidation)

```typescript
// packages/core/src/validation/database/schema-builder.test.ts

type ProfileTableCreationTestCase = {
  description: string;
  datasetName: string;
  spec: string;
  expectedTableName: string;
  expectedIdField: string;
};

const profileTableCreationTestCases: ProfileTableCreationTestCase[] = [
  {
    description: "creates table for Event profile",
    datasetName: "test_dataset",
    spec: "dwc-event",
    expectedTableName: "event",
    expectedIdField: "eventID",
  },
  {
    description: "creates table for Occurrence profile",
    datasetName: "occurrences",
    spec: "dwc-occurrence",
    expectedTableName: "occurrence",
    expectedIdField: "occurrenceID",
  },
  {
    description: "creates table for Taxon profile",
    datasetName: "taxa",
    spec: "dwc-taxon",
    expectedTableName: "taxon",
    expectedIdField: "taxonID",
  },
];

Deno.test("importSchemaToWorkspace - profile-specific tables", async (t) => {
  for (const testCase of profileTableCreationTestCases) {
    await t.step(testCase.description, async () => {
      await withTestConnection(async (connection) => {
        const dataset = {
          name: testCase.datasetName,
          spec: testCase.spec,
        };

        await Effect.runPromise(
          importSchemaToWorkspace(connection, dataset, [dataset]),
        );

        // Verify table was created
        const tableResult = await connection.runAndReadAll(
          `SELECT table_name FROM information_schema.tables WHERE table_name = '${testCase.expectedTableName}'`,
        );
        assertEquals(tableResult.getRowObjects().length, 1);

        // Verify ID field exists
        const columnResult = await connection.runAndReadAll(
          `SELECT column_name FROM information_schema.columns WHERE table_name = '${testCase.expectedTableName}'`,
        );
        const columnNames = columnResult.getRowObjects().map((r) => r.column_name);
        assertExists(columnNames.find((name: unknown) => name === testCase.expectedIdField));

        // Verify _row_number column exists
        assertExists(columnNames.find((name: unknown) => name === "_row_number"));
      });
    });
  }
});
```

**Integration pattern:** Consolidate similar database setup tests, keep complex scenarios separate

---

## Benefits

### 1. Reduced Boilerplate

**Before:**
```typescript
Deno.test("test case 1", () => { /* setup, execute, assert */ });
Deno.test("test case 2", () => { /* setup, execute, assert */ });
Deno.test("test case 3", () => { /* setup, execute, assert */ });
```

**After:**
```typescript
const testCases = [
  { description: "test case 1", input: ..., expected: ... },
  { description: "test case 2", input: ..., expected: ... },
  { description: "test case 3", input: ..., expected: ... },
];

Deno.test("functionName", async (t) => {
  for (const testCase of testCases) {
    await t.step(testCase.description, () => {
      // Single implementation
    });
  }
});
```

### 2. Easier to Add Test Cases

Adding a new test case:
- **Before:** Write entire test function (~10-20 lines)
- **After:** Add object to array (~5 lines)

### 3. Better Test Organization

Hierarchical test output:
```
functionName ...
  test case 1 ... ok
  test case 2 ... ok
  test case 3 ... ok
functionName ... ok (3 steps)
```

### 4. Self-Documenting Test Coverage

Test cases in an array make it easy to:
- See all covered scenarios at a glance
- Identify gaps in test coverage
- Understand function behavior from test data

### 5. Type Safety

TypeScript enforces consistent structure:
```typescript
type TestCase = {
  description: string;
  input: InputType;
  expected: ExpectedType;
};

const testCases: TestCase[] = [
  // TypeScript ensures all required fields are present
  // and types match expectations
];
```

---

## When to Refactor

### Good Candidates for Refactoring

✅ **Multiple tests calling the same function with different inputs**
```typescript
// BEFORE
Deno.test("handles empty string", () => { /* ... */ });
Deno.test("handles single character", () => { /* ... */ });
Deno.test("handles word", () => { /* ... */ });

// AFTER: Consolidate into data-driven test
```

✅ **Tests with identical structure but different data**
```typescript
// BEFORE
Deno.test("validates Event profile", () => { /* identical structure */ });
Deno.test("validates Occurrence profile", () => { /* identical structure */ });
Deno.test("validates Taxon profile", () => { /* identical structure */ });

// AFTER: Consolidate with array of profile configs
```

✅ **Integration tests sharing complex setup**
```typescript
// BEFORE: Each test has withTempDir + withTestConnection setup
Deno.test("test 1", async () => {
  await withTempDir(async (tempDir) => {
    await withTestConnection(async (connection) => { /* ... */ });
  });
});

// AFTER: Share setup, vary test data
```

### Poor Candidates for Refactoring

❌ **Tests with unique setup requirements**
```typescript
// Keep separate - each has different setup
Deno.test("large file test", () => { /* generates 1000 rows */ });
Deno.test("error test", () => { /* uses assertEffectFails */ });
```

❌ **Tests with complex multi-step logic**
```typescript
// Keep separate - sequential operations
Deno.test("drop and recreate table", () => {
  // Create table
  // Drop table
  // Recreate table
  // Verify state
});
```

❌ **Tests that are already clear and concise**
```typescript
// Keep as-is - already simple
Deno.test("CLI runs and displays help", async () => {
  const process = new Deno.Command(/* ... */);
  const { stdout } = await process.output();
  assertStringIncludes(output, "darwinkit");
});
```

---

## Refactoring Process

### Step 1: Identify Similar Tests

Look for tests that:
- Call the same function
- Have similar assertion patterns
- Differ primarily in input data

### Step 2: Create Test Case Type

```typescript
type TestCase = {
  description: string;
  // Add fields for inputs
  // Add fields for expected outputs
  // Optional: Add verify callback for custom assertions
};
```

### Step 3: Extract Test Data

Move test data into an array:
```typescript
const testCases: TestCase[] = [
  { description: "...", input: ..., expected: ... },
  // More cases
];
```

### Step 4: Implement Single Test

```typescript
Deno.test("functionName", async (t) => {
  for (const testCase of testCases) {
    await t.step(testCase.description, () => {
      // Implementation
    });
  }
});
```

### Step 5: Verify Tests Pass

Run tests to ensure refactoring didn't break anything:
```bash
deno test path/to/test-file.test.ts
```

---

## Summary

| Pattern | Use When | Example |
|---------|----------|---------|
| **Full Consolidation** | Pure unit tests, identical assertions | `levenshteinDistance`, `enforcementToSeverity` |
| **Partial Consolidation** | Integration tests, shared setup, varied assertions | `csv-import`, `schema-builder` |
| **Keep Separate** | Unique setup, complex scenarios, error handling | Large file tests, sequential operations |

**Key Takeaway:** Data-driven testing reduces boilerplate and improves maintainability, but should only be applied when it genuinely simplifies the code. When in doubt, start with Pattern 1 or 2 for similar tests, and keep complex or unique tests separate.

---

## Additional Resources

- See `packages/core/src/validation/utils.test.ts` for advanced examples with multiple test case arrays
- See `packages/core/src/validation/database/csv-import.test.ts` for callback-based verification pattern
- See `packages/domain/src/specs/profiles/registry.test.ts` for flexible expected value patterns
