---
title: "Transform"
nav_order: 5
nav_section: "Usage"
description: "Transform mapped data into Darwin Core output."
---

# Transform

Once your mappings validate, transform the data into Darwin Core-shaped output:

```bash
dwkit transform --config ./darwinkit.yaml
```

Transform applies the same `fieldMappings` from your `darwinkit.yaml` — renaming
columns to their Darwin Core `targetName` — and writes the results to the
configured output location as CSV (LF line endings, header row).
