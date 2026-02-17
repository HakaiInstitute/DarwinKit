# DarwinKit - Copilot Instructions

DarwinKit is a modular TypeScript application for mapping tabular biodiversity data to the Darwin Core standard. It provides a CLI for validating and transforming biodiversity datasets.

## Tech Stack

- **Runtime**: Deno 2.0+ with workspace support
- **CLI**: Cliffy framework
- **Error Handling & Schemas**: Effect library (functional pipelines, Schema validation, dependency injection)
- **Data Processing**: DuckDB (CSV parsing, schema inference, validation operations)
- **Testing**: Deno test runner

## Package Architecture

The codebase is a Deno workspace with three packages. Dependencies flow in one direction: `cli → core → domain`.

**@dwkt/domain** (`packages/domain/`) — Domain layer: types, schemas, field definitions, business rules. Lightweight with no heavy dependencies (no DuckDB, no native modules). Must work in both browser and server environments.

**@dwkt/core** (`packages/core/`) — Core functionality: workspace operations, validation, transformation. Uses DuckDB for data operations. Imports from `@dwkt/domain`.

**@dwkt/cli** (`packages/cli/`) — Command-line interface. Thin wrapper around core functionality with terminal output formatting. Imports from both `@dwkt/domain` and `@dwkt/core`.

## Development Commands

- `deno task test:domain` — Test domain package
- `deno task test:core` — Test core package
- `deno task test:cli` — Test CLI package
- `deno task test:integration` — Run integration tests
- `deno lint` — Lint TypeScript files
- `deno fmt` — Format code
- `deno task cli import` — Regenerate Darwin Core schema from external XML sources

The generated schema at `packages/domain/src/specs/generated/dwcSchema.json` is gitignored and must be regenerated via `deno task cli import` before running tests.

## Coding Conventions

- Use TypeScript strictly — never use `any` types, avoid `unknown` unless technically correct
- Prefer composition over inheritance and dependency injection
- Prefer interfaces over singletons
- Keep explicit data flow and dependencies — explicit over implicit
- Follow existing patterns within each package
- Keep code simple and focused — avoid premature abstractions

## Error Handling

DarwinKit uses Effect's two-error-types model:

**Expected errors** (`Effect.fail`) — Recoverable domain errors the user can fix: file not found, invalid CSV data, validation failures, configuration errors.

**Defects** (`Effect.die` / `Effect.orDie`) — System failures indicating bugs: database connection failures, infrastructure query errors, JSON parsing failures on self-generated data.

Decision framework: If the user can fix it, use `Effect.fail`. If it's a system failure or programming error, use `Effect.die`.

## Key Patterns

**Workspace resource management** — Uses `Effect.acquireRelease` for DuckDB connection lifecycle. `Workspace` class requires `Scope.Scope` — use `Effect.scoped` for automatic cleanup. `WorkspaceService` uses `Context.Tag` for dependency injection in long-lived scenarios.

**Domain-first types** — Define interfaces and schemas in `@dwkt/domain` before implementing in `@dwkt/core`.

**Darwin Core specifications** — A hybrid system combining generated JSON schemas (from `dwcSchema.json`) with TypeScript validation profiles (OBIS, GBIF). Profile resolution checks TypeScript profiles first, then falls back to JSON, with recursive inheritance via `extends`.

## Testing

- Test behavior, not implementation details
- One assertion per test when possible
- Use clear test names that describe the scenario
- Tests must be deterministic
- Use existing test utilities and helpers
- Never disable tests — fix them instead

## Code Organization

- Domain types and schemas → `packages/domain/src/types/` and `packages/domain/src/schemas/`
- Darwin Core specifications → `packages/domain/src/specs/`
- Business logic → `packages/core/src/`
- CLI commands → `packages/cli/src/cmd/`
- Test utilities → `test/helpers/`

## Security Context

SQL injection is not a risk — the application processes user-owned CSV files against local in-memory DuckDB instances with no multi-tenant or network-exposed SQL surface. Table and column names are sanitized via `sanitizeTableName()` as defense-in-depth.
