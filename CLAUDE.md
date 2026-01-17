# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development (all)**: `deno task dev` - Starts both API server (port 3001) and GUI (port 3000)
- **API server only**: `deno task dev:api` - Starts just the API server
- **GUI server only**: `deno task dev:gui` - Starts just the GUI development server
- **CLI**: `deno task dev:cli` - Run CLI commands interactively
- **Build**: `deno task build` - Creates production build of GUI
- **Preview**: `deno task preview` - Serves production build
- **Testing**: `deno test` - Runs comprehensive test suite
- **Package Testing**:
  - `deno task test:domain` - Test domain package
  - `deno task test:core` - Test core package
  - `deno task test:cli` - Test CLI package
  - `deno task test:api` - Test API package
  - `deno task test:gui` - Test GUI package
  - `deno task test:integration` - Run integration tests
- **Linting**: `deno lint` - Lints TypeScript files
- **Formatting**: `deno fmt` - Formats code according to Deno standards

## Architecture Overview

DarwinKit is a modular TypeScript application organized as a Deno workspace for mapping tabular biodiversity data to the Darwin Core standard. The application has five core packages that work together to provide mapping, transforming, and validating biodiversity data.

### Tech Stack

A core library used in this project is Effect. Ensure you use the documentation found here: https://effect.website/llms-full.txt

**Core Technologies (Implemented):**

- **Runtime**: Deno 2.0+ with workspace support
- **CLI**: Cliffy CLI with Effect for data, schema, and error handling
- **Validation**: Effect Data and Schema with custom biodiversity validators
- **Data Processing**: DuckDB for CSV parsing, schema inference, and validation operations
- **Testing**: Deno test runner

**Backend (Partially Implemented):**

- **API Server**: Hono web framework with basic routes at `/api/*`
- **Error Handling**: Effect library for functional error handling

**Frontend (Minimal Implementation):**

- **Framework**: React with Vite build system
- **API Client**: Basic HTTP client for backend communication
- **Styling**: Tailwind CSS

### Project Structure

```
packages/
├── domain/          # Domain layer: types, schemas, and business rules
│   ├── types/       # TypeScript interfaces and type definitions
│   ├── schemas/     # Effect validation schemas
│   ├── errors/      # Error codes, types, presenter, and severity definitions
│   ├── specs/       # Darwin Core field definitions and validation profiles
│   │   ├── profiles/      # TypeScript validation profiles (OBIS, etc.)
│   │   ├── vocabularies/  # Controlled vocabulary definitions
│   │   └── dwc/           # Darwin Core specification index
│   ├── constants/   # Darwin Core vocabularies and constants
│   └── utils/       # Domain utility functions (cause-formatter, etc.)
│
├── core/            # Core functionality: workspace operations, validation, transformation
│   ├── workspace/   # Workspace management and orchestration
│   │   ├── workspace.ts    # Main Workspace class
│   │   ├── validator.ts    # Validator class for validation orchestration
│   │   ├── transformer.ts  # Transformer class for transformation orchestration
│   │   └── errors.ts       # Workspace-level errors
│   ├── validation/  # DuckDB-powered validation operations
│   │   ├── dataset-validator.ts  # Dataset validation logic
│   │   ├── field-validators.ts   # Field-level validation
│   │   └── utils.ts              # Validation utilities
│   ├── transformation/  # Data transformation operations
│   │   ├── operations/  # Split transformation operations
│   │   │   ├── import.ts      # CSV import operations
│   │   │   ├── schema.ts      # Schema creation operations
│   │   │   ├── population.ts  # Data population operations
│   │   │   └── export.ts      # Export operations (CSV, DB)
│   │   └── errors.ts       # Transformation-specific errors
│   ├── database/    # Shared database operations
│   │   ├── connection-manager.ts  # DuckDB connection lifecycle (via Workspace)
│   │   ├── schema-builder.ts     # Schema creation from profiles
│   │   ├── csv-importer.ts       # CSV import utilities
│   │   └── utils.ts              # Database utilities
│   ├── import/      # Data import utilities
│   ├── testing/     # Test fixtures and utilities for core tests
│   ├── utils/       # Core utility functions (effect-utils, string-utils)
│   ├── csv-parser.ts      # CSV parsing using DuckDB for schema inference
│   └── transform.ts       # Backward-compatible transformation API
│
├── cli/             # Command-line interface
│   ├── cmd/         # CLI commands
│   │   ├── validate/      # validate command
│   │   ├── transform/     # transform command
│   │   └── import/        # import command
│   └── utils/       # Terminal output utilities (spinner, output formatting)
│
├── api/             # HTTP API server (Hono-based)
│   ├── routes/      # API routes at /api/* (auth, workspaces, etc.)
│   ├── middleware/  # HTTP middleware
│   └── utils/       # API utilities (validation helpers)
│
└── gui/             # Web interface (React + Vite) - minimal implementation
    └── api/         # HTTP client for API communication
```

