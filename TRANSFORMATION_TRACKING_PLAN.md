# Transformation Tracking and Enhanced Validation Reporting

**Status**: Planning
**Created**: 2025-10-07
**Goal**: Implement transparent transformation tracking so validation errors reference both source CSV values and transformed values with full transformation chain context

## Problem Statement

Currently, DarwinKit validates data after DuckDB transformations, but errors only report the transformed values. This creates confusion:

```
❌ Error: "eventID cannot be NULL"
User's CSV: eventID column contains "NA"
Issue: User doesn't see NULL in their file
```

**Root cause**: Transformation chain is invisible to users
- CSV `"NA"` → DuckDB NULL (via `nullstr` config)
- CSV `"123.0"` → DuckDB `123` (type coercion)
- CSV `" value "` → DuckDB `"value"` (whitespace trimming)

## Design Principles

1. **Source CSV is authoritative** - Never modify the original file
2. **Transformations are explicit and documented** - Every change is tracked
3. **Errors reference source values** - Show what users see in their files
4. **Transformation chain is visible** - Explain the path from source to validated value
5. **Future-proof for explicit transformations** - Support user-defined transformation pipelines

## Architecture Overview

```
┌─────────────┐
│  Source CSV │ (immutable, authoritative)
└──────┬──────┘
       │
       ▼
┌──────────────────────┐
│  Validation Pipeline │
│                      │
│  1. Load to DuckDB   │──► TransformationLog: "null interpretation"
│  2. Type inference   │──► TransformationLog: "type coercion"
│  3. Validation       │──► Query both original + transformed
│  4. Error reporting  │──► Show both values + chain
└──────────────────────┘
       │
       ▼
┌─────────────────────────┐
│  Validation Report      │
│                         │
│  CSV Value: "NA"        │
│  Transformed: NULL      │
│  Chain: [nullstr]       │
│  Error: Required field  │
└─────────────────────────┘
```

## Implementation Stages

### Stage 1: Design Transformation Types ✅ (Complete)

**Goal**: Define TypeScript types for transformation tracking

**Types to create:**

```typescript
// packages/shared/src/types/transformation.ts

/**
 * Types of transformations that can be applied
 */
export type TransformationType =
  | "null_interpretation"    // nullstr config
  | "type_coercion"          // DuckDB automatic
  | "whitespace_trim"        // DuckDB automatic
  | "date_parsing"           // DuckDB automatic
  | "case_normalization"     // Future: user-defined
  | "value_mapping"          // Future: user-defined
  | "formula"                // Future: calculated fields
  | "concatenation"          // Future: combine fields
  | "split";                 // Future: split fields

/**
 * Single transformation in the chain
 */
export interface Transformation {
  readonly type: TransformationType;
  readonly description: string;
  readonly config?: Record<string, unknown>; // Transformation-specific config
}

/**
 * Complete chain of transformations applied to a value
 */
export interface TransformationChain {
  readonly sourceValue: string;           // Original CSV value
  readonly transformedValue: unknown;     // Final value after all transformations
  readonly transformations: ReadonlyArray<Transformation>;
}

/**
 * Validation violation with transformation context
 */
export interface TransformationAwareViolation {
  readonly rowNumber: number;
  readonly fieldName: string;
  readonly chain: TransformationChain;
  readonly errorMessage: string;
  readonly errorCode?: string;
}
```

**Success criteria:**
- [x] Types defined in `packages/shared/src/types/transformation.ts`
- [x] Types exported from `packages/shared/mod.ts`
- [x] Types documented with examples
- [x] No breaking changes to existing types

---

### Stage 2: Enhance Validation Error Types ✅ (Complete)

**Goal**: Update all validation error types to include transformation information

**Files to modify:**
- `packages/shared/src/types/workspace-validation.ts`

**Changes:**

