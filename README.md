# DarwinKit

[![Code Quality & Tests](https://github.com/HakaiInstitute/DarwinKit/actions/workflows/code-quality.yml/badge.svg)](https://github.com/HakaiInstitute/DarwinKit/actions/workflows/code-quality.yml)

A configuration-driven toolkit for validating and transforming biodiversity data to Darwin Core standards.

## What It Does

DarwinKit maps, transforms, and validates raw biodiversity data to the Darwin Core standard so you can share your research with the world more easily.

### The Problem

Biodiversity data is often collected in a form that's convenient for research or field work rather than compliant with Darwin Core standards. However, the repositories to which we tend to submit our data (OBIS, GBIF, BOLD, etc.) tend to require it to comply with the standard. Worse yet, you can't be certain that the data is entirely valid until you've submitted it, and each repository has its own set of validation rules.

We might correct this manually or write bespoke scripts to process and transform the data, perhaps even validate it, but this is a time-consuming and error-prone process with variable results. This has proven to be a bottleneck and time-sink at Hakai, requiring significant resources and effort.

### The Solution

DarwinKit validates CSV biodiversity data against Darwin Core specifications using a JSON configuration file. It checks field mappings, renames columns, can enforce referential integrity across related datasets, validate controlled vocabularies, and ensure other types of data quality before submission to biodiversity repositories. It takes the guess-work and wheel-reinvention out of biodiversity data preparation.

If you know how your data should be mapped to Darwin Core, you can use DarwinKit to validate and transform your data with as little as a JSON configuration file.

## Quick Start

**Prerequisites**:

Install [Deno 2.0+](https://deno.land/)

MacOS/Linux
```bash
curl -fsSL https://deno.land/install.sh | sh
```

Windows
```bash
irm https://deno.land/install.ps1 | iex
```

Create a `darwinkit.json` configuration file:

```json
{
  "name": "Marine Survey 2024",
  "datasets": [
    {
      "name": "events",
      "spec": "dwc-event",
      "path": "./data/events.csv",
      "fieldMappings": [
        {"originName": "event_id", "targetName": "eventID", "isRequired": true},
        {"originName": "sample_date", "targetName": "eventDate", "isRequired": true},
        {"originName": "latitude", "targetName": "decimalLatitude", "isRequired": true},
        {"originName": "longitude", "targetName": "decimalLongitude", "isRequired": true}
      ]
    },
    {
      "name": "occurrences",
      "spec": "dwc-occurrence",
      "path": "./data/occurrences.csv",
      "fieldMappings": [
        {"originName": "occurrence_id", "targetName": "occurrenceID", "isRequired": true},
        {"originName": "event_id", "targetName": "eventID", "isRequired": true},
        {"originName": "species_name", "targetName": "scientificName", "isRequired": true}
      ]
    }
  ],
  "crossDatasetRules": [
    {
      "ruleType": "foreignKey",
      "sourceDataset": "occurrences",
      "sourceField": "eventID",
      "targetDataset": "events",
      "targetField": "eventID"
    }
  ]
}
```

Run validation:

```bash
# If using the default config location in the root directory
deno task dev:cli validate
# target a specific configuration
deno task dev:cli validate --config ./my-config.json

# Or if using the compiled binary...
dwc validate
# or
dwc validate --config ./my-config.json
```

This validates field mappings, checks data types (dates, coordinates), enforces controlled vocabularies, and verifies foreign key relationships between datasets.

Transform data to Darwin Core format:

```bash
# Transform datasets according to field mappings
deno task dev:cli transform --config ./my-config.json --output ./output

# Or with the compiled binary
dwc transform --config ./my-config.json --output ./output
```

This applies the field mappings from your config, renaming columns to Darwin Core standard names and writing the transformed CSV files to the output directory.

Update local schema file:

Convert Darwin Core xml schemas to json

```bash
deno run external/get_dc_schema.cjs
```

## Architecture

DarwinKit is a Deno workspace with five packages:

- **@dwkt/domain**
  - Domain-specific logic for Darwin Core data validation and transformation
  - Darwin Core specifications, validation schemas, and type definitions
  - Environment-agnostic
- **@dwkt/core**
  - Business logic using DuckDB for CSV parsing, validation, and transformation
  - Exposes the functionality of the library to clients, such as web interfaces, CLIs, cross-runtime wrappers, and APIs.
  - Language-neutral interface which allows DarwinKit to be used by any runtime which executes JavaScript (directly or via bridge libraries) or a local binary.
- **@dwkt/cli**
  - Command-line interface for running validation and transformation pipelines
  - Serves as an example of how to use the core package
- **@dwkt/api**
  - HTTP API server (minimal implementation)
  - TODO
- **@dwkt/gui**
  - React web interface (minimal implementation)
  - TODO

### DuckDB

DuckDB is a core component in the transformation and validation pipelines. It provides:

- **Schema inference** - Automatic detection of column types and structure
- **Type validation** - SQL-based checking of dates, coordinates, and numeric ranges
- **Cross-dataset queries** - Foreign key validation across multiple CSV files using JOIN operations
- **Sample extraction** - Quick preview of field values for mapping configuration

## Development

```bash
# Run validation from config
deno task dev:cli validate

# Start API and GUI servers
deno task dev

# Run tests
deno test

# Format and lint
deno fmt && deno lint
```

## License

MIT
