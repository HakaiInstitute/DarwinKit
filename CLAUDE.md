# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development server**: `pnpm dev` - Starts the Vinxi development server
- **Build**: `pnpm build` - Creates production build using Vinxi
- **Start production**: `pnpm start` - Starts the production server
- **Testing**: `pnpm test` - Runs the comprehensive test suite using Vitest
- **Linting**: `pnpm lint` - Runs ESLint on JS/JSX/TS/TSX files
- **Database schema push**: `pnpm drizzle:push` - Pushes schema changes to database
- **Database studio**: `pnpm drizzle:studio` - Opens Drizzle Studio for database management

## Architecture Overview

DarwinKit is a full-stack TypeScript application for mapping tabular biodiversity data to the Darwin Core standard. The application has three core components: mapping, transforming, and validating biodiversity data through declarative configuration.

### Tech Stack
- **Framework**: TanStack Start (React-based full-stack framework)
- **Build Tool**: Vinxi
- **Database**: PostgreSQL with Drizzle ORM
- **API Layer**: tRPC for type-safe client-server communication
- **State Management**: XState for complex state machines, React Query for server state
- **UI**: Tailwind CSS + Headless UI components
- **Forms**: TanStack React Form with Zod validation
- **Routing**: TanStack React Router

### Project Structure

```
app/
├── client/          # Frontend React application
│   ├── routes/      # File-based routing with TanStack Router
│   ├── components/  # Reusable UI components (using Headless UI)
│   ├── machine/     # XState state machines
│   ├── hooks/       # Custom React hooks
│   └── schemas/     # Zod validation schemas
├── server/          # Backend server code
│   ├── db/          # Database schema and configuration
│   └── router.ts    # tRPC router with API endpoints
├── util/            # DEPRECATED - Consolidated into lib/ (see app/util/README.md)
lib/                 # Core validation and transformation libraries
├── validations.ts          # Dataset-aware validation functions  
├── validation-executor.ts  # Validation pipeline execution engine
├── transformations.ts      # Data transformation functions
├── transformation-executor.ts # Transformation pipeline executor
├── integrated-*.ts         # Unified pipeline configuration and execution
├── vocabulary-service.ts   # Database-backed vocabulary functionality
├── zAsyncIterable.ts       # tRPC async iterable utilities
└── README.md              # Library documentation
demo/                # Working demonstrations and examples
├── dataset-validation-demo.ts # Dataset-aware validation examples
├── integrated-demo.ts      # Complete pipeline demonstration
└── validation-demo.ts      # Comprehensive validation examples
test/                # Comprehensive test suite
├── validations.test.ts     # Core validation function tests (36 tests)
├── validation-executor.test.ts # Validation executor tests (13 tests)
├── worms-validation.test.ts # WoRMS taxonomic validation scenarios (9 tests)
└── *.test.ts              # Additional test files
```

### Database Schema
Uses Drizzle ORM with PostgreSQL. Key entities:
- **Users**: Basic user authentication
- **Projects**: User-owned projects containing multiple files
- **Source Files**: CSV/tabular data files within projects

### API Architecture
tRPC provides end-to-end type safety between client and server:
- All API calls are defined in `app/server/router.ts`
- Client-side tRPC setup in `app/client/trpc.ts`
- Automatic type inference for request/response data

### State Management
- **Server State**: React Query (via tRPC) for API data
- **Complex Local State**: XState machines for multi-step workflows
- **Form State**: TanStack React Form with Zod validation

### Key Development Patterns
- File-based routing with route-level code splitting
- Strict TypeScript with Zod schema validation
- Database-first approach with Drizzle schema generation
- Component composition using Headless UI primitives

### Environment Setup
Requires `DATABASE_URL` environment variable for PostgreSQL connection. Environment validation handled by `@t3-oss/env-core` in `env.ts`.

### Core Workflow
1. Users create projects to organize their biodiversity datasets
2. Upload CSV files to projects for processing
3. Configure mapping between source columns and Darwin Core fields
4. Apply transformations to normalize data formats
5. Validate transformed data against Darwin Core standards

## Validation System

DarwinKit includes a comprehensive, dataset-aware validation system designed for biodiversity data quality assurance.

### Core Validation Capabilities

**Basic Validations:**
- **Controlled vocabularies** with strict/loose modes and synonym matching
- **Data type validation** (string, number, boolean, date, integer) with type coercion
- **Date range validation** with future date restrictions and min/max date constraints
- **Coordinate validation** with proper latitude/longitude range checking
- **Pattern validation** using regular expressions
- **Range and length validation** for numeric and string data
- **Required field validation** with configurable empty value handling

**Dataset-Aware Validations:**
- **Uniqueness validation** - Detects duplicate values across entire datasets
- **Referential integrity** - Validates foreign key relationships within datasets
- **Cross-row consistency** - Ensures related records have consistent values
- **Sequential order validation** - Validates chronological or ordered data sequences

### WoRMS Integration Support

The validation system is architected to support taxonomic validation against external registries:

- **Scientific Name ID validation** against WoRMS (World Register of Marine Species)
- **Taxonomic consistency checks** across related fields (kingdom, family, genus, etc.)
- **Field dependency validation** ensuring taxonomic fields match authoritative records
- **Extensible architecture** for additional taxonomic registries

### Testing & Quality Assurance

**Comprehensive Test Suite:**
- 63 tests across 8 test files covering all validation scenarios
- Dataset-aware validation context testing
- WoRMS-specific validation scenarios
- Validation executor pipeline testing
- Error handling and edge case coverage

**Key Test Files:**
- `test/validations.test.ts` - Core validation functions (36 tests)
- `test/validation-executor.test.ts` - Pipeline execution (13 tests) 
- `test/worms-validation.test.ts` - Taxonomic validation scenarios (9 tests)

### Usage Patterns

**Standalone Validation:**
```typescript
import { validateControlledVocabulary, executeValidation } from './lib/validations.js';

const result = validateControlledVocabulary('male', {
  vocabularyName: 'sex',
  vocabularies: mockVocabularies
});
```

**Dataset-Aware Validation:**
```typescript
import { executeDatasetValidationWithContext } from './lib/validation-executor.js';

const results = executeDatasetValidationWithContext(dataset, validationConfig);
```

**Integrated Pipeline:**
```typescript
import { executeIntegratedPipeline } from './lib/integrated-executor.js';

const results = executeIntegratedPipeline(sourceData, integratedConfig);
```

## Development Guidelines

### Key Development Patterns
- File-based routing with route-level code splitting
- Strict TypeScript with comprehensive type safety
- Dataset-aware validation with full context access
- Modular validation functions that can work in isolation or as pipelines
- Database-first approach with Drizzle schema generation
- Component composition using Headless UI primitives

### Testing Requirements
- All validation functions must have comprehensive test coverage
- Dataset-aware validations require context testing
- WoRMS and taxonomic scenarios need specific test cases
- Pipeline execution must be tested end-to-end
- Error handling and edge cases must be covered

### Code Quality Standards
- Run `pnpm test` before committing changes
- Ensure `pnpm lint` passes without errors
- Follow existing patterns for validation function implementation
- Use TypeScript strictly - avoid `any` types
- Document complex validation logic and WoRMS integration patterns

### Code Organization
- **New functionality goes in `lib/`** - The core library directory for all validation, transformation, and utility functions
- **`app/util/` is deprecated** - Has been consolidated into `lib/` for better organization (see `app/util/README.md` for migration details)
- **Use `demo/` for examples** - Working demonstrations and test cases go in the demo directory
- **Comprehensive testing in `test/`** - All functionality must have corresponding test coverage