```typescript
// Before
readonly violations: ReadonlyArray<{
  readonly rowNumber: number;
  readonly value: string;
  readonly suggestedValues?: ReadonlyArray<string>;
}>;

// After
readonly violations: ReadonlyArray<{
  readonly rowNumber: number;
  readonly csvValue: string;              // NEW: Original CSV value
  readonly transformedValue: unknown;     // NEW: Value after transformations
  readonly transformationChain?: TransformationChain; // NEW: Optional chain
  readonly errorMessage: string;          // Enhanced with context
  readonly suggestedValues?: ReadonlyArray<string>;
}>;
```

**All error types to update:**
1. `typeErrors.sampleFailures` - Add CSV value + transformation chain
2. `vocabularyErrors.violations` - Add CSV value + chain
3. `uniquenessViolations` - Add CSV value + chain
4. `constraintViolations.violations` - Add CSV value + chain
5. `CrossDatasetValidationResult.violations` - Add CSV value + chain

**Success criteria:**
- [x] All error types include `csvValue` and `transformedValue`
- [x] All error types include optional `transformationChain`
- [x] Backward compatibility maintained (optional fields)
- [x] Types compile without errors
- [x] Existing tests pass
- [x] Migration guide created

**Files modified:**
- `packages/shared/src/types/workspace-validation.ts` - Enhanced all error types
- `docs/transformation-types-migration.md` - Migration guide created

---

### Stage 3: Implement Dual-Value Querying (Next)

**Goal**: Modify validation queries to capture both original CSV values and DuckDB transformed values

**Approach**: Load CSV data twice into DuckDB
1. **Raw table** (`{dataset}_raw`): All columns as VARCHAR, no transformations
2. **Transformed table** (`{dataset}`): Normal DuckDB type inference + null handling

**Files to modify:**
- `packages/core/src/workspace/workspace-validator.ts` (createWorkspaceFromConfig)

**Implementation:**

```typescript
// Current: Single table load
const createTableQuery = `
  CREATE TABLE ${tableName} AS
  SELECT * FROM read_csv_auto('${filePath}', nullstr=[${nullStr}])
`;

// New: Dual table load
const createRawTableQuery = `
  CREATE TABLE ${tableName}_raw AS
  SELECT * FROM read_csv_auto('${filePath}', all_varchar=true)
`;

const createTransformedTableQuery = `
  CREATE TABLE ${tableName} AS
  SELECT * FROM read_csv_auto('${filePath}', nullstr=[${nullStr}])
`;
```

**Validation query pattern:**

```typescript
// Before: Only transformed value
const query = `
  SELECT row_number() OVER() as row_num, "${fieldName}"
  FROM ${tableName}
  WHERE "${fieldName}" NOT IN ('value1', 'value2')
`;

// After: Both values + comparison
const query = `
  SELECT
    row_number() OVER() as row_num,
    raw."${fieldName}" as csv_value,
    t."${fieldName}" as transformed_value
  FROM ${tableName} t
  JOIN ${tableName}_raw raw ON t.rowid = raw.rowid
  WHERE t."${fieldName}" NOT IN ('value1', 'value2')
`;
```

**Success criteria:**
- [ ] Both raw and transformed tables loaded for each dataset
- [ ] All validation queries return both `csv_value` and `transformed_value`
- [ ] Row correspondence maintained via `rowid`
- [ ] Memory impact acceptable (2x table storage)

---

### Stage 4: Build Transformation Chains

**Goal**: Track which transformations were applied to each value

**Approach**: Compare raw and transformed values to infer transformations

**Files to create:**
- `packages/core/src/validation/transformation-tracker.ts`

**Implementation:**

