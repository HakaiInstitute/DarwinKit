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

**Planned Enhancements:**
- **Database**: PostgreSQL with Drizzle ORM for user authentication and workspace persistence
- **Frontend**: TanStack Router and TanStack Query for routing and state management
- **UI Components**: Headless UI component library
- **Forms**: TanStack React Form with Effect Schema validation

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
├── cli/             # Command-line interface
│   ├── cmd/         # CLI commands (validate, transform)
│   └── utils/       # Terminal output utilities and helpers
│
├── api/             # HTTP API server (Hono-based)
│   └── routes/      # API routes at /api/* (workspaces, etc.)
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

DarwinKit's current workflow centers on config-based validation:

1. **Define datasets** in `darwinkit.json` configuration files
2. **Map fields** from CSV columns to Darwin Core fields
3. **Configure validation** with profile selection and custom rules
4. **Run validation** via CLI to check data quality
5. **Review results** showing validation errors and warnings

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
        {"originName": "eventID", "targetName": "eventID", "isRequired": true},
        {"originName": "country", "targetName": "country", "isRequired": true}
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
import { WorkspaceValidator } from "@dwkt/core";

const validator = new WorkspaceValidator();
const result = await Effect.runPromise(
  validator.validateFromConfig("./path/to/darwinkit.json")
);
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

**Planned Programmatic API:**

```typescript
// Workspace service API (PLANNED)
import { WorkspaceService } from "@dwkt/core";

const service = new WorkspaceService();
const result = await Effect.runPromise(
  service.createFromFile({
    name: "Marine Survey 2024",
    filePath: "./survey-data.csv",
  }),
);
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
      code: ErrorCode.FILE_NOT_FOUND,
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
