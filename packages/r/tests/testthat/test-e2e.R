# Integration tests that drive the real dwkt engine against a committed slice
# of the rocky-subtidal OBIS dataset (see fixtures/README.md). They skip cleanly
# when no dwkt binary (with `--format json`) is available, so they are a no-op
# on machines without a built engine.

# Resolve a binary without raising, so we can skip cleanly when absent.
find_bin <- function() {
  tryCatch(resolve_dwkt_bin(), error = function(e) "")
}

supports_format_json <- function(bin) {
  if (!nzchar(bin)) {
    return(FALSE)
  }
  help <- tryCatch(processx::run(bin, c("validate", "--help"), error_on_status = FALSE),
    error = function(e) NULL
  )
  if (is.null(help)) {
    return(FALSE)
  }
  # Look for the `--format` flag. A fixed-string match is robust to the ANSI
  # color codes the CLI emits right after the flag name (e.g. `--format\e[39m`),
  # and there is no sibling flag it could collide with. Check both streams since
  # --help may render to stdout or stderr depending on the CLI.
  grepl("--format", paste0(help$stdout, help$stderr), fixed = TRUE)
}

read_fixture <- function(name) {
  utils::read.csv(test_path("fixtures", name),
    check.names = FALSE, stringsAsFactors = FALSE
  )
}

# Build an OBIS kit from the committed fixtures, with realistic required/unique
# fields and the occurrence/eMOF -> event foreign keys. Callers can pass mutated
# data frames to exercise the failure paths.
fixture_kit <- function(events = read_fixture("hakaiFI_event.csv"),
                        occ = read_fixture("hakaiFI_occ.csv"),
                        emof = read_fixture("hakaiFI_eMOF.csv")) {
  dwk_init("rocky-subtidal", standard = "obis") |>
    dwk_dataset("events", "Event", events,
      required = c("eventID", "eventDate", "decimalLatitude", "decimalLongitude"),
      unique = "eventID"
    ) |>
    dwk_dataset("occurrence", "Occurrence", occ,
      required = c(
        "occurrenceID", "eventID", "scientificName",
        "basisOfRecord", "occurrenceStatus"
      ),
      unique = "occurrenceID"
    ) |>
    dwk_dataset("emof", "ExtendedMeasurementOrFact", emof,
      required = c("measurementID", "eventID", "measurementType", "measurementValue"),
      unique = "measurementID"
    ) |>
    dwk_relation("occurrence", "eventID", "events", "eventID") |>
    dwk_relation("emof", "eventID", "events", "eventID")
}

test_that("the OBIS fixture validates clean through the engine", {
  bin <- find_bin()
  skip_if(!nzchar(bin), "dwkt binary not found")
  skip_if(!supports_format_json(bin), "dwkt build lacks --format json")

  report <- dwk_validate(fixture_kit(), bin = bin)

  expect_s3_class(report, "dwk_report")
  expect_true(dwk_is_valid(report))
  for (ds in c("events", "occurrence", "emof")) {
    expect_true(dwk_is_valid(report, ds))
  }

  # Real Darwin Core validation ran: recommended/optional gaps surface as
  # non-error issues (warnings/info), never as errors on this clean data.
  issues <- dwk_issues(report)
  expect_gt(nrow(issues), 0)
  expect_true(all(issues$level != "error"))
})

test_that("the engine flags range + relational violations in the fixture", {
  bin <- find_bin()
  skip_if(!nzchar(bin), "dwkt binary not found")
  skip_if(!supports_format_json(bin), "dwkt build lacks --format json")

  events <- read_fixture("hakaiFI_event.csv")
  occ <- read_fixture("hakaiFI_occ.csv")
  events$decimalLatitude[1] <- 200 # out of range -> error
  occ$eventID[1] <- "hakaiFI-NO-SUCH-EVENT" # orphan foreign key -> error

  report <- dwk_validate(fixture_kit(events = events, occ = occ), bin = bin)
  expect_false(dwk_is_valid(report))

  # Latitude range error surfaces against events at the offending row.
  ev <- dwk_issues(report, "events")
  expect_true(any(ev$check == "RangeViolation" & ev$field == "decimalLatitude" &
    ev$level == "error"))
  expect_true(1L %in% ev$row[ev$check == "RangeViolation"])
  expect_false(dwk_is_valid(report, "events"))

  # Relational error surfaces against occurrence on the eventID foreign key.
  occ_issues <- dwk_issues(report, "occurrence")
  expect_true(any(occ_issues$check == "ForeignKeyViolation" &
    occ_issues$field == "eventID" & occ_issues$level == "error"))
})