```typescript
import type { Transformation, TransformationChain } from "@dwkt/shared";

/**
 * Build transformation chain by comparing original and transformed values
 */
export function buildTransformationChain(
  csvValue: string,
  transformedValue: unknown,
  config: {
    nullValues: readonly string[];
    // Future: other transformation configs
  }
): TransformationChain {
  const transformations: Transformation[] = [];

  // Check for null interpretation
  if (transformedValue === null && config.nullValues.includes(csvValue)) {
    transformations.push({
      type: "null_interpretation",
      description: `Interpreted '${csvValue}' as NULL (configured null value)`,
      config: { nullValues: config.nullValues },
    });
  }

  // Check for type coercion
  if (typeof transformedValue === "number" && csvValue !== String(transformedValue)) {
    transformations.push({
      type: "type_coercion",
      description: `Coerced '${csvValue}' to number ${transformedValue}`,
    });
  }

  // Check for whitespace trimming
  if (typeof transformedValue === "string" && csvValue !== transformedValue) {
    if (csvValue.trim() === transformedValue) {
      transformations.push({
        type: "whitespace_trim",
        description: `Trimmed whitespace from '${csvValue}'`,
      });
    }
  }

  // Check for date parsing
  if (transformedValue instanceof Date || typeof transformedValue === "object") {
    // DuckDB might return date objects
    transformations.push({
      type: "date_parsing",
      description: `Parsed '${csvValue}' as date`,
    });
  }

  return {
    sourceValue: csvValue,
    transformedValue,
    transformations,
  };
}
```

**Success criteria:**
- [ ] Transformation tracker correctly identifies null interpretation
- [ ] Tracker identifies type coercion
- [ ] Tracker identifies whitespace trimming
- [ ] Tracker handles date parsing
- [ ] Tests verify all transformation detection

---

### Stage 5: Update Validation Functions

**Goal**: Modify all validation functions to use dual-value queries and build transformation chains

**Functions to update:**

1. **validateVocabulary** (`workspace-validator.ts:663`)
   ```typescript
   // Before
   SELECT row_number() OVER() as row_num, "${fieldName}" as value

   // After
   SELECT
     row_number() OVER() as row_num,
     raw."${fieldName}" as csv_value,
     t."${fieldName}" as transformed_value
   FROM ${tableName} t
   JOIN ${tableName}_raw raw ON t.rowid = raw.rowid
   ```

2. **validateUniqueness** (`workspace-validator.ts:749`)
   ```typescript
   // Similar pattern - join raw + transformed tables
   ```

3. **validateConstraint** (`workspace-validator.ts:600`)
   ```typescript
   // Add csv_value to results
   ```

4. **validateCrossDatasetRule** (`workspace-validator.ts:475`)
   ```typescript
   // Include raw values in foreign key violation reports
   ```

**Pattern for all functions:**

```typescript
const result = yield* _(...);
const rows = result.getRowObjects();

const violations = rows.map((row) => {
  const chain = buildTransformationChain(
    String(row.csv_value),
    row.transformed_value,
    { nullValues: config.validation.nullValues }
  );

  return {
    rowNumber: Number(row.row_num),
    csvValue: String(row.csv_value),
    transformedValue: row.transformed_value,
    transformationChain: chain,
    errorMessage: `Enhanced error message with context`,
  };
});
```

**Success criteria:**
- [ ] All validation functions return transformation-aware violations
- [ ] All error messages include context about transformations
- [ ] Existing tests updated to work with new structure
- [ ] New tests verify transformation tracking

---

### Stage 6: Update CLI Output

**Goal**: Display transformation information in validation reports

**Files to modify:**
- `packages/cli/src/cmd/validate/validate.ts`
- Create: `packages/cli/src/formatters/transformation-formatter.ts`

**CLI output format:**

