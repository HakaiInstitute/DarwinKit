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

# Format one issue subset into aligned "  dataset  field  row K  message"
# lines (em dash for NA field/row). `show_level = TRUE` prepends the level
# column. Shared by print.dwk_report() and dwk_summary().
format_issue_lines <- function(issues, show_level = FALSE) {
  if (nrow(issues) == 0) {
    return(character(0))
  }
  dataset <- format(issues$dataset)
  field <- format(ifelse(is.na(issues$field), "—", issues$field))
  row <- format(ifelse(is.na(issues$row), "—", paste0("row ", issues$row)))
  message <- ifelse(is.na(issues$message), "", issues$message)
  if (show_level) {
    level <- format(issues$level)
    sprintf("  %s  %s  %s  %s  %s", level, dataset, field, row, message)
  } else {
    sprintf("  %s  %s  %s  %s", dataset, field, row, message)
  }
}

# Format a per-dataset counts tibble (dataset, error, warning, info) into an
# aligned text table with a header row and a trailing TOTAL row.
format_count_table <- function(counts) {
  header <- c("dataset", "error", "warning", "info")
  body <- cbind(
    counts$dataset,
    as.character(counts$error),
    as.character(counts$warning),
    as.character(counts$info)
  )
  total <- c(
    "TOTAL",
    as.character(sum(counts$error)),
    as.character(sum(counts$warning)),
    as.character(sum(counts$info))
  )
  m <- rbind(header, body, total)
  widths <- apply(m, 2, function(col) max(nchar(col)))
  unname(apply(m, 1, function(cells) {
    padded <- vapply(seq_along(cells), function(j) {
      # first column left-justified, count columns right-justified
      formatC(cells[[j]], width = if (j == 1) -widths[[j]] else widths[[j]])
    }, character(1))
    paste0("  ", paste(padded, collapse = "  "))
  }))
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

new_dwk_report <- function(datasets, name = NULL) {
  structure(list(datasets = datasets, name = name), class = "dwk_report")
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
#' @family validation
#' @export
dwk_is_valid <- function(report, dataset = NULL) {
  check_dwk_report(report, "dwk_is_valid")
  if (is.null(dataset)) {
    return(all(vapply(report$datasets, function(d) isTRUE(d$valid), logical(1))))
  }
  check_report_dataset(report, dataset, "dwk_is_valid")
  isTRUE(report$datasets[[dataset]]$valid)
}

#' Validation summary: counts per level + one example of each
#'
#' Prints a per-dataset count table (errors / warnings / info) with a TOTAL
#' row, followed by one representative issue of each level that occurs. Use
#' [dwk_issues()], [dwk_errors()], etc. for the full detail.
#'
#' @param report A `dwk_report` from [dwk_validate()].
#' @param dataset Optional dataset name to summarize.
#' @return Invisibly, the per-dataset counts as a tibble
#'   (`dataset, error, warning, info`); called for its printed output.
#' @family reporting
#' @export
dwk_summary <- function(report, dataset = NULL) {
  check_dwk_report(report, "dwk_summary")
  if (!is.null(dataset)) check_report_dataset(report, dataset, "dwk_summary")

  targets <- if (is.null(dataset)) names(report$datasets) else dataset
  issues <- dwk_issues(report, dataset)

  count_level <- function(nm, lvl) {
    as.integer(sum(issues$dataset == nm & issues$level == lvl))
  }
  counts <- tibble::tibble(
    dataset = targets,
    error = unname(vapply(targets, count_level, integer(1), lvl = "error")),
    warning = unname(vapply(targets, count_level, integer(1), lvl = "warning")),
    info = unname(vapply(targets, count_level, integer(1), lvl = "info"))
  )

  title <- if (is.null(report$name)) {
    "Validation summary"
  } else {
    sprintf("Validation summary — %s", report$name)
  }
  cat(title, "\n", sep = "")
  cat(format_count_table(counts), sep = "\n")

  for (lvl in c("error", "warning", "info")) {
    rows <- issues[issues$level == lvl, , drop = FALSE]
    if (nrow(rows) > 0) {
      cat("\n")
      cat(format_issue_lines(rows[1, , drop = FALSE], show_level = TRUE), "\n", sep = "")
    }
  }
  totals <- c(
    error = sum(counts$error),
    warning = sum(counts$warning),
    info = sum(counts$info)
  )
  pointers <- c(
    error = "See dwk_errors() for all %d errors.",
    warning = "See dwk_warnings() for all %d warnings.",
    info = "See dwk_info() for all %d info messages."
  )
  footer <- character(0)
  for (lvl in names(pointers)) {
    if (totals[[lvl]] > 0) {
      footer <- c(footer, sprintf(pointers[[lvl]], totals[[lvl]]))
    }
  }
  if (length(footer) > 0) {
    cat("\n")
    cat(footer, sep = "\n")
    cat("\n")
  }
  invisible(counts)
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
#' @family reporting
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

# Shared implementation: the tidy tibble filtered to one severity level.
issues_at_level <- function(report, lvl, dataset) {
  issues <- dwk_issues(report, dataset)
  issues[issues$level == lvl, , drop = FALSE]
}

#' Error-level validation issues
#'
#' Convenience filter over [dwk_issues()] returning only `level == "error"`
#' rows. Same columns and `dataset` argument as [dwk_issues()].
#'
#' @param report A `dwk_report` from [dwk_validate()].
#' @param dataset Optional dataset name to filter to.
#' @return A tibble.
#' @family reporting
#' @export
dwk_errors <- function(report, dataset = NULL) {
  issues_at_level(report, "error", dataset)
}

#' Warning-level validation issues
#'
#' Convenience filter over [dwk_issues()] returning only `level == "warning"`
#' rows. Same columns and `dataset` argument as [dwk_issues()].
#'
#' @param report A `dwk_report` from [dwk_validate()].
#' @param dataset Optional dataset name to filter to.
#' @return A tibble.
#' @family reporting
#' @export
dwk_warnings <- function(report, dataset = NULL) {
  issues_at_level(report, "warning", dataset)
}

#' Info-level validation issues
#'
#' Convenience filter over [dwk_issues()] returning only `level == "info"`
#' rows. Same columns and `dataset` argument as [dwk_issues()].
#'
#' @param report A `dwk_report` from [dwk_validate()].
#' @param dataset Optional dataset name to filter to.
#' @return A tibble.
#' @family reporting
#' @export
dwk_info <- function(report, dataset = NULL) {
  issues_at_level(report, "info", dataset)
}

#' Suppress noise from a validation report
#'
#' Returns a copy of `report` with selected issues removed. Supply `levels` to
#' drop whole severity levels, `checks` to drop whole violation types, or both
#' to drop only their intersection (those checks *at* those levels). Chaining
#' unions the removals. Errors can never be suppressed.
#'
#' @param report A `dwk_report` from [dwk_validate()].
#' @param levels Character vector of levels to drop (`"warning"`, `"info"`).
#'   `"error"` is not allowed.
#' @param checks Character vector of violation `_tag`s to drop (e.g.
#'   `"MissingFieldViolation"`).
#' @return A filtered `dwk_report`.
#' @family reporting
#' @examples
#' \dontrun{
#' report |> dwk_ignore(levels = "info")
#' report |> dwk_ignore(levels = "info", checks = "MissingFieldViolation")
#' }
#' @export
dwk_ignore <- function(report, levels = NULL, checks = NULL) {
  check_dwk_report(report, "dwk_ignore")
  if ("error" %in% levels) {
    stop('`dwk_ignore()` cannot suppress errors (level = "error").', call. = FALSE)
  }

  drop_rows <- function(issues) {
    if (nrow(issues) == 0) return(issues)
    lvl_hit <- if (is.null(levels)) rep(FALSE, nrow(issues)) else issues$level %in% levels
    chk_hit <- if (is.null(checks)) rep(FALSE, nrow(issues)) else issues$check %in% checks
    drop <- if (!is.null(levels) && !is.null(checks)) {
      lvl_hit & chk_hit           # both -> intersection
    } else {
      lvl_hit | chk_hit           # one -> that whole category
    }
    if (any(drop & issues$level == "error")) {
      bad <- unique(issues$check[drop & issues$level == "error"])
      stop(
        sprintf(
          "`dwk_ignore()` would suppress error-level issue(s): %s. Errors cannot be ignored.",
          paste(bad, collapse = ", ")
        ),
        call. = FALSE
      )
    }
    issues[!drop, , drop = FALSE]
  }

  # lapply over a named list preserves names, so result keys stay aligned.
  datasets <- lapply(report$datasets, function(d) {
    list(valid = d$valid, issues = drop_rows(d$issues))
  })
  new_dwk_report(datasets, name = report$name)
}

#' Print a validation report
#'
#' Prints a per-dataset status header, then the errors and warnings (errors
#' first, capped at `n`). info-severity issues are never shown by `print`;
#' reach them with [dwk_issues()].
#'
#' @param x A `dwk_report` from [dwk_validate()].
#' @param n Maximum number of error+warning rows to display (default 25,
#'   errors shown first). Use `n = Inf` to show all.
#' @param ... Ignored.
#' @return `x`, invisibly.
#' @family reporting
#' @export
print.dwk_report <- function(x, n = 25, ...) {
  valid <- vapply(x$datasets, function(d) isTRUE(d$valid), logical(1))
  n_invalid <- sum(!valid)
  cat(sprintf(
    "<dwk_report> %d dataset(s)%s\n",
    length(x$datasets),
    if (n_invalid > 0) sprintf(" — %d INVALID", n_invalid) else ""
  ))
  for (nm in names(x$datasets)) {
    d <- x$datasets[[nm]]
    cat(sprintf(
      "  %s: %s (%d issue(s))\n", nm,
      if (isTRUE(d$valid)) "valid" else "INVALID", nrow(d$issues)
    ))
  }

  issues <- dwk_issues(x)
  errors <- issues[issues$level == "error", , drop = FALSE]
  warnings <- issues[issues$level == "warning", , drop = FALSE]
  total <- nrow(errors) + nrow(warnings)

  if (total == 0) {
    cat("\nNo errors or warnings.\n")
    return(invisible(x))
  }

  shown_errors <- utils::head(errors, n)
  shown_warnings <- utils::head(warnings, max(0, n - nrow(shown_errors)))

  lines <- c(
    sprintf("ERRORS (%d)", nrow(errors)),
    format_issue_lines(shown_errors),
    "",
    sprintf("WARNINGS (%d)", nrow(warnings)),
    format_issue_lines(shown_warnings)
  )

  shown <- nrow(shown_errors) + nrow(shown_warnings)
  footer <- sprintf(
    "(showing %d of %d · dwk_issues() for the full table%s)",
    shown, total, if (any(issues$level == "info")) ", incl. info" else ""
  )

  cat("\n")
  cat(lines, sep = "\n")
  cat("\n")
  cat(footer, "\n", sep = "")
  invisible(x)
}