**Note**: The `external/` directory (not shown above) contains Darwin Core schema definitions and the schema generator script.

### Package Architecture

**Workspace Dependencies:**

- **@dwkt/domain** - Domain layer: types, schemas, field definitions, business rules
  - Imports Darwin Core base specifications from `external/dwcSchema.json`
  - Contains TypeScript-defined validation profiles (OBIS, GBIF, etc.)
  - Lightweight, no heavy dependencies (no DuckDB, no native modules)
  - Works in both browser and Node.js environments
- **@dwkt/core** - Core functionality: workspace operations, validation, transformation
  - Uses DuckDB for CSV parsing, schema inference, and validation operations
  - Imports from `@dwkt/domain` for types and specs
- **@dwkt/cli** - Command-line interface (imports domain + core)
- **@dwkt/api** - HTTP server (imports domain + core)
- **@dwkt/gui** - Web interface (imports domain only, talks to API via HTTP)

**Data Storage:**

- **File-based workspaces** - Each workspace stored as JSON files with parsed CSV metadata
- **DuckDB** - Schema inference, CSV parsing, and validation operations
- **PostgreSQL** - (Planned) User authentication and project organization

**External Resources:**

- **external/dwcSchema.json** - Base Darwin Core specifications (Event, Occurrence, Taxon, etc.)
- **external/get_dc_schema.cjs** - Script to regenerate specs from Darwin Core XML schemas

### Darwin Core Specifications

DarwinKit uses a hybrid specification system combining external JSON schemas with TypeScript validation profiles.

**Base Schemas (external/dwcSchema.json):**

The foundation of DarwinKit's validation system comes from official Darwin Core schemas:

- Generated from Darwin Core XML schemas via `external/get_dc_schema.cjs`
- Contains 5 standard profiles: `Event`, `Occurrence`, `Taxon`, `ExtendedMeasurementOrFact`, `dnaDerivedData`
- Provides canonical field definitions with types, descriptions, and validation rules
- Imported as JSON into `packages/domain/src/specs/profiles/registry.ts`

**Custom Profiles (packages/domain/src/specs/profiles/):**

TypeScript-defined profiles extend base Darwin Core with community-specific requirements:

- **OBIS** (`obis.ts`) - Ocean Biodiversity Information System base profile
- **OBIS-Event** (`obis-event.ts`) - OBIS sampling event profile extending Event + OBIS
- Custom profiles can add fields, strengthen validation rules, or mark additional fields as required
- Support profile inheritance via `extends` property for composition

**Two-Tier Profile Resolution:**

The profile registry in `registry.ts` implements a sophisticated resolution system:

1. **TypeScript Profile Priority**: Check TypeScript profile registry first (OBIS, GBIF, etc.)
2. **JSON Fallback**: If not found, look up profile in imported `dwcSchema.json`
3. **Inheritance Resolution**: Recursively resolve parent profiles via `extends` property
4. **Normalization**: Convert JSON validators to `ValidatorConfig` objects via `normalizeField()`
5. **Profile Merging**: Combine parent and child profiles with child taking precedence

**Field Normalization:**

JSON schemas use different field formats than TypeScript profiles, requiring normalization:

- `normalizeJsonProfile()` converts raw JSON profiles to `ValidationProfile` format
- `normalizeField()` (in `field-definition.ts`) transforms JSON validators:
  - String validators: `"date"`, `"url"`, `"coordinate"` → `ValidatorConfig` objects
  - Type definitions: Maps JSON types to Effect schema validators
  - Controlled vocabularies: Links to vocabulary registry
- **Dual-purpose storage**:
  - `fields`: Raw JSON format (used for SQL DDL generation)
  - `normalizedFields`: Processed format (used for validation logic)

