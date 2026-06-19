# Test fixtures: rocky-subtidal OBIS data

These CSVs are a small, derived slice of the Hakai **Rocky Subtidal Fish and
Invertebrate Community Surveys** Darwin Core dataset, used by the R package's
integration test (`tests/testthat/test-e2e.R`) to validate real, well-formed
Darwin Core data end to end through the `dwkt` engine.

| File | Darwin Core class | Rows |
| --- | --- | --- |
| `hakaiFI_event.csv` | Event | 4 (project root → site/date → 2 transects) |
| `hakaiFI_occ.csv` | Occurrence | 13 (one fish transect + one invertebrate survey) |
| `hakaiFI_eMOF.csv` | ExtendedMeasurementOrFact | 15 (incl. 2 event-level measurements) |

The slice is deliberately tiny so it is reviewable in a diff and fast to
validate on every CI run, while keeping the `eventID` / `occurrenceID` foreign
keys and the `parentEventID` hierarchy fully consistent. As committed it
validates with **zero errors** (warnings/info only) under the OBIS profile.

## Provenance

- **Source:** [`HakaiInstitute/rocky-subtidal-fish-invertebrate`](https://github.com/HakaiInstitute/rocky-subtidal-fish-invertebrate),
  the `external/rocky-subtidal-fish-invertebrate` submodule, commit `ce67cf2`.
- **License:** Rocky Subtidal Fish and Invertebrate Community Surveys © Tula
  Foundation, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The submodule is SSH-only, so CI does **not** check it out — these fixtures are
committed and the tests never reach for it.

## Regenerating

With the submodule checked out, run from the repo root:

```bash
git submodule update --init external/rocky-subtidal-fish-invertebrate
deno run --allow-read --allow-write \
  packages/r/tests/testthat/fixtures/make-fixtures.ts
```

`make-fixtures.ts` selects the curated leaf events, pulls in their parent chain,
and keeps only the occurrences and measurements whose foreign keys resolve
within the slice.
