---
title: "Validation"
nav_order: 4
description: "Validate your datasets against Darwin Core and repository profiles."
---

# Validation

Run validation against your config:

```bash
# Auto-discover darwinkit.yaml in the current or parent directories
dwkit validate

# Specify a config path
dwkit validate --config ./darwinkit.yaml

# JSON output
dwkit validate --format json
```

## What gets checked

- **Field mappings** — source columns are mapped to valid Darwin Core terms.
- **Profiles** — the `standard.variant` (e.g. OBIS, GBIF) applies
  community-specific obligations and constraints on top of the base spec.
- **Controlled vocabularies** — fields with controlled vocabularies are checked
  against the allowed values.
- **Types & ranges** — dates, coordinates, and other typed fields must match
  expected formats and ranges (e.g. `decimalLatitude` in −90…90).
- **Uniqueness** — identifier fields flagged unique must not contain duplicates.
- **Cross-dataset rules** — foreign keys and dependency rules across datasets.

Results are written to the configured `outputDir` and summarized on the
terminal (errors, warnings, and info).
