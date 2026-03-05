# DarwinKit

[![Code Quality & Tests](https://github.com/HakaiInstitute/DarwinKit/actions/workflows/code-quality.yml/badge.svg)](https://github.com/HakaiInstitute/DarwinKit/actions/workflows/code-quality.yml)

A configuration-driven toolkit for validating and transforming biodiversity data to Darwin Core standards.

## What It Does

DarwinKit maps, transforms, and validates raw biodiversity data to the Darwin Core standard so you can share your research with the world more easily.

### The Problem

Biodiversity data is often collected in a form that's convenient for research or field work rather than compliant with Darwin Core standards. However, the repositories to which we tend to submit our data (OBIS, GBIF, BOLD, etc.) tend to require it to comply with the standard. Worse yet, you can't be certain that the data is entirely valid until you've submitted it, and each repository has its own superset of validation rules.

We can correct this manually or write bespoke scripts to process and transform the data, perhaps even validate it, but this is a time-consuming and error-prone process with variable results. This has proven to be a bottleneck and time-sink, absorbing significant resources and effort.

### The Solution

DarwinKit validates CSV biodiversity data against Darwin Core specifications (and repository supersets) using a YAML configuration file. It checks field mappings, renames columns, can enforce referential integrity across related datasets, validate controlled vocabularies, and ensure other types of data quality before submission to biodiversity repositories. It takes the guess-work and wheel-reinvention out of biodiversity data preparation.

If you know how your data should be mapped to Darwin Core, you can use DarwinKit to validate and transform your data with as little as a YAML configuration file.

## Quick Start

> [!NOTE]
> DarwinKit is currently used as a CLI. It's not yet published or available for download. In the meantime, you can use it via `deno` as described below.
> Talk to @HakaiInstitute/steveadams or @HakaiInstitute/fostermh for support!

**Prerequisites**: [Deno 2.0+](https://deno.land/)

```bash
# macOS/Linux
curl -fsSL https://deno.land/install.sh | sh

# Windows
irm https://deno.land/install.ps1 | iex
```

Create a `darwinkit.yaml` configuration file:

```yaml
id: marine-survey-2024
name: Marine Survey 2024
version: 1.0.0
createdAt: "2024-01-01T00:00:00.000Z"
updatedAt: "2024-01-01T00:00:00.000Z"
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
    - name: events
      spec: dwc-event
      path: ./data/events.csv
      fieldMappings:
        - originName: event_id
          targetName: eventID
          requirement: required
        - originName: sample_date
          targetName: eventDate
          requirement: required
        - originName: latitude
          targetName: decimalLatitude
          requirement: required
        - originName: longitude
          targetName: decimalLongitude
          requirement: required
    - name: occurrences
      spec: dwc-occurrence
      path: ./data/occurrences.csv
      fieldMappings:
        - originName: occurrence_id
          targetName: occurrenceID
          requirement: required
        - originName: event_id
          targetName: eventID
          requirement: required
        - originName: species_name
          targetName: scientificName
          requirement: required
datasetRules:
  - ruleType: foreignKey
    sourceDataset: occurrences
    sourceField: eventID
    targetDataset: events
    targetField: eventID
```

Run validation:

```bash
deno task cli validate
deno task cli validate --config ./my-config.yaml
```

Transform data to Darwin Core format:

```bash
deno task cli transform --config ./my-config.yaml
```

## Project Structure

DarwinKit is a Deno workspace with three packages:

| Package                                   | Description                                           |
| ----------------------------------------- | ----------------------------------------------------- |
| [@dwkt/domain](packages/domain/README.md) | Domain types, schemas, and Darwin Core specifications |
| [@dwkt/core](packages/core/README.md)     | Core business logic for validation and transformation |
| [@dwkt/cli](packages/cli/README.md)       | Command-line interface                                |

## Development

```bash
deno task test   # Run all tests
deno fmt         # Format code
deno lint        # Lint code
```

See individual package READMEs for package-specific commands.

## Project Board

Track development progress: [DarwinKit Project Board](https://github.com/orgs/HakaiInstitute/projects/30)

## License

MIT