```
=== Validation Results ===

❌ occurrences.csv, row 142

   Field: eventID
   CSV value: "NA"
   Transformed: NULL
   Transformation: Interpreted as NULL (configured null value: 'NA')

   Error: eventID is required and cannot be null

   → Fix: Update your CSV to use a valid eventID, or remove "NA" from
          nullValues configuration if "NA" is a valid identifier

---

❌ events.csv, row 87

   Field: decimalLatitude
   CSV value: "91.5"
   Transformed: 91.5 (number)
   Transformation: Type coercion (string → number)

   Error: decimalLatitude must be between -90 and 90

   → Fix: Update the value in your CSV file

---

✓ All transformations applied:
  • null_interpretation: 127 values
  • type_coercion: 3,421 values
  • whitespace_trim: 12 values
```

**JSON output format:**

```json
{
  "datasetResults": [{
    "vocabularyErrors": [{
      "violations": [{
        "rowNumber": 142,
        "csvValue": "NA",
        "transformedValue": null,
        "transformationChain": {
          "sourceValue": "NA",
          "transformedValue": null,
          "transformations": [{
            "type": "null_interpretation",
            "description": "Interpreted 'NA' as NULL (configured null value)",
            "config": {
              "nullValues": ["NA", "N/A", "null"]
            }
          }]
        },
        "errorMessage": "eventID is required and cannot be null"
      }]
    }]
  }],
  "transformationSummary": {
    "null_interpretation": 127,
    "type_coercion": 3421,
    "whitespace_trim": 12
  }
}
```

**Success criteria:**
- [ ] Text output shows CSV value, transformed value, and chain
- [ ] JSON output includes full transformation information
- [ ] Transformation summary shows aggregate statistics
- [ ] Output is clear and actionable for users

---

### Stage 7: Add Transformation Preview Mode

**Goal**: Allow users to preview transformations without running full validation

**New CLI command:**

```bash
deno task dev:cli validate --preview
# Shows how data will be transformed without validation

deno task dev:cli validate --preview --dataset events
# Preview transformations for specific dataset
```

**Output:**

```
=== Transformation Preview: events.csv ===

Configuration:
  • Null values: ["NA", "N/A", "", "null"]
  • Type inference: enabled
  • Whitespace handling: automatic (DuckDB)

Sample transformations (first 10 rows):

Row 1, eventID:
  CSV: "E001"
  Transformed: "E001" (VARCHAR)
  Changes: None

Row 3, decimalLatitude:
  CSV: "45.123"
  Transformed: 45.123 (DOUBLE)
  Changes: Type coercion (string → number)

Row 7, eventDate:
  CSV: ""
  Transformed: NULL
  Changes: Null interpretation (empty string)

Summary:
  • Total rows: 347
  • Fields transformed: 8/15
  • Transformations applied:
    - null_interpretation: 42 values (12%)
    - type_coercion: 156 values (45%)
    - date_parsing: 89 values (26%)
```

**Success criteria:**
- [ ] Preview mode works without running validation
- [ ] Shows sample transformations from multiple rows
- [ ] Displays transformation summary statistics
- [ ] Helps users understand what will happen before validation

---

## Testing Strategy

### Unit Tests

**Create `test/transformation-tracking/`:**

1. **transformation-tracker.test.ts** - Test transformation detection
   ```typescript
   - buildTransformationChain detects null interpretation
   - buildTransformationChain detects type coercion
   - buildTransformationChain detects whitespace trimming
   - buildTransformationChain detects date parsing
   - Multiple transformations in chain
   ```

2. **dual-value-queries.test.ts** - Test raw + transformed table queries
   ```typescript
   - Both tables loaded correctly
   - Row correspondence maintained
   - Queries return both values
   - JOIN works correctly with rowid
   ```

3. **transformation-aware-errors.test.ts** - Test enhanced error reporting
   ```typescript
   - Vocabulary errors include transformation chains
   - Uniqueness errors include transformation chains
   - Foreign key errors include transformation chains
   - Error messages reference CSV values
   ```

### Integration Tests

**Update existing tests:**

1. **example-config.test.ts**
   - Verify transformation information in results
   - Check that CSV values are correctly reported

2. **workspace-validator.test.ts**
   - Update assertions for new error structure
   - Test transformation chain building

