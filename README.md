# DarwinKit

[![Test Suite](https://github.com/HakaiInstitute/DarwinKit/actions/workflows/test.yml/badge.svg)](https://github.com/HakaiInstitute/DarwinKit/actions/workflows/test.yml)

A modular biodiversity data processing toolkit for mapping tabular data to Darwin Core standards.

## Architecture

DarwinKit is organized as a Deno workspace with separate packages:

- **@dwkt/shared** - Universal types, schemas, and constants (works in browser and Node.js)
- **@dwkt/core** - Core business logic and Node.js-specific implementations 
- **@dwkt/cli** - Command-line interface for data processing
- **@dwkt/api** - HTTP API server
- **@dwkt/gui** - Web-based user interface

## Quick Start

### Prerequisites

- [Deno 2.0+](https://deno.land/) with workspace support
- PostgreSQL database (optional, for user authentication)

### Development

```bash
# Start both API server and GUI
deno task dev

# This runs:
# - API server on http://localhost:3001  
# - GUI development server on http://localhost:3000
```

### CLI Usage

```bash
# List workspaces
deno task dev:cli workspace list

# Create workspace from CSV
deno task dev:cli workspace create "Marine Survey 2024" /path/to/survey-data.csv

# Show workspace details and schema  
deno task dev:cli workspace show <workspace-id>
```

### Individual Package Development

```bash
# Work on specific packages
deno task dev:api      # API server only (port 3001)
deno task dev:gui      # GUI dev server only (port 3000)
deno task dev:cli      # Run CLI commands interactively

# Testing and Quality
deno test              # Run all tests
deno test:e2e          # Run end-to-end tests
deno fmt               # Format code
deno lint              # Lint TypeScript files
```

## Package Structure

```
packages/
├── shared/           # Universal code (browser + Node.js compatible)
│   ├── types/        # TypeScript interfaces
│   ├── schemas/      # Zod validation schemas  
│   ├── errors/       # Error codes and types
│   └── constants/    # Darwin Core vocabularies
│
├── core/            # Backend business logic (Node.js only)
│   ├── workspace/   # Workspace management
│   ├── parsing/     # CSV parsing with DuckDB
│   └── database/    # PostgreSQL client
│
├── cli/             # Command-line interface
│   ├── commands/    # CLI commands
│   └── formatters/  # Terminal output formatting
│
├── api/             # HTTP API server
│   └── routes/      # API routes (workspaces, auth)
│
└── gui/             # Web interface
    ├── components/  # React components
    ├── routes/      # Frontend routes  
    └── api/         # API client
```

## Development Workflow

The Deno workspace architecture provides:

1. **Modular development** - Work on packages independently or together
2. **Shared type safety** - Common schemas ensure consistency across all packages
3. **Platform separation** - Universal code (shared) vs Node-specific (core) vs browser (GUI)
4. **No installation friction** - Deno handles dependencies automatically
5. **Independent deployment** - Each package can be built and deployed separately

## Core Concepts

### Workspaces
Self-contained environments for processing CSV biodiversity data with automatic schema inference, sample extraction, and Darwin Core mapping tools. Each workspace stores parsed metadata as JSON files for portability and caching.

### Schema Inference  
Uses DuckDB to automatically detect column types, extract sample values, and analyze data structure without loading entire files into memory. Supports large datasets with configurable sampling strategies.

### Darwin Core Mapping
Interactive tools for mapping source columns to Darwin Core standard fields, with validation against controlled vocabularies and support for data transformation rules.

---

## Why DarwinKit?

### We work with DwC data

Our team works with biodiversity and genomics data. When we collect our data, we're collecting data which typically adheres to DwC.

### However, we don't record it as DwC data

Unfortunately, we tend to collect this data using labels and formats which aren't quite compatible with DwC; at least, not directly. They need mild re-labelling and coercion to adhere to the standard.

### DwC is a large, complex standard with hundreds of fields

I believe part of why we don't work off of the standard is because it's a non-trivial task to learn it, retain what you've learned, and apply it. This tool aims to address that problem by using several strategies to reduce this innate friction.

### Common problems we encounter

Biodiversity and genomics teams face recurring data challenges:

- **Coordinate inconsistencies**: GPS data recorded as "45.5231 N, 74.0060 W" instead of decimal degrees, breaking downstream GIS analysis
- **Taxonomic ambiguity**: Species names like "Atlantic salmon" or local names that don't validate against authoritative registries like WoRMS
- **Date format chaos**: Collection dates as "June 15th, 2023", "15/6/23", or "2023-165" (Julian) requiring manual parsing
- **Measurement unit confusion**: Depths in meters vs fathoms, temperatures in Celsius vs Fahrenheit, without clear metadata
- **Sample metadata gaps**: Missing or inconsistent specimen preparation methods, preservation protocols, or collection instruments

### Adhering to standards lets us work cleaner, better, and faster

At the moment, we write bespoke scripts which are tailored to specific datasets. We face issues such as:

- These datasets come from study designs which are not based on DwC. Many of the outputs are not as clean as they could be, but improvements require extensive scripting
- Modifying the script requires someone very technical with a programming environment configured
- Scripts become unmaintainable as team members leave or priorities shift
- Each new dataset requires starting from scratch, even when similar to previous work

Ensuring we stay close to the DwC standard provides us with many advantages with little investment.

1. **Clear communication**: When we all speak the same language, we communicate better and make fewer mistakes
2. **Automatic compatibility**: Datasets become compatible with each other without manual intervention
3. **Reusable analysis**: R scripts for biodiversity analysis work across projects when data follows the same structure  
4. **Tool interoperability**: GBIF, iNaturalist, and other platforms can directly ingest standardized data
5. **Quality assurance**: Validation catches errors before they propagate through analysis pipelines

## License

MIT
