# darwinkit

R interface to the [DarwinKit](https://github.com/HakaiInstitute/DarwinKit)
Darwin Core validator. Build a validation config from data frames with
pipeable verbs, then validate against the `dwkt` engine; the same engine
the DarwinKit CLI uses.

## Install the engine

The package shells out to the `dwkt` binary:

```sh
# macOS
curl -L -o dwkt https://github.com/HakaiInstitute/DarwinKit/releases/latest/download/dwkt-macos && chmod +x dwkt
# Linux
curl -L -o dwkt https://github.com/HakaiInstitute/DarwinKit/releases/latest/download/dwkt-linux && chmod +x dwkt
```

Put it on your `PATH` as `dwkt`, or point the `DARWINKIT_BIN` environment
variable at it.

## Quickstart

```r
library(darwinkit)

kit <- dwk_init("FC2022 survey", description = "Marine survey 2022") |>
  dwk_null_values(c("NA", "N/A", "", "NULL", "null")) |>
  dwk_dataset("events", "Event", event_table,
              required = c("eventID", "decimalLatitude"),
              unique = "eventID") |>
  dwk_dataset("occurrences", "Occurrence", occ_table) |>
  dwk_relation("occurrences", "eventID", "events", "eventID")

report <- dwk_validate(kit)

report                        # per-dataset summary
dwk_is_valid(report)          # overall TRUE/FALSE
dwk_issues(report)            # tidy tibble: dataset, check, level, field, row, message, value
```

Verbs are immutable: each returns a modified copy, so reassign (`kit <-
kit |> ...`) when building incrementally.

## Keeping the generated config

`dwk_validate()` stages your data (as Parquet) plus a generated
`darwinkit.yaml` into a temporary directory. To keep that shadow workspace —
for git, or to run the CLI directly — you can stage it in your project:

```r
dwk_stage(kit, "darwinkit/")                       # stage only
dwk_validate(kit, stage_dir = "darwinkit/")        # stage there and validate
```

This allows you to run the validation outside of R whenever you need to, such as
in a CI/CD pipeline like GitHub Actions or GitLab CI.

The staged directory is self-contained (relative paths), so
`dwkt validate --config darwinkit/darwinkit.yaml` works from anywhere.

## Submission CSVs

```r
dwk_write_csv(kit, "output/")   # stringified columns, NA -> ""
```

## Development

```sh
Rscript -e 'testthat::test_local("packages/r")'
```

The end-to-end test self-skips unless a `dwkt` build supporting
`--format json` is available (set `DARWINKIT_BIN`).
