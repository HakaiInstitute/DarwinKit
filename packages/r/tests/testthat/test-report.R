# One (tag, level) violation spec, and a one-dataset dwk_report built from a list
# of them via the real parse_report() + new_dwk_report() internals.
vspec <- function(tag, level) list(tag = tag, level = level)

make_report <- function(specs, dataset = "events", name = "Test") {
  bucket <- function(sev) {
    items <- Filter(function(s) s$level == sev, specs)
    lapply(seq_along(items), function(i) {
      s <- items[[i]]
      list(
        `_tag` = s$tag, severity = s$level,
        fieldName = "f", targetName = "f",
        errorMessage = paste(s$tag, i), rowNumber = i, value = as.character(i)
      )
    })
  }
  json <- list(datasetResults = list(list(
    datasetName = dataset,
    schemaViolations = list(errors = list(), warnings = list(), info = list()),
    fieldViolations = list(
      errors = bucket("error"), warnings = bucket("warning"), info = bucket("info")
    )
  )))
  new_dwk_report(parse_report(json), name = name)
}

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

test_that("format_issue_lines aligns columns and renders NA as a dash", {
  issues <- tibble::tibble(
    dataset = c("events", "events"),
    check = c("RangeViolation", "MissingFieldViolation"),
    level = c("error", "error"),
    field = c("decimalLatitude", NA_character_),
    row = c(14L, NA_integer_),
    message = c("Value 200 is above maximum 90", "Required field eventID is not mapped"),
    value = c("200", NA_character_)
  )

  lines <- format_issue_lines(issues)
  expect_length(lines, 2)
  expect_match(lines[1], "events")
  expect_match(lines[1], "decimalLatitude")
  expect_match(lines[1], "row 14")
  expect_match(lines[1], "Value 200 is above maximum 90")
  # NA field and NA row both render as the em dash
  expect_match(lines[2], "—")
  # the non-NA row has no dash placeholder (substitution is conditional)
  expect_no_match(lines[1], "—")
  # columns are aligned: the message begins at the same offset in both rows
  expect_equal(
    regexpr("Value 200", lines[1])[[1]],
    regexpr("Required field", lines[2])[[1]]
  )
  # show_level prepends the level column
  lvl_lines <- format_issue_lines(issues, show_level = TRUE)
  expect_match(lvl_lines[1], "error")
})

test_that("format_issue_lines returns an empty vector for zero rows", {
  expect_length(format_issue_lines(empty_issues_with_dataset()), 0)
})

test_that("format_count_table renders header, per-dataset rows, and a TOTAL", {
  counts <- tibble::tibble(
    dataset = c("events", "occurrence"),
    error = c(2L, 0L),
    warning = c(1L, 0L),
    info = c(1L, 1L)
  )
  tbl <- format_count_table(counts)
  expect_match(tbl[1], "dataset")
  expect_match(tbl[1], "error")
  expect_true(any(grepl("events", tbl)))
  expect_true(any(grepl("TOTAL", tbl)))
  total_line <- tbl[grepl("TOTAL", tbl)]
  # totals: error 2, warning 1, info 2
  expect_match(total_line, "2")
})

# events: 2 errors, 1 warning, 1 info; occurrence: 1 info.
# Totals: error 2, warning 1, info 2.
rich_report <- function() {
  json <- list(datasetResults = list(
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
        warnings = list(
          list(
            `_tag` = "RecommendedFieldViolation", severity = "warning",
            fieldName = "basisOfRecord", targetName = "basisOfRecord",
            errorMessage = "Recommended field basisOfRecord is not mapped"
          )
        ),
        info = list(
          list(
            `_tag` = "OptionalFieldViolation", severity = "info",
            fieldName = "modified", targetName = "modified",
            errorMessage = "Optional field modified is not mapped"
          )
        )
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
    ),
    list(
      datasetName = "occurrence",
      schemaViolations = list(errors = list(), warnings = list(), info = list()),
      fieldViolations = list(
        errors = list(), warnings = list(),
        info = list(
          list(
            `_tag` = "OptionalFieldViolation", severity = "info",
            fieldName = "lifeStage", targetName = "lifeStage",
            errorMessage = "Optional field lifeStage is not mapped"
          )
        )
      )
    )
  ))
  new_dwk_report(parse_report(json), name = "demo-survey")
}