**Profile Inheritance Example:**

```typescript
// OBIS-Event profile extends both Event and OBIS
{
  id: "obis-event",
  extends: "Event",  // Inherits all Event fields
  fields: {
    // Additional OBIS-specific requirements
    decimalLatitude: { required: true },
    decimalLongitude: { required: true },
    eventDate: { required: true }
  }
}
```

**Regenerating Base Schemas:**

When Darwin Core standards are updated, regenerate the base schemas:

```bash
cd external
node get_dc_schema.cjs
```

This fetches the latest Darwin Core XML schemas and generates `dwcSchema.json` with all standard profiles and field definitions.

**Key Files:**

- `external/dwcSchema.json` - Base Darwin Core specifications
- `external/get_dc_schema.cjs` - Schema generation script
- `packages/domain/src/specs/profiles/registry.ts` - Profile resolution and merging
- `packages/domain/src/specs/field-definition.ts` - JSON field normalization
- `packages/domain/src/specs/vocabularies/registry.ts` - Controlled vocabularies

### API Architecture

Hono-based HTTP API with Effect Schema validation:

- RESTful routes defined in `packages/api/src/routes/`
- Domain schemas ensure type safety between client and server
- Effect library provides functional error handling throughout the stack

### Key Development Patterns

- **Workspace modularity** - Each package has a specific, well-defined responsibility
- **Domain-driven design** - Business rules and schemas in domain layer, implementations in core
- **Type safety** - Effect schemas ensure consistency across packages
- **Clean architecture** - Domain logic separated from infrastructure (DuckDB, file system)
- **Effect-based error handling** - Functional approach to error management
- **External specifications** - Darwin Core specs imported from JSON, extended via TypeScript profiles

### Environment Setup

- **Deno 2.0+** required for workspace support
- **PostgreSQL** optional for user authentication (workspace functionality works without it)
- **No package installation** - Deno handles dependencies automatically

### Core Workflow

DarwinKit's workflow centers on config-based operations:

1. **Define datasets** in `darwinkit.json` configuration files
2. **Map fields** from CSV columns to Darwin Core fields
3. **Configure validation** with profile selection and custom rules
4. **Run validation** via CLI to check data quality
5. **Review results** showing validation errors and warnings
6. **Transform data** to Darwin Core format with field mappings
7. **Export results** to CSV files and persistent DuckDB

### Workspace Architecture

DarwinKit uses an object-oriented workspace architecture with clear separation of concerns:

**Workspace Class** - Central orchestrator for configuration and lifecycle management:

- Factory methods: `Workspace.discover()`, `Workspace.fromPath()`, `Workspace.create()`
- Configuration access: `getConfig()`, `getName()`, `getDatasets()`
- Lazy-initialized properties: `validator` and `transformer`
- Resource management: `close()` for cleanup

**Validator Class** - Orchestrates validation operations:

- Accessed via `workspace.validator` property
- Main method: `run(options)` - Executes multi-dataset validation
- Result caching: `getResult()`, `isValid()` methods
- Composes DatasetValidator and FieldValidator classes internally

**Transformer Class** - Orchestrates transformation operations:

- Accessed via `workspace.transformer` property
- Main method: `run(options)` - Executes full transformation pipeline
- Granular operations: `importData()`, `createSchemas()`, `populateData()`, `exportResults()`
- Pipeline stages: CSV import → post-import transforms → schema creation → data population → export

**Usage Pattern:**

```typescript
// Create workspace
const workspace = await Effect.runPromise(Workspace.discover());

// Validate data
const validationResult = await Effect.runPromise(workspace.validator.run());

// Transform data (if validation passes)
if (workspace.validator.isValid()) {
  await Effect.runPromise(workspace.transformer.run());
}

// Clean up resources
workspace.close();
```

**Backward Compatibility:**

The legacy functional API is still available for backward compatibility:

```typescript
// Legacy API (still works)
import { transformFile } from "@dwkt/core";
await Effect.runPromise(transformFile("./path/to/config"));
```

However, the new workspace-based API is recommended as it provides:

- Better resource management with explicit `close()`
- Access to both validation and transformation in one workspace
- Granular control over transformation pipeline stages
- Cached validation results

## Config-Based Validation

DarwinKit supports configuration-driven validation for multi-dataset projects using `darwinkit.json` files.

### Configuration Format

