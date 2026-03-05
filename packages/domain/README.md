# @dwkt/domain

Domain layer for DarwinKit: types, schemas, and Darwin Core specifications.

## Overview

This package provides environment-agnostic domain models and logic. It contains no runtime dependencies (no DuckDB, no native modules) and works across any JavaScript runtime.

The intended purpose of this design is to allow any consumer or user of DarwinKit's inputs and outputs to develop their own domain-aware systems around it. For example, a simple configuration management tool could be built around the configuration schemas in a type safe manner, and be able to trust that the outputs of their tool are compatible with other systems using the same domain models.

At the moment, the [@dwkt/cli](/packages/cli) and [@dwkt/core](/packages/core) packages serve as good examples of how to use this package.

## Purpose

- Define TypeScript interfaces and types for DarwinKit data structures
- Provide Effect schemas for runtime validation
- Maintain Darwin Core field definitions and validation profiles
- Establish controlled vocabularies and constants

## Module Structure

```
src/
├── constants/    # Darwin Core vocabularies and constants
├── errors/       # Error codes and type definitions
├── schemas/      # Effect validation schemas
├── specs/        # Darwin Core specifications and profiles
│   └── profiles/ # Validation profiles (OBIS, GBIF, etc.)
└── types/        # TypeScript interfaces and types
```

### Key Modules

**Types** (`src/types/`)

- `field-mapping.ts` - Field mapping configuration types
- `validation-profile.ts` - Validation profile interfaces
- `workspace-config.ts` - Workspace configuration types
- `validation-violation.ts` - Validation error structures

**Schemas** (`src/schemas/`)

- Effect schemas for runtime validation of configuration files
- Schema-based parsing and encoding of workspace configs
- Type-safe validation with detailed error messages

**Specs** (`src/specs/`)

- Darwin Core field definitions generated to `src/specs/generated/dwcSchema.json`
- TypeScript-defined validation profiles for community standards
- Field normalization utilities for JSON-to-TypeScript conversion

## Darwin Core Specifications

DarwinKit uses a hybrid specification system:

### Base Schemas

Foundation specifications from official Darwin Core XML schemas:

- **Event** - Sampling event records
- **Occurrence** - Species occurrence data
- **Taxon** - Taxonomic information
- **ExtendedMeasurementOrFact** - Measurements and facts
- **dnaDerivedData** - DNA/genetic data

### Validation Profiles

TypeScript profiles extend base Darwin Core with community-specific requirements:

```typescript
// OBIS-Event profile extends Event with additional required fields
{
  id: "obis-event",
  extends: "Event",
  fields: {
    decimalLatitude: { required: true },
    decimalLongitude: { required: true },
    eventDate: { required: true }
  }
}
```

Profiles support inheritance via the `extends` property, allowing composition of validation rules.

## Usage

```typescript
import {
  // Constants
  DARWIN_CORE_TERMS,
  // Types
  type FieldMapping,
  // Specs
  getResolvedSpec,
  type Profile,
  type ResolvedSpec,
  type Spec,
  type WorkspaceConfig,
  // Schemas
  workspaceConfigSchema,
} from "@dwkt/domain";
```

### Validating Configuration

```typescript
import { Schema } from "effect";
import { workspaceConfigSchema } from "@dwkt/domain";

const result = Schema.decodeUnknownEither(workspaceConfigSchema)(configData);
```

### Working with Profiles

```typescript
import { getResolvedSpec } from "@dwkt/domain";

// Get a specific profile (inheritance is resolved automatically)
const eventProfile = getResolvedSpec("Event");

// Get a profile that extends another (e.g., obis-event extends Event)
const obisEventProfile = getResolvedSpec("obis-event");
```

## Dependencies

This package intentionally has minimal dependencies:

- `effect` - For schemas and functional utilities

No native modules, database drivers, or platform-specific code is included.
