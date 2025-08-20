# DarwinKit Test Suite

This directory contains comprehensive tests for the DarwinKit mapping system, covering vocabulary handling, field processing, and data transformation.

## Test Coverage

### Vocabulary Tests (`vocabulary.test.ts`)

- **28 tests** covering vocabulary lookup and validation functions
- Tests cover:
  - Canonical term lookup with exact matches and synonyms
  - Case-insensitive matching
  - Null/undefined/whitespace handling
  - Vocabulary transformation logic
  - Strict vs. non-strict vocabulary validation
  - Edge cases (empty strings, numbers, booleans)

### Mapping Tests (`mapping.test.ts`)

- **17 tests** covering field and row processing
- Tests cover:
  - Pass-through field processing
  - Controlled vocabulary field processing
  - Row-level validation and transformation
  - Dataset transformation with filtering
  - Real-world fish survey scenario
  - Edge case handling

## Key Test Scenarios

### Vocabulary Behavior

✅ **Synonym Resolution**: 'M' → 'male', 'F' → 'female', 'juv' → 'juvenile'\
✅ **Case Insensitivity**: 'MALE' → 'male', 'Female' → 'female'\
✅ **Null/Empty Handling**: null/undefined/'' → 'unknown'\
✅ **Strict Validation**: Invalid terms in strict vocabularies cause errors\
✅ **Non-Strict Validation**: Invalid terms in recommended vocabularies cause warnings

### Field Processing

✅ **Pass-Through Fields**: Values preserved without transformation\
✅ **Vocabulary Fields**: Synonyms transformed, validation applied\
✅ **Missing Source Data**: Handled gracefully with defaults\
✅ **Mixed Valid/Invalid**: Proper error and warning aggregation

### Dataset Processing

✅ **Valid Row Filtering**: Only valid rows included by default\
✅ **Include Invalid Option**: All rows preserved when requested\
✅ **Empty Dataset**: Handled correctly\
✅ **All Invalid Dataset**: Returns empty result

## Running Tests

```bash
# Run all tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run with coverage (requires @vitest/coverage-* package)
pnpm test:coverage

# Run specific test file
pnpm test test/vocabulary.test.ts
pnpm test test/mapping.test.ts
```

## Test Data

The tests use mock vocabularies that mirror the Darwin Core standard:

- **`dwc:sex`** (strict): male, female, hermaphrodite, unknown + synonyms
- **`dwc:life_stage`** (non-strict): adult, juvenile, larva, egg, unknown + synonyms
- **`dwc:basis_of_record`** (strict): HumanObservation, PreservedSpecimen, etc. + synonyms

## Integration Test

The `real-world fish survey mapping scenario` test validates the complete pipeline:

1. Source data with mixed valid/invalid values
2. Multiple vocabulary fields + pass-through fields
3. Synonym transformations
4. Validation with errors and warnings
5. Final clean output with only valid Darwin Core data

This test ensures the entire system works together as expected for realistic biodiversity data mapping scenarios.
