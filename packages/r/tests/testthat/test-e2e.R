# Resolve a binary without raising, so we can skip cleanly when absent.
find_bin <- function() {
  tryCatch(resolve_dwkt_bin(), error = function(e) "")
}

supports_output_json <- function(bin) {
  if (!nzchar(bin)) {
    return(FALSE)
  }
  help <- tryCatch(processx::run(bin, c("validate", "--help"), error_on_status = FALSE),
    error = function(e) NULL
  )
  if (is.null(help)) {
    return(FALSE)
  }
  # Match the standalone `--output` flag (followed by whitespace or `=`), NOT a
  # substring of `--output-dir` / `--outputDir`. Check both streams since --help
  # may render to stdout or stderr depending on the CLI.
  grepl("--output[[:space:]=]", paste0(help$stdout, help$stderr))
}

test_that("deno engine flags range + relational violations end to end", {
  bin <- find_bin()
  skip_if(!nzchar(bin), "dwkt binary not found")
  skip_if(!supports_output_json(bin), "dwkt build lacks --output json")

  kit <- dwk_init("e2e", description = "d") |>
    dwk_dataset("events", "Event", tibble::tibble(
      eventID = c("E1", "E2"),
      eventDate = c("2020-01-01", "2020-01-02"),
      decimalLatitude = c(48.5, 200), # 200 is out of range -> error
      decimalLongitude = c(-123.3, -123.4)
    )) |>
    dwk_dataset("occurrence", "Occurrence", tibble::tibble(
      occurrenceID = c("O1", "O2"),
      eventID = c("E1", "E9"), # E9 has no parent event -> relational error
      scientificName = c("Gadus", "Clupea"),
      basisOfRecord = c("HumanObservation", "HumanObservation"),
      occurrenceStatus = c("present", "present")
    )) |>
    dwk_relation("occurrence", "eventID", "events", "eventID")

  report <- dwk_validate(kit, bin = bin)

  # Latitude range error surfaces against the events dataset at the offending row.
  ev <- dwk_issues(report, "events")
  expect_true(any(ev$field == "decimalLatitude" & ev$level == "error"))
  expect_true(2L %in% ev$row[ev$field == "decimalLatitude"])
  expect_false(dwk_is_valid(report, "events"))

  # Relational error surfaces against occurrence on the eventID foreign key.
  occ <- dwk_issues(report, "occurrence")
  expect_true(any(occ$field == "eventID" & occ$level == "error"))
})
