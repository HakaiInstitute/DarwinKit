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
- **Linting**: `deno lint` - Lints TypeScript files
- **Formatting**: `deno fmt` - Formats code according to Deno standards
- **E2E Testing**: `deno task test:e2e` - Runs Playwright end-to-end tests
- **Database schema push**: `deno task drizzle:push` - Pushes schema changes to database
- **Database studio**: `deno task drizzle:studio` - Opens Drizzle Studio for database management

## Architecture Overview

DarwinKit is a modular TypeScript application organized as a Deno workspace for mapping tabular biodiversity data to the Darwin Core standard. The application has five core packages that work together to provide mapping, transforming, and validating biodiversity data.

### Tech Stack

- **Runtime**: Deno 2.0+ with workspace support
- **CLI**: Cliffy CLI with Effect for data, schema, and error handling
- **Validation**: Effect Data and Schema with custom biodiversity validators
- **Testing**: Deno test runner with Playwright for E2E
- **THE FOLLOWING CURRENTLY UNIMPLEMENTED:**
  - **Backend**: Hono web framework with Effect for functional error handling
  - **Database**: PostgreSQL with Drizzle ORM, DuckDB for CSV analysis
  - **Frontend**: React with Vite, TanStack Router, and TanStack Query
  - **UI**: Tailwind CSS + Headless UI components
  - **Forms**: TanStack React Form

### Project Structure

```
packages/
├── domain/          # Domain layer: types, schemas, and business rules
│   ├── types/       # TypeScript interfaces and type definitions
│   ├── schemas/     # Effect validation schemas
│   ├── errors/      # Error codes and error type definitions
│   ├── specs/       # Darwin Core field definitions and validation profiles
│   └── constants/   # Darwin Core vocabularies and constants
│
├── core/            # Core functionality: workspace operations, validation, transformation
│   ├── workspace/   # Workspace management with file system operations
│   ├── parsing/     # CSV parsing using DuckDB for schema inference
│   ├── validation/  # DuckDB-powered validation operations
│   └── database/    # PostgreSQL client and database utilities
│
├── cli/             # Command-line interface
│   ├── commands/    # CLI commands for workspace management
│   └── formatters/  # Terminal output formatting utilities
│
├── api/             # HTTP API server (Hono-based)
│   └── routes/      # API routes for workspaces, authentication
│
└── gui/             # Web interface (React + Vite)
    ├── components/  # Reusable React components
    ├── routes/      # Frontend routes using TanStack Router
    ├── hooks/       # Custom React hooks for API integration
    └── api/         # HTTP client for API communication
```

### Package Architecture

**Workspace Dependencies:**

- **@dwkt/domain** - Domain layer: types, schemas, field definitions, business rules (lightweight, no heavy dependencies)
- **@dwkt/core** - Core functionality: workspace operations, validation, transformation (uses DuckDB for data operations)
- **@dwkt/cli** - Command-line interface (imports domain + core)
- **@dwkt/api** - HTTP server (imports domain + core)
- **@dwkt/gui** - Web interface (imports domain only, talks to API via HTTP)

**Data Storage:**

- **File-based workspaces** - Each workspace stored as JSON files with parsed CSV metadata
- **PostgreSQL** - User authentication and project organization (optional)
- **DuckDB** - Schema inference and CSV parsing for data analysis

### API Architecture

Hono-based HTTP API with Effect Schema validation:

- RESTful routes defined in `packages/api/src/routes/`
- Domain schemas ensure type safety between client and server
- Effect library provides functional error handling throughout the stack

### State Management

- **Server State**: TanStack Query for HTTP API calls and caching
- **Form State**: TanStack React Form with Effect Schema validation
- **Local State**: React hooks and context for UI state

### Key Development Patterns

- **Workspace modularity** - Each package has a specific, well-defined responsibility
- **Domain-driven design** - Business rules and schemas in domain layer, implementations in core
- **Type safety** - Effect schemas ensure consistency across packages
- **Clean architecture** - Domain logic separated from infrastructure (DuckDB, file system)
- **Effect-based error handling** - Functional approach to error management
- **File-based routing** - TanStack Router for type-safe frontend routing
- **Component composition** - Headless UI primitives for consistent design

### Environment Setup

- **Deno 2.0+** required for workspace support
- **PostgreSQL** optional for user authentication (workspace functionality works without it)
- **No package installation** - Deno handles dependencies automatically

### Core Workflow

1. **Create workspaces** from CSV files with automatic schema inference
2. **Analyze data structure** using DuckDB for type detection and sampling
3. **Configure mappings** between source columns and Darwin Core fields
4. **Apply transformations** to normalize data formats
5. **Validate data quality** against Darwin Core standards and controlled vocabularies

## Workspace System

DarwinKit's core functionality revolves around **workspaces** - self-contained environments for processing biodiversity datasets.

### Workspace Features

**File Analysis:**

- **Schema inference** - Automatically detects column types using DuckDB
- **Sample data** - Extracts representative values for each field
- **Metadata tracking** - Records parsing time, file format, and row counts
- **Darwin Core mapping** - Tools for mapping source columns to standard fields

**Data Validation:**

- **Type validation** - Ensures data matches expected formats (dates, coordinates, etc.)
- **Controlled vocabularies** - Validates against Darwin Core standard terms
- **Referential integrity** - Checks relationships between related fields
- **Custom rules** - Biodiversity-specific validation logic

**Workspace Storage:**

- **File-based** - Each workspace stored as structured JSON files
- **Portable** - Workspaces can be shared and moved between systems
- **Incremental** - Sample data and metadata cached for performance

### Usage Patterns

**CLI Workspace Management:**

```bash
# Create workspace from CSV
deno task dev:cli workspace create "Marine Survey 2024" ./survey-data.csv

# List all workspaces
deno task dev:cli workspace list

# Show workspace details
deno task dev:cli workspace show <workspace-id>
```

**API Access:**

```typescript
// Create workspace via API
const response = await fetch("http://localhost:3001/workspaces", {
  method: "POST",
  body: JSON.stringify({
    name: "Marine Survey 2024",
    filePath: "./survey-data.csv",
  }),
});
```

**Programmatic Usage:**

```typescript
import { WorkspaceService } from "@dwkt/core";

const service = new WorkspaceService();
const result = await Effect.runPromise(
  service.createFromFile({
    name: "Marine Survey 2024",
    filePath: "./survey-data.csv",
  }),
);
```

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

- React components and frontend logic
- Only imports from @dwkt/domain (never from core)
- Communicates with backend via HTTP API calls
- Uses TanStack Query for state management

### Testing Requirements

- `deno test` runs all package tests from workspace root
- Each package should have comprehensive test coverage
- E2E tests using Playwright for full workflow testing
- Test both individual package functionality and cross-package integration

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
- **API endpoints** go in `packages/api/src/routes/`
- **UI components** go in `packages/gui/src/components/`
- **CLI commands** go in `packages/cli/src/commands/`
