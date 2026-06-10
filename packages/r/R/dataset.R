#' Add a dataset to a kit
#'
#' Stores the data frame (as a tibble) under `name`. `required` and `unique`
#' are forwarded to the engine via the staged config's `fieldMappings` — they
#' are not checked in R. Any field named there must exist as a column; the
#' engine reports missing mapped fields as errors. Re-using an existing
#' `name` replaces that dataset (with a message), so re-running scripts and
#' RMarkdown chunks is painless.
#'
#' @param kit A `dwk_kit`.
#' @param name Dataset name (unique within the kit).
#' @param class Darwin Core class: `"Event"`, `"Occurrence"`, `"Taxon"`, etc.
#' @param data A data.frame / tibble.
#' @param description Optional dataset description.
#' @param required Character vector of fields the engine must require.
#' @param unique Optional single field that must be unique per row.
#' @return A modified copy of `kit`.
#' @examples
#' kit <- dwk_init("t") |>
#'   dwk_dataset("events", "Event",
#'     data.frame(eventID = c("E1", "E2")),
#'     required = "eventID", unique = "eventID"
#'   )
#' @export
dwk_dataset <- function(kit, name, class, data,
                        description = "",
                        required = character(),
                        unique = NULL) {
  check_dwk_kit(kit, "dwk_dataset")
  check_string(name, "name", "dwk_dataset")
  check_string(class, "class", "dwk_dataset")
  check_data_frame(data, "data", "dwk_dataset")
  if (!is.character(required)) {
    stop("`required` must be a character vector in `dwk_dataset()`.", call. = FALSE)
  }
  if (!is.null(unique)) check_string(unique, "unique", "dwk_dataset")
  if (name %in% names(kit$datasets)) {
    message(sprintf("Replacing existing dataset '%s'.", name))
  }
  kit$datasets[[name]] <- list(
    class = class,
    data = tibble::as_tibble(data),
    description = description,
    required = required,
    unique = if (is.null(unique)) NULL else unname(unique)
  )
  kit
}

#' Add a cross-dataset foreign-key relation
#'
#' Each value of `source_field` in `source_dataset` must exist in
#' `target_field` of `target_dataset`. Enforced by the engine (a
#' `foreignKey` rule in the staged config). Dataset/field existence is
#' checked when the kit is staged, so relations can be declared before the
#' datasets they reference.
#'
#' @param kit A `dwk_kit`.
#' @param source_dataset,source_field The child side (e.g. occurrences).
#' @param target_dataset,target_field The parent side (e.g. events).
#' @param requirement `"required"`, `"recommended"`, or `"optional"`.
#' @return A modified copy of `kit`.
#' @examples
#' kit <- dwk_init("t") |>
#'   dwk_relation("occurrences", "eventID", "events", "eventID")
#' @export
dwk_relation <- function(kit, source_dataset, source_field,
                         target_dataset, target_field,
                         requirement = "required") {
  check_dwk_kit(kit, "dwk_relation")
  check_string(source_dataset, "source_dataset", "dwk_relation")
  check_string(source_field, "source_field", "dwk_relation")
  check_string(target_dataset, "target_dataset", "dwk_relation")
  check_string(target_field, "target_field", "dwk_relation")
  requirement <- match.arg(requirement, c("required", "recommended", "optional"))
  kit$relations[[length(kit$relations) + 1]] <- list(
    source_dataset = source_dataset, source_field = source_field,
    target_dataset = target_dataset, target_field = target_field,
    requirement = requirement
  )
  kit
}
