# A runner stub: returns `json` and records the (bin, args) it was called with
# in the caller's environment via `seen`.
stub_runner <- function(json, status = 0, seen = NULL) {
  function(bin, args) {
    if (!is.null(seen)) {
      seen$bin <- bin
      seen$args <- args
    }
    list(stdout = json, stderr = "", status = status)
  }
}

clean_json <- function() {
  jsonlite::toJSON(list(
    datasetResults = list(list(
      datasetName = "events",
      schemaViolations = list(errors = list(), warnings = list(), info = list()),
      fieldViolations = list(errors = list(), warnings = list(), info = list())
    ))
  ), auto_unbox = TRUE)
}

violation_json <- function() {
  jsonlite::toJSON(list(
    datasetResults = list(list(
      datasetName = "events",
      schemaViolations = list(errors = list(), warnings = list(), info = list()),
      fieldViolations = list(
        errors = list(list(
          `_tag` = "RangeViolation", severity = "error",
          fieldName = "decimalLatitude", targetName = "decimalLatitude",
          errorMessage = "out of range", rowNumber = 1, value = "200"
        )),
        warnings = list(), info = list()
      )
    ))
  ), auto_unbox = TRUE)
}

simple_kit <- function() {
  dwk_init("t") |>
    dwk_dataset("events", "Event", tibble::tibble(eventID = "E1"))
}

test_that("dwk_validate parses engine output into a dwk_report", {
  report <- dwk_validate(simple_kit(), runner = stub_runner(violation_json(), status = 1))
  expect_s3_class(report, "dwk_report")
  expect_false(dwk_is_valid(report))
  expect_equal(dwk_issues(report)$check, "RangeViolation")
})

test_that("dwk_validate stages a config and passes it to the runner", {
  seen <- new.env()
  dwk_validate(simple_kit(), runner = stub_runner(clean_json(), seen = seen))
  expect_equal(seen$args[[1]], "validate")
  cfg <- seen$args[[which(seen$args == "--config") + 1]]
  expect_equal(basename(cfg), "darwinkit.yaml")
  expect_true(file.exists(cfg))
  expect_true(all(c("--output", "json") %in% seen$args))
})

test_that("stage_dir persists the shadow workspace", {
  stage <- withr::local_tempdir()
  report <- dwk_validate(simple_kit(),
    stage_dir = stage,
    runner = stub_runner(clean_json())
  )
  expect_true(dwk_is_valid(report))
  expect_true(file.exists(file.path(stage, "darwinkit.yaml")))
  expect_true(file.exists(file.path(stage, "events.parquet")))
})

test_that("dwk_validate errors with stderr context when dwkt emits nothing", {
  expect_error(
    dwk_validate(simple_kit(), runner = function(bin, args) {
      list(stdout = "", stderr = "boom", status = 2)
    }),
    "no output \\(status 2\\): boom"
  )
})

test_that("dwk_validate refuses an empty kit before resolving any binary", {
  expect_error(dwk_validate(dwk_init("t")), "no datasets")
})

test_that("dwk_validate rejects JSON that is not a validation result", {
  expect_error(
    dwk_validate(simple_kit(), runner = stub_runner('{"error": "config not found"}')),
    "without datasetResults"
  )
})

test_that("dwk_validate rejects non-JSON stdout with dwkt context", {
  expect_error(
    dwk_validate(simple_kit(), runner = function(bin, args) {
      list(stdout = "usage: dwkt validate [options]", stderr = "", status = 64)
    }),
    "did not return JSON \\(status 64\\)"
  )
})