```json
{
  "name": "Marine Biodiversity Dataset",
  "version": "1.0.0",
  "description": "Survey data validation configuration",

  "validation": {
    "nullValues": ["NA", "N/A", "", "NULL", "null"],
    "failFast": false,
    "outputDir": "./validation_results"
  },

  "datasets": [
    {
      "name": "event_data",
      "spec": "dwc-event",
      "path": "../data/FC2022_event.csv",
      "description": "Sampling events",

      "fieldMappings": [
        { "originName": "eventID", "targetName": "eventID", "isRequired": true },
        { "originName": "country", "targetName": "country", "isRequired": true }
      ]
    }
  ],

  "crossDatasetRules": [
    {
      "ruleType": "foreignKey",
      "sourceDataset": "occurrence_data",
      "sourceField": "eventID",
      "targetDataset": "event_data",
      "targetField": "eventID"
    }
  ]
}
```

### CLI Validation Workflow

```bash
# Auto-discover darwinkit.json in current or parent directories
deno task dev:cli validate

# Specify config directory
deno task dev:cli validate --config /path/to/workspace

# Output results as JSON
deno task dev:cli validate --format json
```

### Validation Features

- **Field Mappings** - Map CSV columns to Darwin Core fields, leveraging the Darwin Core specification registry
- **Cross-Dataset Rules** - Enforce referential integrity across multiple CSV files (foreign keys)
- **Controlled Vocabularies** - Automatic validation against Darwin Core controlled vocabularies
- **Type Validation** - Ensures dates, coordinates, and other typed fields match expected formats
- **Range Constraints** - Validates numeric values are within valid ranges (e.g., latitude -90 to +90)
- **Uniqueness Validation** - Detects duplicate identifiers across datasets

### Programmatic Validation

```typescript
import { Workspace } from "@dwkt/core";
import * as Effect from "effect/Effect";

const workspace = await Effect.runPromise(
  Workspace.discover("./path/to/workspace"),
);
const result = await Effect.runPromise(workspace.validator.run());
workspace.close();
```

### Programmatic Transformation

```typescript
import { Workspace } from "@dwkt/core";
import * as Effect from "effect/Effect";

const workspace = await Effect.runPromise(
  Workspace.discover("./path/to/workspace"),
);
await Effect.runPromise(workspace.transformer.run());
workspace.close();
```

**Transformation with options:**

```typescript
// Skip import if data already loaded
await Effect.runPromise(
  workspace.transformer.run({
    skipImport: true,
    skipExport: false,
  }),
);

// Run individual operations
await Effect.runPromise(workspace.transformer.importData());
await Effect.runPromise(workspace.transformer.createSchemas());
await Effect.runPromise(workspace.transformer.populateData());
await Effect.runPromise(workspace.transformer.exportResults());
```

### Example Configuration

A working example configuration is available at `test/example-config/darwinkit.json` with corresponding test data in `test/data/`. This example uses real marine biodiversity survey data (FC2022) and demonstrates:

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

## Planned Features

The following features are on the roadmap but not yet fully implemented:

### Interactive Workspace Management

**Vision:** GUI and CLI tools for managing workspace-based biodiversity data projects.

**Planned Workspace Features:**

**File Analysis:**

- Schema inference from CSV files using DuckDB
- Sample data extraction for each field
- Metadata tracking (parsing time, format, row counts)
- Interactive Darwin Core field mapping

**Data Validation:**

- Type validation for dates, coordinates, and other typed fields
- Controlled vocabulary validation
- Referential integrity checking
- Custom biodiversity-specific rules

**Workspace Storage:**

- File-based workspace persistence as JSON
- Portable workspaces that can be shared
- Incremental caching for performance

**Planned CLI Commands:**

```bash
# Create workspace from CSV (PLANNED)
deno task dev:cli workspace create "Marine Survey 2024" ./survey-data.csv

# List all workspaces (PLANNED)
deno task dev:cli workspace list

# Show workspace details (PLANNED)
deno task dev:cli workspace show <workspace-id>
```

**Planned API Endpoints:**

```typescript
// Create workspace via API (PLANNED)
const response = await fetch("http://localhost:3001/api/workspaces", {
  method: "POST",
  body: JSON.stringify({
    name: "Marine Survey 2024",
    filePath: "./survey-data.csv",
  }),
});
```

**Programmatic Workspace API:**