# A report whose only issues are info-severity (no errors, no warnings).
info_only_report <- function() {
  json <- list(datasetResults = list(
    list(
      datasetName = "occ",
      schemaViolations = list(
        errors = list(), warnings = list(),
        info = list(
          list(
            `_tag` = "OptionalFieldViolation", severity = "info",
            fieldName = "modified", targetName = "modified",
            errorMessage = "Optional field modified is not mapped"
          )
        )
      ),
      fieldViolations = list(errors = list(), warnings = list(), info = list())
    )
  ))
  new_dwk_report(parse_report(json))
}

test_that("print shows ERRORS then WARNINGS and hides info", {
  out <- capture.output(print(rich_report()))
  joined <- paste(out, collapse = "\n")
  expect_match(joined, "ERRORS \\(2\\)")
  expect_match(joined, "WARNINGS \\(1\\)")
  # the warning body actually renders (not just the heading)
  expect_true(any(grepl("basisOfRecord", out)))
  # errors appear before warnings
  expect_lt(grep("ERRORS", out)[1], grep("WARNINGS", out)[1])
  # info fields never appear in print output
  expect_false(any(grepl("modified", out)))
  expect_false(any(grepl("lifeStage", out)))
  # footer reports true error+warning total (2 + 1 = 3)
  expect_match(joined, "showing 3 of 3")
})

test_that("print caps at n with errors filling first and a truthful footer", {
  out <- capture.output(print(rich_report(), n = 1))
  joined <- paste(out, collapse = "\n")
  # 1 shown of 3 total error+warning issues
  expect_match(joined, "showing 1 of 3")
  # the single shown row is an error (decimalLatitude or eventID), no warning row
  expect_false(any(grepl("basisOfRecord", out)))
})

test_that("print(n = Inf) shows all rows and reports the correct total", {
  out <- capture.output(print(rich_report(), n = Inf))
  joined <- paste(out, collapse = "\n")
  expect_match(joined, "showing 3 of 3")
  expect_true(any(grepl("basisOfRecord", out)))
})

test_that("print reports clean results when there are no errors or warnings", {
  out <- capture.output(print(info_only_report()))
  expect_true(any(grepl("No errors or warnings", out)))
  # info is still suppressed in print
  expect_false(any(grepl("modified", out)))
})

test_that("print keeps the per-dataset header (existing behavior)", {
  out <- capture.output(print(rich_report()))
  joined <- paste(out, collapse = "\n")
  expect_match(joined, "events: INVALID")
  expect_match(joined, "occurrence: valid")
})

test_that("dwk_summary prints counts, a TOTAL, and one example per level", {
  out <- capture.output(result <- dwk_summary(rich_report()))
  joined <- paste(out, collapse = "\n")
  expect_match(joined, "Validation summary — demo-survey")
  expect_match(joined, "TOTAL")
  # one example per level present (example lines start with "  <level> ",
  # which the count-table header does not)
  expect_true(any(grepl("^  error ", out)))
  expect_true(any(grepl("^  warning ", out)))
  expect_true(any(grepl("^  info ", out)))
  # invisibly returns the per-dataset counts tibble (no TOTAL row)
  expect_s3_class(result, "tbl_df")
  expect_named(result, c("dataset", "error", "warning", "info"))
  expect_equal(sum(result$error), 2L)
  expect_equal(sum(result$warning), 1L)
  expect_equal(sum(result$info), 2L)
})

test_that("dwk_summary omits the example block for levels with no issues", {
  out <- capture.output(dwk_summary(info_only_report()))
  # only info exists, so no error/warning example lines are emitted
  example_block <- out[grepl("^  (error|warning|info) ", out)]
  expect_false(any(grepl("^  error ", example_block)))
  expect_false(any(grepl("^  warning ", example_block)))
  expect_true(any(grepl("^  info ", example_block)))
})

test_that("dwk_summary filters to one dataset and validates input", {
  r <- dwk_summary(rich_report(), "occurrence")
  expect_equal(nrow(r), 1L)
  expect_equal(r$info, 1L)
  expect_error(dwk_summary(list()), "expects a dwk_report")
  expect_error(dwk_summary(rich_report(), "nope"), "No dataset 'nope'")
})

