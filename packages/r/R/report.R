# An empty issue tibble with the canonical column shape.
empty_issues <- function() {
  tibble::tibble(
    check = character(),
    level = character(),
    field = character(),
    row = integer(),
    message = character(),
    value = character()
  )
}

# Turn one severity bucket (a list of violation objects) into rows.
violations_to_rows <- function(viol_list) {
  if (length(viol_list) == 0) {
    return(empty_issues())
  }
  tibble::tibble(
    check = vapply(viol_list, function(v) as.character(or_na(v[["_tag"]])), character(1)),
    level = vapply(viol_list, function(v) as.character(or_na(v[["severity"]])), character(1)),
    field = vapply(
      viol_list,
      function(v) as.character(or_na(v[["targetName"]] %||% v[["fieldName"]])),
      character(1)
    ),
    row = vapply(viol_list, function(v) {
      r <- v[["rowNumber"]]
      if (is.null(r)) NA_integer_ else as.integer(r)
    }, integer(1)),
    message = vapply(viol_list, function(v) as.character(or_na(v[["errorMessage"]])), character(1)),
    value = vapply(viol_list, function(v) {
      val <- v[["value"]]
      if (is.null(val)) NA_character_ else as.character(val)
    }, character(1))
  )
}

# Local null-coalescing operator (avoids depending on rlang's %||%).
`%||%` <- function(a, b) if (is.null(a)) b else a

# Parse a decoded WorkspaceValidationResult (from jsonlite::fromJSON(simplifyVector = FALSE))
# into a named list: dataset name -> list(valid = logical, issues = tibble).
parse_report <- function(result) {
  out <- list()
  for (d in result$datasetResults) {
    buckets <- list(
      d$schemaViolations$errors, d$schemaViolations$warnings, d$schemaViolations$info,
      d$fieldViolations$errors, d$fieldViolations$warnings, d$fieldViolations$info
    )
    issues <- dplyr::bind_rows(lapply(buckets, violations_to_rows))
    if (nrow(issues) == 0) issues <- empty_issues()
    out[[d$datasetName]] <- list(
      valid = !any(issues$level == "error"),
      issues = issues
    )
  }
  out
}

new_dwk_report <- function(datasets) {
  structure(list(datasets = datasets), class = "dwk_report")
}

check_dwk_report <- function(report, fn) {
  if (!inherits(report, "dwk_report")) {
    stop(
      sprintf(
        "`%s()` expects a dwk_report (the result of `dwk_validate()`), got %s.",
        fn, class(report)[[1]]
      ),
      call. = FALSE
    )
  }
  invisible(report)
}

check_report_dataset <- function(report, dataset, fn) {
  if (!dataset %in% names(report$datasets)) {
    stop(
      sprintf(
        "No dataset '%s' in this report. Validated datasets: %s.",
        dataset, paste(names(report$datasets), collapse = ", ")
      ),
      call. = FALSE
    )
  }
  invisible(report)
}

#' Did validation pass?
#'
#' @param report A `dwk_report` from [dwk_validate()].
#' @param dataset Optional dataset name; omit for overall validity.
#' @return `TRUE` when no error-severity issues were found.
#' @export
dwk_is_valid <- function(report, dataset = NULL) {
  check_dwk_report(report, "dwk_is_valid")
  if (is.null(dataset)) {
    return(all(vapply(report$datasets, function(d) isTRUE(d$valid), logical(1))))
  }
  check_report_dataset(report, dataset, "dwk_is_valid")
  isTRUE(report$datasets[[dataset]]$valid)
}

# Empty prototype that pins the column order/types of dwk_issues() output.
empty_issues_with_dataset <- function() {
  dplyr::bind_cols(tibble::tibble(dataset = character()), empty_issues())
}

#' Validation issues as one tidy tibble
#'
#' One row per issue with columns `dataset, check, level, field, row,
#' message, value`. `check` is the engine's raw violation `_tag` (e.g.
#' `RangeViolation`); `level` is `error`/`warning`/`info`. Pipes straight
#' into dplyr.
#'
#' @param report A `dwk_report` from [dwk_validate()].
#' @param dataset Optional dataset name to filter to.
#' @return A tibble.
#' @export
dwk_issues <- function(report, dataset = NULL) {
  check_dwk_report(report, "dwk_issues")
  targets <- if (is.null(dataset)) {
    names(report$datasets)
  } else {
    check_report_dataset(report, dataset, "dwk_issues")
    dataset
  }
  parts <- lapply(targets, function(nm) {
    issues <- report$datasets[[nm]]$issues
    dplyr::bind_cols(
      tibble::tibble(dataset = rep(nm, nrow(issues))),
      issues
    )
  })
  dplyr::bind_rows(c(list(empty_issues_with_dataset()), parts))
}

#' @export
print.dwk_report <- function(x, ...) {
  cat(sprintf("<dwk_report> %d dataset(s)\n", length(x$datasets)))
  for (nm in names(x$datasets)) {
    d <- x$datasets[[nm]]
    cat(sprintf(
      "  %s: %s (%d issue(s))\n", nm,
      if (isTRUE(d$valid)) "valid" else "INVALID", nrow(d$issues)
    ))
  }
  invisible(x)
}
