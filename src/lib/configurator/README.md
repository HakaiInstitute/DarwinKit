# DarwinKit Core Libraries

This directory contains the core working implementation of the DarwinKit biodiversity data mapping and transformation system, including the new **modular architecture** for selective component usage.

## Modular Architecture System

DarwinKit now supports **selective component usage** through a modular configuration system that allows you to choose which parts of the data processing pipeline to use:

### Available Component Modes

1. **`mapping-only`** - Simple CSV column renaming (sourceColumn → targetField)
2. **`transform-validate`** - Data processing pipeline for quality control (no mapping)
3. **`mapping-validate`** - Direct validation of mapped fields (skip transformations)
4. **`mapping-transform`** - Data normalization without validation overhead
5. **`full-pipeline`** - Complete processing with all components (default)

### Modular Files

- **`modular-configuration.ts`** - Configuration interfaces and factory functions for selective component usage
- **`modular-executor.ts`** - Execution engine for modular configurations
- **`../demo/modular-configuration-demo.ts`** - Complete working demo of all modular modes
- **`../test/modular-configuration.test.ts`** - Comprehensive tests for modular system (20 tests)

## Core Files

### Configuration & Execution

- **`integrated-configuration.ts`** - Unified configuration schema for mapping + transformation + validation pipeline
- **`integrated-executor.ts`** - Main execution engine that processes integrated configurations
- **`transformations.ts`** - Core transformation functions (vocabulary normalization, coordinate parsing, date parsing, etc.)
- **`validations.ts`** - Core validation functions (vocabulary validation, data types, ranges, patterns, coordinates, etc.)
- **`validation-executor.ts`** - Standalone validation executor for validation-only workflows

### Supporting Libraries

- **`vocabulary-service.ts`** - Database-backed vocabulary functionality with caching
- **`zAsyncIterable.ts`** - tRPC async iterable utilities for streaming operations

### Demo & Testing

- **`../demo/integrated-demo.ts`** - Complete working demo of the integrated pipeline
- **`../demo/validation-demo.ts`** - Comprehensive validation demos (standalone + integrated)
- **`../demo/dataset-validation-demo.ts`** - Dataset-aware validation examples
- **`../demo/mapping-demo.ts`** - Provides mock vocabularies and legacy mapping demo

## Architecture

The system supports both unified pipeline and modular approaches:

### Full Pipeline (Traditional)

```
Source CSV Data → Field Mapping → Transformations → Validation → Clean Output
```

### Modular Pipeline (New)

```
Choose Components: [Mapping] [Transform] [Validate] → Selective Processing
```

### Usage Examples

```typescript
import {
  createMappingOnlyConfig,
  createMappingValidateConfig,
  createTransformValidateConfig,
  executeModularConfiguration,
} from "./modular-executor.js";

// Example 1: Mapping-only (just field renaming)
const mappingConfig = createMappingOnlyConfig({
  name: "Darwin Core Field Mapping",
  mappings: [
    { sourceColumn: "organism_sex", targetField: "sex" },
    { sourceColumn: "latitude_dd", targetField: "decimalLatitude" },
  ],
});

// Example 2: Transform + validate (no mapping needed)
const transformValidateConfig = createTransformValidateConfig({
  name: "Data Quality Processing",
  fields: [{
    fieldName: "sex",
    transformations: [{ functionName: "normalize", parameters: {} }],
    validations: [{ functionName: "validate", parameters: {} }],
  }],
});

// Example 3: Mapping + validate (skip transformations)
const mappingValidateConfig = createMappingValidateConfig({
  name: "Quick Quality Check",
  mappings: [{
    sourceColumn: "latitude_dd",
    targetField: "decimalLatitude",
    validations: [{ functionName: "validateCoordinates", parameters: { type: "latitude" } }],
  }],
});

// Execute any configuration
const result = executeModularConfiguration(sourceData, config);
```

### Key Features

- **Component Selection**: Choose only needed pipeline stages
- **Performance Optimized**: Skip unnecessary processing steps
- **Clear Separation**: Each component has specific responsibilities
- **Flexible Configuration**: Mix and match components as needed
- **Backward Compatible**: Existing integrated configurations still work
- **Type Safety**: Parameter validation and controlled vocabulary enforcement
- **Error Isolation**: Field failures don't break other transformations
- **Step-by-Step Tracking**: Detailed execution logging for debugging

## Benefits of Modular Architecture

### Performance Benefits

- **Selective execution** - Only run needed components
- **Reduced memory usage** - Skip unnecessary processing steps
- **Faster execution** - Mapping-only mode is extremely fast
- **Optimizable** - Each mode can be optimized independently

### Development Benefits

- **Clear separation of concerns** - Each component has specific responsibilities
- **Easier debugging** - Isolate issues to specific pipeline stages
- **Flexible configuration** - Mix and match components as needed
- **Backward compatibility** - Existing integrated configurations still work

### Use Case Examples

| Mode                 | Use Case             | Performance      | Best For                       |
| -------------------- | -------------------- | ---------------- | ------------------------------ |
| `mapping-only`       | CSV column renaming  | ⚡ Fastest       | Simple field mapping           |
| `transform-validate` | Data quality control | 🔄 Medium        | Cleaning pre-mapped data       |
| `mapping-validate`   | Quick quality checks | ✅ Fast          | Direct validation of CSV       |
| `mapping-transform`  | Data normalization   | 🔄 Fast          | Standardize without validation |
| `full-pipeline`      | Complete processing  | 🔄 Comprehensive | Production workflows           |

## Usage

```bash
# Run the modular architecture demo (all component modes)
node --import tsx demo/modular-configuration-demo.ts

# Run the integrated demo (mapping + transformation + validation)
node --import tsx demo/integrated-demo.ts

# Run validation demos (standalone + integrated)
node --import tsx demo/validation-demo.ts

# Run dataset-aware validation examples
node --import tsx demo/dataset-validation-demo.ts
```

## Validation Functions

The system includes comprehensive validation functions:

### Core Validations

- **`validateControlledVocabulary`** - Validates against controlled vocabularies with strict/loose modes
- **`validateDataType`** - Validates data types (string, number, boolean, date, integer)
- **`validateRange`** - Validates numeric ranges (min/max values)
- **`validateLength`** - Validates string lengths (min/max/exact length)
- **`validatePattern`** - Validates against regex patterns
- **`validateCoordinates`** - Validates latitude/longitude ranges
- **`validateRequired`** - Validates required fields

### Flexible Usage

- **Standalone**: Validate arbitrary datasets without modifications
- **With Transformations**: Validate after transforming data
- **Integrated Pipeline**: Full mapping → transformation → validation workflow
- **Isolation**: Each validation function works independently

## Database Schema

The normalized function parameter system is defined in:

- `../app/server/db/schema.ts` - Database tables for functions and parameters

## Superseded Files

The following files contain only deprecation notices pointing to current implementations:

- `vocabulary.ts`, `mapping.ts`, `transformation-executor.ts` - Superseded by integrated approach
- `../test/*.test.ts` - Superseded by integrated demo testing
- `../demo/transformation-demo.ts` - Superseded by integrated demo
- `../app/util/configuration-*.ts` - Superseded by integrated types
