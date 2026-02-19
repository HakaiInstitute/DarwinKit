# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **CLI**: `deno task cli` - Run CLI commands interactively
- **Testing**: `deno test` - Runs comprehensive test suite
- **Package Testing**:
  - `deno task test:domain` - Test domain package
  - `deno task test:core` - Test core package
  - `deno task test:cli` - Test CLI package
  - `deno task test:integration` - Run integration tests
- **Linting**: `deno lint` - Lints TypeScript files
- **Formatting**: `deno fmt` - Formats code according to Deno standards

## Architecture Overview

DarwinKit is a modular TypeScript application organized as a Deno workspace for mapping tabular biodiversity data to the Darwin Core standard. The application provides a command-line interface for validating and transforming biodiversity datasets according to Darwin Core standards.

### Tech Stack

- **Runtime**: Deno 2.0+ with workspace support
- **CLI**: Cliffy CLI with Effect for data, schema, and error handling
- **Validation**: Effect Data and Schema with typed constraint system
- **Data Processing**: DuckDB for CSV parsing, schema inference, and validation operations
- **Testing**: Deno test runner
- **Error Handling**: Effect library for functional error handling

### Project Structure

```
packages/
├── domain/          # Domain layer: types, schemas, and business rules
│   ├── types/       # TypeScript interfaces and type definitions
│   ├── schemas/     # Effect validation schemas
│   ├── errors/      # Error codes and error type definitions
│   ├── specs/       # Darwin Core field definitions and validation profiles
│   │   ├── profiles/      # TypeScript validation profiles (OBIS, etc.)
│   │   ├── vocabularies/  # Controlled vocabulary definitions
│   │   └── field-definition.ts  # JSON schema normalization
│   ├── constants/   # Darwin Core vocabularies and constants
│   └── utils/       # Domain utility functions
│
├── core/            # Core functionality: workspace operations, validation, transformation
│   ├── workspace/   # Workspace management with file system operations
│   ├── parsing/     # CSV parsing using DuckDB for schema inference
│   ├── validation/  # DuckDB-powered validation operations
│   ├── transform/   # Data transformation utilities
│   └── utils/       # Core utility functions
│
└── cli/             # Command-line interface
    ├── cmd/         # CLI commands (validate, transform, import)
    └── utils/       # Terminal output utilities and helpers
```

**Note**: The `external/` directory (not shown above) contains Darwin Core schema definitions and the schema generator script.

### Package Architecture

**Package Dependencies:**

- **@dwkt/domain** - Domain layer: types, schemas, field definitions, business rules
  - Uses generated Darwin Core specifications from `src/specs/generated/dwcSchema.json`
  - Contains TypeScript-defined validation profiles (OBIS, GBIF, etc.)
  - Lightweight, no heavy dependencies (no DuckDB, no native modules)
  - Pure TypeScript, no runtime-specific code
- **@dwkt/core** - Core functionality: workspace operations, validation, transformation
  - Uses DuckDB for CSV parsing, schema inference, and validation operations
  - Imports from `@dwkt/domain` for types and specs
  - Implements all business logic and data processing
- **@dwkt/cli** - Command-line interface
  - Imports from both `@dwkt/domain` and `@dwkt/core`
  - Provides user-facing commands for validation and transformation
  - Thin wrapper around core functionality with terminal output formatting

**Data Storage:**

- **DuckDB** - In-memory database for CSV parsing, schema inference, and validation operations
- **File-based configuration** - `darwinkit.yaml` files for dataset configuration and field mappings

**External Resources:**

