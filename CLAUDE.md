# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- **Development server**: `pnpm dev` - Starts the Vinxi development server
- **Build**: `pnpm build` - Creates production build using Vinxi
- **Start production**: `pnpm start` - Starts the production server
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
└── util/            # Shared utilities
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