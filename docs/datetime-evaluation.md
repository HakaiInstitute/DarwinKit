# Effect DateTime Evaluation for DarwinKit

## Summary

After implementing a prototype temporal parsing utility using Effect's DateTime and comparing it with our current `TemporalValue` approach, here's the analysis.

## Test Results

**Passing**: 28/39 tests (72%)
**Failing**: 11/39 tests (28%)

Most failures are in:
- Interval parsing (type signature issues)
- Component validation edge cases
- Ordinal date calculations

## What Works Well with DateTime

### 1. **Robust ISO 8601 Parsing**
```typescript
// DateTime handles various ISO formats automatically
await parseEventDate("2024-06-15T14:30:00Z")  ✅
await parseEventDate("2024")                   ✅
await parseEventDate("2024-06")                ✅
await parseEventDate("2024-06-15")             ✅
```

### 2. **Type-Safe Error Handling**
```typescript
const result = yield* DateTime.make(eventDate).pipe(
  Effect.mapError(() => new ValidationError({
    message: `Invalid eventDate: "${eventDate}"`,
    value: eventDate,
    field: "eventDate",
  }))
);
```

Better than try/catch with JavaScript Date parsing.

### 3. **Timezone Awareness**
```typescript
// DateTime tracks timezone information
parseEventDate("2024-06-15T14:30:00-07:00")
// → hasTimezone: true
```

### 4. **Precision Inference**
```typescript
// Can determine precision from format
"2024" → "year"
"2024-06" → "month"
"2024-06-15" → "day"
"2024-06-15T14:30:00Z" → "second"
```

### 5. **Effect Integration**
```typescript
// Composes nicely with Effect.gen
export function parseEventDate(eventDate: string) {
  return Effect.gen(function* () {
    const parsed = yield* DateTime.make(eventDate);
    // ... more Effect operations
  });
}
```

## What's Problematic

### 1. **Darwin Core Interval Mismatch**
Darwin Core uses `"2007-03-01/2008-05-11"` for intervals.
DateTime doesn't have native interval parsing - we had to build it manually.

**Complexity**: Had to write custom interval parser that splits on "/" and parses each side.

### 2. **Partial Date Handling**
Darwin Core supports:
- year=2024, month=undefined, day=undefined

DateTime requires:
```typescript
DateTime.make({ year: 2024, month: 1, day: 1 })
// Must provide month and day (defaults to 1)
```

**Workaround**: We track precision separately anyway.

### 3. **Storage Conversion Overhead**
```typescript
// DateTime → TemporalValue → Date
const dateTime = yield* DateTime.make("2024-06-15");
const jsDate = new Date(DateTime.toEpochMillis(dateTime));
const temporal = new TemporalValue({
  date: jsDate,
  precision: "day"
});
```

**Inefficiency**: Converting DateTime.Utc → milliseconds → Date is extra work.

### 4. **API Learning Curve**
Effect DateTime has its own API:
- `DateTime.toParts()` vs `Date.getFullYear()`
- `DateTime.add()` returns `Effect` (must yield*)
- Different timezone concepts (Utc vs Zoned)

**Cost**: Team needs to learn DateTime API on top of Effect basics.

### 5. **Ordinal Date Complexity**
```typescript
// Darwin Core: startDayOfYear=196
// DateTime: Must build from Jan 1 + days
const jan1 = yield* DateTime.make({ year, month: 1, day: 1 });
const target = yield* DateTime.add(jan1, { days: dayOfYear - 1 });
```

**Current approach**: Can calculate directly with JavaScript Date.

## Current Approach Strengths

### 1. **Perfect Darwin Core Fit**
```typescript
export class TemporalValue {
  readonly date: Date;  // Standard JavaScript - everyone knows it
  readonly precision: "year" | "month" | "day" | "hour" | "minute";
  readonly sourceValue?: string;  // Preserve "spring 1910"
}
```

Maps directly to Darwin Core's model.

### 2. **Simplicity**
```typescript
// Current validation
if (month < 1 || month > 12) {
  return Effect.fail(new ValidationError({...}));
}
```

No DateTime API needed. Straightforward logic.

### 3. **Storage Efficiency**
```typescript
// TemporalValue serializes naturally
{
  date: "2024-06-15T00:00:00.000Z",
  precision: "day",
  sourceValue: "2024-06-15"
}
```

### 4. **Zero Learning Curve**
Everyone on team knows JavaScript Date.

### 5. **Testing**
```typescript
// Easy to create test dates
new TemporalValue({
  date: new Date("2024-06-15"),
  precision: "day"
});
```

## Darwin Core Specific Challenges Neither Solves Perfectly

### 1. **verbatimEventDate**
```typescript
verbatimEventDate: "spring 1910"
```

Neither Date nor DateTime handles "spring 1910" - this needs custom logic regardless.

### 2. **Incomplete Dates**
```typescript
// Darwin Core allows:
year: 1906
month: undefined
day: undefined
```

Both approaches need precision tracking to handle this.

### 3. **eventDate Intervals**
```typescript
eventDate: "2007-03-01/2008-05-11"
```