```typescript
// Workspace API
import { Workspace } from "@dwkt/core";
import * as Effect from "effect/Effect";

// Discover workspace from config file
const workspace = await Effect.runPromise(
  Workspace.discover("./project-directory"),
);

// Run validation
const result = await Effect.runPromise(workspace.validator.run());

// Run transformation
await Effect.runPromise(workspace.transformer.run());

// Access workspace state
console.log(workspace.getName());
console.log(workspace.getDatasets());
console.log(workspace.validator.isValid());

// Clean up when done
workspace.close();
```

### Database Integration

- PostgreSQL for user authentication and authorization
- Drizzle ORM schema definitions and migrations
- Workspace persistence in database alongside file-based storage
- User and project organization features

### Enhanced GUI

- Full React frontend with TanStack Router and Query
- Interactive workspace creation and management
- Visual field mapping configuration
- Real-time validation feedback
- Data transformation preview
- Headless UI components throughout
- TanStack React Form for all form handling

## Development Guidelines

### Workspace Development Patterns

**When working with Workspace, Validator, and Transformer classes:**

1. **Use workspace-managed connections**: Operations should receive `workspace` as a parameter and extract connections internally via `workspace.getConnection()`. Never create standalone DuckDB connections for operations.

2. **Lazy initialization**: The `validator` and `transformer` properties are lazily initialized on first access. They share the same workspace instance and connection pool.

3. **Resource cleanup**: Always call `workspace.close()` when done to clean up DuckDB connections and resources. Use `try/finally` blocks or Effect's cleanup mechanisms.

4. **Consistent patterns**:
   - Validation: `workspace.validator.run(options)` returns validation results
   - Transformation: `workspace.transformer.run(options)` executes pipeline
   - Both support granular operations for fine-grained control

5. **Operation structure**: Transformation operations are split into focused modules:
   - `import.ts` - CSV import and post-import transforms
   - `schema.ts` - Schema table creation from profiles
   - `population.ts` - Data population with field mappings
   - `export.ts` - Export to CSV and DuckDB files

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
yield * _(
  Effect.tryPromise({
    try: () => fs.access(userFilePath),
    catch: () =>
      new ParseError({
        message: `File not found: ${userFilePath}`,
        code: ErrorCode.FILE_NOT_FOUND,
      }),
  }),
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
const schema = yield * _(
  Effect.tryPromise(() => connection.runAndReadAll(schemaQuery)).pipe(
    Effect.orDie, // Query failure is a defect, not a user error
  ),
);
```

**Decision Framework:**

- Can the user fix this? → Expected error (Effect.fail)
- Is this a system failure or bug? → Defect (Effect.die)
- Is this normal program flow? → Expected error
- Would this indicate a programming error? → Defect

See `docs/error-handling-guide.md` for comprehensive guidelines.

### Workspace Development Patterns

- **Package-first design** - Choose the appropriate package for new functionality
- **Domain-first types** - Define interfaces and schemas in `@dwkt/domain` for cross-package consistency
- **Effect-based errors** - Use Effect library for functional error handling in core business logic
- **File-based routing** - TanStack Router provides type-safe navigation in the GUI
- **API-first integration** - GUI communicates with backend only via HTTP API

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

**@dwkt/gui:**

- Minimal React frontend implementation
- Only imports from @dwkt/domain (never from core)
- Communicates with backend via HTTP API client
- (Planned) TanStack Router, Query, and Form integration

### Testing Requirements

- `deno test` runs all package tests from workspace root
- Each package should have comprehensive test coverage
- Use `deno task test:<package>` for individual package testing
- Integration tests validate cross-package functionality
- (Planned) E2E tests using Playwright for full GUI workflow testing

### Code Quality Standards

- Run `deno test` before committing changes
- Ensure `deno lint` and `deno fmt` pass without errors
- Follow existing patterns within each package
- Use TypeScript strictly - avoid `any` types
- Document workspace-specific functionality and cross-package interactions

### Code Organization

- **Domain types and schemas** go in `packages/domain/src/types/` and `packages/domain/src/schemas/`
- **Darwin Core specifications** go in `packages/domain/src/specs/`
- **Business logic implementations** go in `packages/core/src/`
- **API endpoints** go in `packages/api/src/routes/` (served at `/api/*`)
- **CLI commands** go in `packages/cli/src/cmd/`
