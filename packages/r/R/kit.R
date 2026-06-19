# Default null markers, mirroring the engine's defaults (workspace-config.ts).
dwk_default_null_values <- c("NA", "N/A", "", "NULL", "null")

new_dwk_kit <- function(name, description, standard) {
  structure(
    list(
      name = name,
      description = description,
      standard = standard,
      null_values = dwk_default_null_values,
      datasets = list(),
      relations = list()
    ),
    class = "dwk_kit"
  )
}

# --- shared argument checks (used by every verb) -----------------------------

check_dwk_kit <- function(kit, fn) {
  if (!inherits(kit, "dwk_kit")) {
    stop(
      sprintf(
        "`%s()` expects a dwk_kit (create one with `dwk_init()`), got %s.",
        fn, class(kit)[[1]]
      ),
      call. = FALSE
    )
  }
  invisible(kit)
}

check_string <- function(x, arg, fn) {
  if (!is.character(x) || length(x) != 1 || is.na(x) || !nzchar(x)) {
    stop(
      sprintf("`%s` must be a non-empty string in `%s()`.", arg, fn),
      call. = FALSE
    )
  }
  invisible(x)
}

check_data_frame <- function(x, arg, fn) {
  if (!is.data.frame(x)) {
    stop(
      sprintf(
        "`%s` must be a data.frame in `%s()`, got %s.",
        arg, fn, class(x)[[1]]
      ),
      call. = FALSE
    )
  }
  invisible(x)
}

# --- exported verbs ----------------------------------------------------------

#' Start a DarwinKit validation kit
#'
#' Creates an immutable configuration object. Build it up with the `dwk_*`
#' verbs (each returns a modified copy), then run [dwk_validate()].
#'
#' @param name Workspace name (appears in the generated `darwinkit.yaml`).
#' @param description Optional human-readable description.
#' @param standard Biodiversity standard variant, e.g. `"obis"` or `"gbif"`.
#' @return A `dwk_kit`.
#' @examples
#' kit <- dwk_init("My survey", description = "2022 field season")
#' @export
dwk_init <- function(name, description = NULL, standard = "obis") {
  check_string(name, "name", "dwk_init")
  if (!is.null(description)) check_string(description, "description", "dwk_init")
  check_string(standard, "standard", "dwk_init")
  new_dwk_kit(name, description, standard)
}

#' Set the null markers for a kit
#'
#' Replaces the kit's null-value list (the strings the engine treats as
#' missing). The default mirrors the engine's: `NA`, `N/A`, `""`, `NULL`,
#' `null`.
#'
#' @param kit A `dwk_kit`.
#' @param values Character vector of null markers.
#' @return A modified copy of `kit`.
#' @examples
#' kit <- dwk_init("t") |> dwk_null_values(c("NA", "-999"))
#' @export
dwk_null_values <- function(kit, values) {
  check_dwk_kit(kit, "dwk_null_values")
  if (!is.character(values)) {
    stop("`values` must be a character vector in `dwk_null_values()`.", call. = FALSE)
  }
  kit$null_values <- values
  kit
}

#' @export
print.dwk_kit <- function(x, ...) {
  cat(sprintf("<dwk_kit> %s (standard: %s)\n", x$name, x$standard))
  cat(sprintf("  null values: %s\n", paste(x$null_values, collapse = ", ")))
  if (length(x$datasets) == 0) {
    cat("  no datasets\n")
  }
  for (nm in names(x$datasets)) {
    d <- x$datasets[[nm]]
    cat(sprintf("  dataset %s: %s, %d row(s)\n", nm, d$class, nrow(d$data)))
  }
  for (r in x$relations) {
    cat(sprintf(
      "  relation %s.%s -> %s.%s (%s)\n",
      r$source_dataset, r$source_field,
      r$target_dataset, r$target_field, r$requirement
    ))
  }
  invisible(x)
}
