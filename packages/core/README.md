# @dwkit/core

Core logic for validation, transformation, and workspace operations.

## Overview

This package implements the data processing pipeline using DuckDB for CSV operations. It provides the `Workspace` API for loading, validating, and transforming datasets. It's intended to be consumed by other packages, like [@dwkit/cli](../cli/README.md).

This is the only package that interfaces with the database. It should be used for all operations that require database access.

## Structure

```
src/
├── errors/       # Core error types
├── import/       # Darwin Core schema import utilities
├── loading/      # CSV parsing and data loading
├── transform/    # Data transformation utilities
├── validation/   # Validation operations
└── workspace/    # Workspace management
```

## Testing

```bash
deno task test
```