### End-to-End Tests

**Create new E2E test:**

```bash
test/e2e/transformation-tracking.test.ts
```

Test full workflow:
1. Create workspace with null values config
2. Run validation
3. Verify errors show both CSV and transformed values
4. Verify transformation chains are correct
5. Test preview mode

---

## Documentation Updates

### Files to update:

1. **CLAUDE.md** - Add transformation tracking section
2. **README.md** - Document transformation behavior
3. **Create: docs/transformation-tracking.md** - Comprehensive guide

### Documentation topics:

1. **How transformations work**
   - DuckDB automatic transformations
   - Configured transformations (null values)
   - Future: user-defined transformations

2. **Understanding validation errors**
   - Reading transformation chains
   - Fixing CSV vs config issues
   - When to modify CSV vs config

3. **Transformation preview mode**
   - How to use it
   - Interpreting results
   - Best practices

4. **Future transformation pipeline**
   - User-defined transformations
   - Transformation validation
   - Chaining transformations

---

## Performance Considerations

### Memory Impact

**Dual table loading**: ~2x memory usage
- Mitigation: Only load raw table for fields with violations
- Alternative: Query CSV directly for error reporting (slower but less memory)

### Query Performance

**JOIN on rowid**: Should be fast (indexed)
- Test with large datasets (1M+ rows)
- Consider caching raw values for repeated queries

### Optimization Strategies

1. **Lazy loading**: Only load raw table when errors found
2. **Selective columns**: Only load raw columns that are validated
3. **Streaming**: For very large files, process in chunks

---

## Future Enhancements

### Phase 2: User-Defined Transformations

**Goal**: Support explicit transformation pipelines in config

```json
{
  "datasets": [{
    "fieldMappings": [{
      "originName": "lat",
      "targetName": "decimalLatitude",
      "transformations": [
        {"type": "trim"},
        {"type": "cast", "targetType": "number"},
        {"type": "validate", "range": [-90, 90]}
      ]
    }]
  }]
}
```

### Phase 3: Transformation Editor UI

**Goal**: Visual transformation pipeline builder in GUI
- Drag-and-drop transformation steps
- Live preview of transformations
- Validation warnings before applying

### Phase 4: Reversible Transformations

**Goal**: Export transformed data back to CSV
- Apply transformations permanently
- Generate clean datasets
- Track provenance

---

## Migration Strategy

### Backward Compatibility

**Existing validation results remain valid:**
- New fields are optional
- Old code continues to work
- Gradual adoption of transformation tracking

**Migration path:**
1. Deploy new types (Stage 1-2) - No breaking changes
2. Deploy dual-value querying (Stage 3-4) - Enhanced data only
3. Update consumers (Stage 5-7) - Gradual rollout

### Rollback Plan

If issues arise:
1. Stage 5-7: Revert validation functions to old queries
2. Stage 3-4: Drop raw tables, use only transformed tables
3. Stage 1-2: Optional fields can be ignored

---

## Definition of Done

- [ ] All 7 stages completed
- [ ] All tests passing (unit, integration, e2e)
- [ ] Documentation complete
- [ ] CLI outputs transformation information
- [ ] Preview mode working
- [ ] Performance acceptable (< 2x slowdown)
- [ ] Memory usage reasonable (< 2.5x increase)
- [ ] No breaking changes to existing API
- [ ] Example configs demonstrate feature

---

## Current Status

**Completed Stages**:
- ✅ Stage 1: Transformation type system designed
- ✅ Stage 2: Validation error types enhanced

**Next Stage**: Stage 3 - Implement dual-value querying

**Next Steps**:
1. Modify `createWorkspaceFromConfig` to load both raw and transformed tables
2. Update validation queries to JOIN raw + transformed tables
3. Test with real data to verify performance

**Estimated Timeline**: 2-3 days for Stages 3-5, 1-2 days for Stages 6-7
