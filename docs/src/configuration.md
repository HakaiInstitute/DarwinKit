---
title: "Configuration"
nav_order: 3
nav_section: "Usage"
description: "The darwinkit.yaml configuration file: datasets, field mappings, and rules."
---

# Configuration

DarwinKit is driven by a `darwinkit.yaml` file describing your datasets and how
their columns map to Darwin Core.

```yaml
id: marine-survey-2024
name: Marine Survey 2024
version: 1.0.0
standard:
  base: darwin-core
  variant: obis          # drives obligation lookup (OBIS, GBIF, …)
validation:
  nullValues: [NA, "N/A", "", "NULL", "null"]
  failFast: false
  outputDir: ./validation_results
  datasets:
    - name: events
      class: Event         # Darwin Core class (Event, Occurrence, Taxon, …)
      path: ./data/events.csv
      fieldMappings:
        - originName: event_id
          targetName: eventID
          requirement: required
        - originName: sample_date
          targetName: eventDate
          requirement: required
    - name: occurrences
      class: Occurrence
      path: ./data/occurrences.csv
      fieldMappings:
        - originName: occurrence_id
          targetName: occurrenceID
          requirement: required
        - originName: event_id
          targetName: eventID
          requirement: required
datasetRules:
  - ruleType: foreignKey
    sourceDataset: occurrences
    sourceField: eventID
    targetDataset: events
    targetField: eventID
```

## Key fields

- **`standard`** — either a string (`"darwin-core"`) or an object
  `{ base, variant }`. The `variant` (e.g. `obis`, `gbif`) selects which
  community obligations apply.
- **`datasets[].class`** — the Darwin Core class for the dataset (`Event`,
  `Occurrence`, `Taxon`, …).
- **`fieldMappings`** — map each source column (`originName`) to a Darwin Core
  term (`targetName`), with a `requirement` (`required`, `recommended`,
  `optional`).
- **`datasetRules`** — cross-dataset rules such as foreign keys that enforce
  referential integrity between CSVs.