test_that("dwk_summary title falls back when the report has no name", {
  out <- capture.output(dwk_summary(info_only_report()))
  expect_true(any(grepl("^Validation summary$", out)))
})

test_that("level filters return only their level and keep canonical columns", {
  report <- rich_report()

  errs <- dwk_errors(report)
  expect_true(all(errs$level == "error"))
  expect_equal(nrow(errs), 2L)
  expect_equal(
    names(errs),
    c("dataset", "check", "level", "field", "row", "message", "value")
  )

  warns <- dwk_warnings(report)
  expect_true(all(warns$level == "warning"))
  expect_equal(nrow(warns), 1L)
  expect_equal(
    names(warns),
    c("dataset", "check", "level", "field", "row", "message", "value")
  )

  infos <- dwk_info(report)
  expect_true(all(infos$level == "info"))
  expect_equal(nrow(infos), 2L)
})

test_that("level filters honor the dataset argument and reject non-reports", {
  report <- rich_report()
  expect_equal(nrow(dwk_info(report, "occurrence")), 1L)
  expect_equal(nrow(dwk_errors(report, "occurrence")), 0L)
  # empty result still has the canonical shape
  expect_equal(
    names(dwk_errors(report, "occurrence")),
    c("dataset", "check", "level", "field", "row", "message", "value")
  )
  expect_error(dwk_errors(list()), "expects a dwk_report")
  expect_error(dwk_warnings(list()), "expects a dwk_report")
  expect_error(dwk_info(list()), "expects a dwk_report")
})

test_that("dwk_summary prints per-level pointers when issues exist", {
  report <- make_report(c(
    replicate(2, vspec("RangeViolation", "error"), simplify = FALSE),
    replicate(3, vspec("RangeViolation", "warning"), simplify = FALSE)
  ))
  out <- capture.output(dwk_summary(report))
  expect_true(any(grepl("See dwk_errors\\(\\) for all 2 errors", out)))
  expect_true(any(grepl("See dwk_warnings\\(\\) for all 3 warnings", out)))
  expect_false(any(grepl("dwk_info", out)))
})

test_that("dwk_summary prints no pointer for a clean report", {
  report <- make_report(list())
  out <- capture.output(dwk_summary(report))
  expect_false(any(grepl("^See dwk_", out)))
})

test_that("dwk_ignore drops whole levels but never errors", {
  report <- make_report(c(
    list(vspec("RangeViolation", "error")),
    replicate(2, vspec("RangeViolation", "warning"), simplify = FALSE),
    replicate(3, vspec("RangeViolation", "info"), simplify = FALSE)
  ))
  filtered <- dwk_ignore(report, levels = "info")
  expect_equal(nrow(dwk_info(filtered)), 0)
  expect_equal(nrow(dwk_warnings(filtered)), 2)
  expect_equal(nrow(dwk_errors(filtered)), 1)
})

test_that("dwk_ignore with both levels and checks drops the intersection", {
  report <- make_report(list(
    vspec("MissingFieldViolation", "info"), # dropped
    vspec("RangeViolation", "info")         # other info: kept
  ))
  filtered <- dwk_ignore(report, levels = "info", checks = "MissingFieldViolation")
  info <- dwk_info(filtered)
  expect_false("MissingFieldViolation" %in% info$check)
  expect_true("RangeViolation" %in% info$check)
})

test_that("dwk_ignore refuses to suppress errors", {
  report <- make_report(list(vspec("RangeViolation", "error")))
  expect_error(dwk_ignore(report, levels = "error"), "error")
})

test_that("dwk_ignore rejects a checks filter that would drop an error", {
  report <- make_report(list(vspec("RangeViolation", "error")))
  expect_error(dwk_ignore(report, checks = "RangeViolation"), "cannot be ignored")
})

test_that("dwk_ignore preserves validity from the unfiltered errors", {
  report <- make_report(list(vspec("RangeViolation", "error")))
  filtered <- dwk_ignore(report, levels = "warning") # no-op on errors
  expect_false(dwk_is_valid(filtered))
})

test_that("dwk_ignore with no levels/checks is a no-op", {
  report <- make_report(list(
    vspec("RangeViolation", "warning"),
    vspec("MissingFieldViolation", "info")
  ))
  filtered <- dwk_ignore(report)
  expect_equal(nrow(dwk_issues(filtered)), nrow(dwk_issues(report)))
})