- **external/rs_gbif/** - Darwin Core XML schemas from GBIF (source for schema generation)
- **packages/domain/src/specs/generated/dwcSchema.json** - Generated Darwin Core specifications (gitignored, regenerated via `deno task cli import`)

### Darwin Core Specifications

DarwinKit uses a hybrid specification system combining external JSON schemas with TypeScript validation profiles.

**Base Schemas (packages/domain/src/specs/generated/dwcSchema.json):**

The foundation of DarwinKit's validation system comes from official Darwin Core schemas:
- Generated from Darwin Core XML schemas via `deno task cli import` (or `import_schema()` from `@dwkt/core/import`)
- Contains 6 standard profiles: `Event`, `Occurrence`, `Taxon`, `ExtendedMeasurementOrFact`, `dnaDerivedData`, `ResourceRelationship`
- Provides canonical field definitions with types, descriptions, OBIS requirements, and constraints
- Imported as JSON into `packages/domain/src/specs/profiles/registry.ts`
- **Gitignored** — must be regenerated before running tests (CI does this automatically)

**Custom Profiles (packages/domain/src/specs/profiles/):**

TypeScript-defined profiles extend base Darwin Core with community-specific requirements:
- **OBIS** (`obis.ts`) - Ocean Biodiversity Information System base profile
- **OBIS-Event** (`obis-event.ts`) - OBIS sampling event profile extending Event + OBIS
- Custom profiles can add fields, strengthen validation rules, or mark additional fields as required
- Support profile inheritance via `extends` property for composition

**Two-Tier Profile Resolution:**

The profile registry in `registry.ts` implements a resolution system:

1. **TypeScript Profile Priority**: Check TypeScript profile registry first (OBIS, GBIF, etc.)
2. **JSON Fallback**: If not found, look up profile in imported `dwcSchema.json`
3. **Inheritance Resolution**: Recursively resolve parent profiles via `extends` property
4. **Normalization**: Convert JSON validators to typed `Constraint` objects via `normalizeField()`
5. **Profile Merging**: Combine parent and child profiles using `mergeConstraints()` (replacement by type)

**Constraint System:**

Validation uses a discriminated union of typed constraints (`Constraint` in `constraints.ts`):
- `RangeConstraint`, `RequiredConstraint`, `UniqueConstraint`, `PatternConstraint`, `LengthConstraint`, `FormatConstraint`, `VocabularyConstraint`
- Each constraint carries its own typed fields flat (no nested params)
- Only `RequiredConstraint` has `enforcement`: `"required"` (ERROR) | `"recommended"` (WARNING) | `"optional"` (INFO) — controls *presence* severity
- Value constraints (Range, Pattern, Format, Length, Unique) have no enforcement — value validity is unconditional (always ERROR)
- `VocabularyConstraint` has `strictness`: `"strict"` (ERROR) | `"recommended"` (WARNING, default) — DWC treats all vocabularies as "recommended best practice"
- Obligation mapping: `required` → enforcement `"required"`, `strongly recommended` → `"recommended"`, `recommended` → `"optional"`, `optional` → no constraint

**Field Normalization:**

JSON schemas use different field formats than TypeScript profiles, requiring normalization:
- `normalizeJsonProfile()` converts raw JSON profiles to `ValidationProfile` format
- `normalizeField()` (in `field-definition.ts`) transforms JSON validators to typed `Constraint` objects:
  - String validators: `"date"`, `"url"`, `"unique"` → typed `Constraint` objects
  - Controlled vocabularies: Converted to `VocabularyConstraint` in constraints array
  - Obligations: `obis_required`/`gbif_required` → `ObligationsMap` on `FieldDefinition`
- **Dual-purpose storage**:
  - `fields`: Raw JSON format (used for SQL DDL generation)
  - `normalizedFields`: Processed format with `Constraint[]` (used for validation logic)

**3-Tier Constraint Resolution (packages/core/src/validation/field-resolution.ts):**

At validation time, constraints are resolved through a 3-tier merge pipeline:
1. **Spec** (normalizedFields + obligations): Base constraints from the Darwin Core schema, plus obligation-derived `RequiredConstraint`s
2. **Profile** (fieldOverrides): Community-specific overrides using `mergeConstraints()` — full replacement by constraint type (trusted, curated)
3. **Config** (fieldMappings): User config using `addConstraints()` — additive only, cannot weaken spec/profile constraints

**Profile Inheritance Example:**

```typescript
// OBIS-Event profile extends both Event and OBIS
{
  id: "obis-event",
  extends: "Event",  // Inherits all Event fields
  fieldOverrides: {
    decimalLatitude: {
      requirement: "required",
      constraints: [
        { type: "range", min: -90, max: 90, inclusive: true }
      ]
    }
  }
}
```

**Regenerating Base Schemas:**

When Darwin Core standards are updated, regenerate the base schemas:

```bash
deno task cli import
```

This fetches the latest Darwin Core XML schemas and OBIS checklist, then generates `dwcSchema.json` with all standard profiles, field definitions, OBIS requirements, and constraints. The integration test `test/schema-generation.test.ts` validates the generated output.

**Key Files:**
- `packages/domain/src/specs/generated/dwcSchema.json` - Generated Darwin Core specifications (gitignored)
- `packages/core/src/import/get_dwc_schema.ts` - Schema generation logic
- `packages/domain/src/specs/constraints.ts` - Constraint discriminated union and merge logic
- `packages/domain/src/specs/constraint-presets.ts` - Named constraint bundles for YAML configs
- `packages/domain/src/specs/field-definition.ts` - JSON field normalization to `FieldDefinition`
- `packages/domain/src/specs/profiles/registry.ts` - Profile resolution and merging
- `packages/domain/src/specs/vocabularies/registry.ts` - Controlled vocabularies
- `packages/core/src/validation/field-resolution.ts` - 3-tier constraint merge pipeline
- `packages/core/src/validation/field-validators.ts` - Constraint-dispatched SQL validation

### Key Development Patterns

- **Workspace modularity** - Each package has a specific, well-defined responsibility
- **Domain-driven design** - Business rules and schemas in domain layer, implementations in core
- **Type safety** - Effect schemas ensure consistency across packages
- **Clean architecture** - Domain logic separated from infrastructure (DuckDB, file system)
- **Effect-based error handling** - Functional approach to error management
- **External specifications** - Darwin Core specs imported from JSON, extended via TypeScript profiles

### Workspace Architecture

DarwinKit uses Effect's resource management patterns for workspace operations:

**Workspace** - Workspace with automatic DuckDB lifecycle:
- Uses `Effect.acquireRelease` for connection management
- Requires `Scope.Scope` - use `Effect.scoped` for automatic cleanup
- Best for CLI commands and short-lived operations

**WorkspaceService** - Service layer for dependency injection:
- Uses `Context.Tag` pattern for DI
- `makeWorkspaceLayer(configPath)` creates a scoped layer
- Best for long-lived applications or when multiple operations share a connection

**Key Files:**
- `packages/core/src/workspace/workspace.ts` - `Workspace` class
- `packages/core/src/workspace/workspace-service.ts` - Service layer
- `packages/core/src/workspace/errors.ts` - Workspace error types

### Environment Setup

- **Deno 2.0+** required for workspace support
- **No package installation** - Deno handles dependencies automatically

### Core Workflow

DarwinKit's current workflow centers on config-based validation:

1. **Define datasets** in `darwinkit.yaml` configuration files
2. **Map fields** from CSV columns to Darwin Core fields
3. **Configure validation** with profile selection and custom rules
4. **Run validation** via CLI to check data quality
5. **Review results** showing validation errors and warnings

## Config-Based Validation

DarwinKit supports configuration-driven validation for multi-dataset projects using `darwinkit.yaml` files.

### Configuration Format

```yaml
name: Marine Biodiversity Dataset
version: 1.0.0
description: Survey data validation configuration

validation:
  nullValues:
    - NA
    - N/A
    - ""
    - "NULL"
    - "null"
  failFast: false
  outputDir: ./validation_results
  datasets:
    - name: event_data
      spec: dwc-event
      path: ../data/FC2022_event.csv
      description: Sampling events
      fieldMappings:
        - originName: eventID
          targetName: eventID
          requirement: required
        - originName: country
          targetName: country
          requirement: required

crossDatasetRules:
  - ruleType: foreignKey
    sourceDataset: occurrence_data
    sourceField: eventID
    targetDataset: event_data
    targetField: eventID
```

### CLI Validation Workflow

```bash
# Auto-discover darwinkit.yaml in current or parent directories
deno task cli validate

# Specify config file path
deno task cli validate --config /path/to/darwinkit.yaml

# Output results as JSON
deno task cli validate --format json
```

### Validation Features

- **Field Mappings** - Map CSV columns to Darwin Core fields, leveraging the Darwin Core specification registry
- **Cross-Dataset Rules** - Enforce referential integrity across multiple CSV files (foreign keys)
- **Controlled Vocabularies** - Automatic validation against Darwin Core controlled vocabularies
- **Type Validation** - Ensures dates, coordinates, and other typed fields match expected formats
- **Range Constraints** - Validates numeric values are within valid ranges (e.g., latitude -90 to +90)
- **Uniqueness Validation** - Detects duplicate identifiers across datasets

### Programmatic Validation

**Using Workspace (recommended for short-lived operations):**

```typescript
import { Workspace } from "@dwkt/core";
import * as Effect from "effect/Effect";

// Opens workspace, validates, and automatically cleans up DuckDB connection
const result = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const workspace = yield* Workspace.open("./darwinkit.yaml");
      return yield* workspace.validate();
    })
  )
);
```

**Using WorkspaceService (recommended for dependency injection/long-lived scenarios):**

```typescript
import { makeWorkspaceLayer, WorkspaceService } from "@dwkt/core";
import * as Effect from "effect/Effect";

// Create a layer for a specific workspace
const WorkspaceLive = makeWorkspaceLayer("./darwinkit.yaml");

// Use in Effect programs - connection stays open for layer lifetime
const program = Effect.gen(function* () {
  const workspace = yield* WorkspaceService;
  return yield* workspace.validate();
}).pipe(
  Effect.provide(WorkspaceLive)
);

await Effect.runPromise(program);
```

**Using WorkspaceValidator (alternative approach):**

```typescript
import { WorkspaceValidator } from "@dwkt/core";

const validator = new WorkspaceValidator();
const result = await Effect.runPromise(
  validator.validateFromConfig("./path/to/darwinkit.yaml")
);
```

### Example Configuration

A working example configuration is available at `test/example-config/darwinkit.yaml` with corresponding test data in `test/data/`. This example uses real marine biodiversity survey data (FC2022) and demonstrates:

- Multi-dataset validation (events + occurrences)
- Field mappings to Darwin Core
- Cross-dataset foreign key validation
- Date/temporal field validation (year, month, day, eventDate)
- Geographic coordinate validation
- Controlled vocabulary validation
- Uniqueness constraint checking

Run the example test to see validation output:
```bash
deno test test/example-config.test.ts --allow-all
```

For a focused example of date validation:
```bash
deno test test/date-validation.test.ts --allow-all
```

## Future Enhancements

The following enhancements are under consideration:

- **Enhanced reporting** - More detailed validation reports with summary statistics
- **Additional validation profiles** - Support for more biodiversity data standards (GBIF, iNaturalist, etc.)
- **Data transformation pipelines** - Advanced transformation capabilities for complex data workflows
- **Performance optimizations** - Caching and incremental validation for large datasets

## Development Guidelines

### Security Context

SQL injection is not a risk in DarwinKit — the application processes user-owned CSV files against local in-memory DuckDB instances with no multi-tenant or network-exposed SQL surface. Table and column names are sanitized via `sanitizeTableName()` as a defense-in-depth measure.

### Effect Library References

DarwinKit uses the Effect library extensively for functional program pipelines, error handling, schema validation, services, context, and dependency injection. When working with Effect-related code, reference materials are available in the `.context` directory:

**Available References:**

- **`.context/effect/`** - Complete Effect library source code for deep dives into implementation details
  - Explore core modules: Effect, Schema, Data, Match, etc.
  - Understand internal patterns and advanced usage
  - Reference when debugging complex Effect chains or type issues

- **`.context/effect-patterns/`** - Curated collection of Effect patterns and best practices
  - Common patterns for real-world scenarios
  - Solutions to frequent Effect challenges
  - Idioms for combining Effect primitives

- **`.context/effect-solutions/`** - Worked solutions to Effect exercises and challenges
  - Practical examples of Effect usage in different scenarios
  - Step-by-step solutions showing common patterns
  - Educational resource for learning Effect through examples

**When to Reference:**

- Solving complex Effect composition problems
- Understanding type errors from Effect chains
- Learning advanced Effect patterns (retries, resources, layers)
- Debugging unexpected Effect behavior
- Implementing new Effect-based features
- Looking for practical examples of specific Effect patterns

**How to Reference:**

- If looking for Effect API specifics, search in ./context/effect to examine implementation details
- If exploring options for how to implement Effect-based patterns, search in ./context/effect-patterns and ./context/effect-solutions
- Prefer narrow, targeted searches of broad, inclusive searches until you've found relevant information to avoid saturating context

**Setup Instructions:**

These reference materials are for AI context when working with Claude Code and are not tracked in the repository. To set up the `.context` directory:

```bash
# Clone reference repositories (shallow clones for smaller size)
git clone --branch effect@3.19.15 --depth 1 https://github.com/Effect-TS/effect.git
git clone --depth=1 git@github.com:PaulJPhilp/EffectPatterns.git .context/effect-patterns
git clone --depth=1 git@github.com:kitlangton/effect-solutions.git .context/effect-solutions
```

**Updating References:**

To pull the latest updates from any reference repository:

```bash
cd .context/effect-solutions  # or effect, or effect-patterns
git pull
```

### Error Handling with Effect

DarwinKit uses Effect's two-error-types model to distinguish between expected and unexpected errors:

**Expected Errors (Effect.fail)** - Recoverable domain errors:
- File not found (user-provided paths)
- Invalid CSV data
- Workspace not found
- Validation failures (field mappings, Darwin Core violations)
- Configuration errors

```typescript
// Example: User-provided file not found
yield* _(
  Effect.tryPromise({
    try: () => fs.access(userFilePath),
    catch: () => new ParseError({
      message: `File not found: ${userFilePath}`,
    })
  })
);
```

**Unexpected Errors / Defects (Effect.die)** - System failures:
- Database connection failures
- Infrastructure queries (schema, row count)
- File operations on our workspace directories
- JSON parsing failures on self-generated data
- Programming assertions

```typescript
// Example: Infrastructure query should always work
const schema = yield* _(
  Effect.tryPromise(() => connection.runAndReadAll(schemaQuery)).pipe(
    Effect.orDie  // Query failure is a defect, not a user error
  )
);
```

**Decision Framework:**
- Can the user fix this? → Expected error (Effect.fail)
- Is this a system failure or bug? → Defect (Effect.die)
- Is this normal program flow? → Expected error
- Would this indicate a programming error? → Defect

See `docs/error-handling-guide.md` for comprehensive guidelines.

### Development Patterns

- **Package-first design** - Choose the appropriate package for new functionality
- **Domain-first types** - Define interfaces and schemas in `@dwkt/domain` for cross-package consistency
- **Effect-based errors** - Use Effect library for functional error handling in core business logic
- **CLI-focused** - Thin CLI layer that delegates to core business logic

### Package Guidelines

**@dwkt/domain:**

- Domain layer containing business rules, types, and schemas
- Effect schemas for validation
- Darwin Core field definitions and validation profiles
- Lightweight, no heavy dependencies (no DuckDB, no native modules)
- Must work in both browser and Node.js environments

**@dwkt/core:**

- Core DarwinKit functionality: workspace operations, validation, transformation, mapping
- Uses DuckDB for data operations and CSV analysis
- Effect-based error handling and functional patterns
- File system operations and external service integrations
- Can import from @dwkt/domain

**@dwkt/cli:**

- Simple command-line interface for interacting with @dwkt/core API
- Allows users to validate and transform datasets
- Intended to provide a powerful yet user-friendly CLI for DarwinKit
- Can import from @dwkt/domain and @dwkt/core

### Testing Requirements

- `deno test` runs all package tests from workspace root
- Each package should have comprehensive test coverage
- Use `deno task test:<package>` for individual package testing
- Integration tests validate cross-package functionality

### Code Quality Standards

- Run `deno test`, `deno check`, and `deno lint` before committing changes
- Follow existing patterns within each package
- Use TypeScript strictly - never use `any` types, avoid `unknown` unless it's technically correct
- Document workspace-specific functionality and cross-package interactions
- Keep documentation concise
- Don't explain lines of code when the code is self-explanatory

### Code Organization

- **Domain types and schemas** go in `packages/domain/src/types/` and `packages/domain/src/schemas/`
- **Darwin Core specifications** go in `packages/domain/src/specs/`
- **Business logic implementations** go in `packages/core/src/`
- **CLI commands** go in `packages/cli/src/cmd/`
- **Test utilities** go in `test/helpers/`