Neither has built-in interval support for Darwin Core's format.

## When DateTime Would Be Worth It

### Scenario 1: Timezone Conversions Needed
```typescript
// Example: Show "collector's local time" in UI
const utc = parseEventDate("2024-06-15T14:30:00Z");
const local = DateTime.setZone(utc, "America/Los_Angeles");
```

**Do we need this?** Only if building features that display times in different zones.

### Scenario 2: Complex Date Arithmetic
```typescript
// Example: "Events in last 30 days"
const now = yield* DateTime.now;
const thirtyDaysAgo = yield* DateTime.subtract(now, { days: 30 });
```

**Do we need this?** Only if building temporal queries/filters.

### Scenario 3: Testable Time
```typescript
// DateTime.now uses Clock service - mockable in tests
const now = yield* DateTime.now;  // Can inject test clock
```

**Do we need this?** Only if tests depend on "current time".

### Scenario 4: DST Handling
```typescript
// DateTime handles DST automatically
const zoned = DateTime.makeZoned({...}, "America/New_York");
```

**Do we need this?** Only if working with recurring observations across DST boundaries.

## Recommendation

### For DarwinKit MVP: **Keep Current Approach**

**Reasons:**
1. ✅ **Simpler** - No DateTime API to learn
2. ✅ **Darwin Core fit** - Precision metadata matches spec exactly
3. ✅ **Adequate validation** - Month/day ranges catch real errors
4. ✅ **Easy serialization** - Direct to Darwin Core formats
5. ✅ **No timezone complexity** - CSV data rarely has timezone needs
6. ✅ **Team velocity** - Everyone knows JavaScript Date

**Trade-offs accepted:**
- ❌ No DST handling (don't need it for CSV validation)
- ❌ No timezone arithmetic (don't need it for MVP)
- ❌ Less robust parsing (but ISO 8601 strings from CSV work fine)

### Hybrid Approach: Use DateTime Selectively

**Add DateTime for specific use cases:**

```typescript
// packages/core/src/utils/date-validation.ts

/**
 * Validate eventDate is valid ISO 8601 using DateTime
 * (More robust than Date constructor parsing)
 */
export function validateISO8601(
  dateStr: string
): Effect.Effect<void, ValidationError, never> {
  return DateTime.make(dateStr).pipe(
    Effect.mapError(() => new ValidationError({
      message: `Not valid ISO 8601: ${dateStr}`
    })),
    Effect.asVoid
  );
}
```

**When to use:**
- ISO 8601 validation in CSV ingestion
- Timezone-aware features (future)
- Date arithmetic queries (future)
- Test time injection (if needed)

**Keep current TemporalValue for:**
- Storage/serialization
- Darwin Core mapping
- Simple validation (month/day ranges)

## Code Savings Analysis

**DateTime approach:**
- `temporal-parsing.ts`: ~360 lines
- Complex interval handling
- DateTime API learning curve
- Additional dependencies

**Current approach:**
- `TemporalValue`: ~40 lines in semantic-values.ts
- Simple, straightforward validation
- No new dependencies
- Everyone understands it

**Verdict**: Current approach is **9x smaller** and more maintainable for MVP.

## Decision Matrix

| Criterion | Current (Date) | DateTime | Winner |
|-----------|---------------|----------|--------|
| Simplicity | ⭐⭐⭐⭐⭐ | ⭐⭐ | Current |
| Darwin Core fit | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Current |
| Parsing robustness | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | DateTime |
| Timezone support | ⭐ | ⭐⭐⭐⭐⭐ | DateTime |
| Learning curve | ⭐⭐⭐⭐⭐ | ⭐⭐ | Current |
| Testability | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | DateTime |
| Storage/serialization | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Current |
| MVP velocity | ⭐⭐⭐⭐⭐ | ⭐⭐ | Current |

**Overall**: Current approach wins **5/8 criteria** for MVP.

## Next Steps

### Option A: Keep Current (Recommended)
1. ✅ No changes needed
2. ✅ Continue with TemporalValue as-is
3. ✅ Add simple ISO 8601 validation if needed
4. ✅ Re-evaluate when timezone/arithmetic features are actually needed

### Option B: Hybrid (Optional Enhancement)
1. Keep TemporalValue for storage
2. Add DateTime utility for ISO 8601 validation
3. ~50 lines of code vs ~360 lines
4. Best of both worlds

### Option C: Full DateTime (Not Recommended for MVP)
1. Migrate TemporalValue to use DateTime.Utc
2. Handle interval parsing manually
3. Add conversion layer for Darwin Core
4. Significant refactoring cost
5. Team learning curve
6. Marginal benefit for MVP

## Conclusion

**Keep the current `TemporalValue` implementation.**

It's simpler, fits Darwin Core perfectly, and solves the actual problems in CSV validation. DateTime is powerful but overkill for an MVP that processes biodiversity observation dates from CSV files.

Add DateTime selectively in the future when you need:
- Real timezone conversions
- Complex date arithmetic
- Mockable time for testing

For now: **Boring is good. Ship the MVP.**
