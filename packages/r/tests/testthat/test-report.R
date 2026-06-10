sample_json <- function() {
  list(
    overallStatus = "fail",
    datasetResults = list(
      list(
        datasetName = "events",
        schemaViolations = list(
          errors = list(
            list(
              `_tag` = "MissingFieldViolation", severity = "error",
              fieldName = "eventID", targetName = "eventID",
              errorMessage = "Required field eventID is not mapped"
            )
          ),
          warnings = list(), info = list()
        ),
        fieldViolations = list(
          errors = list(
            list(
              `_tag` = "RangeViolation", severity = "error",
              fieldName = "decimalLatitude", targetName = "decimalLatitude",
              errorMessage = "Value 200 is above maximum 90",
              rowNumber = 14, value = "200"
            )
          ),
          warnings = list(), info = list()
        )
      )
    )
  )
}

test_that("parse_report builds per-dataset issue tibbles keyed off raw _tag", {
  parsed <- parse_report(sample_json())

  expect_named(parsed, "events")
  expect_false(parsed$events$valid)

  issues <- parsed$events$issues
  expect_equal(nrow(issues), 2)
  expect_setequal(issues$check, c("MissingFieldViolation", "RangeViolation"))

  range_row <- issues[issues$check == "RangeViolation", ]
  expect_equal(range_row$level, "error")
  expect_equal(range_row$field, "decimalLatitude")
  expect_equal(range_row$row, 14L)
  expect_equal(range_row$value, "200")

  schema_row <- issues[issues$check == "MissingFieldViolation", ]
  expect_true(is.na(schema_row$row))
})

test_that("a dataset with no error-severity issues is valid", {
  json <- list(datasetResults = list(
    list(
      datasetName = "clean",
      schemaViolations = list(errors = list(), warnings = list(), info = list()),
      fieldViolations = list(errors = list(), warnings = list(), info = list())
    )
  ))
  parsed <- parse_report(json)
  expect_true(parsed$clean$valid)
  expect_equal(nrow(parsed$clean$issues), 0)
})

sample_report <- function() {
  clean <- list(
    datasetName = "clean",
    schemaViolations = list(errors = list(), warnings = list(), info = list()),
    fieldViolations = list(errors = list(), warnings = list(), info = list())
  )
  json <- sample_json()
  json$datasetResults[[2]] <- clean
  new_dwk_report(parse_report(json))
}

test_that("dwk_is_valid reports overall and per-dataset validity", {
  report <- sample_report()
  expect_false(dwk_is_valid(report)) # events has errors
  expect_false(dwk_is_valid(report, "events"))
  expect_true(dwk_is_valid(report, "clean"))
})

test_that("dwk_is_valid errors on a dataset absent from the report", {
  expect_error(dwk_is_valid(sample_report(), "nope"), "No dataset 'nope'")
})

test_that("accessors reject non-report objects", {
  expect_error(dwk_is_valid(list()), "expects a dwk_report")
  expect_error(dwk_issues(list()), "expects a dwk_report")
})

test_that("dwk_issues binds all datasets with a leading dataset column", {
  issues <- dwk_issues(sample_report())
  expect_equal(
    names(issues),
    c("dataset", "check", "level", "field", "row", "message", "value")
  )
  expect_equal(nrow(issues), 2)
  expect_equal(unique(issues$dataset), "events")
})

test_that("dwk_issues filters to one dataset and errors on unknown names", {
  report <- sample_report()
  expect_equal(nrow(dwk_issues(report, "clean")), 0)
  expect_error(dwk_issues(report, "nope"), "No dataset 'nope'")
})

test_that("dwk_issues keeps the canonical shape when there are no issues", {
  issues <- dwk_issues(sample_report(), "clean")
  expect_equal(
    names(issues),
    c("dataset", "check", "level", "field", "row", "message", "value")
  )
})

test_that("print.dwk_report summarizes per-dataset status", {
  expect_output(print(sample_report()), "events: INVALID \\(2 issue\\(s\\)\\)")
  expect_output(print(sample_report()), "clean: valid")
})
