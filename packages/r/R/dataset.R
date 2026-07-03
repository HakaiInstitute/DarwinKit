#' Add a dataset to a kit
#'
#' Stores the data frame (as a tibble) under `name` (defaulting to `class`).
#' `required` and `unique` are forwarded to the engine via the staged config's
#' `fieldMappings` — they are not checked in R. Re-using an existing `name`
#' replaces that dataset (with a message). Standard Darwin Core foreign keys
#' (e.g. Occurrence.eventID -> Event.eventID) are enforced automatically by the
#' engine; you do not declare them here.
#'
#' @param kit A `dwk_kit`.
#' @param class Darwin Core class: `"Event"`, `"Occurrence"`, `"Taxon"`, etc.
#' @param data A data.frame / tibble.
#' @param name Dataset name (unique within the kit). Defaults to `class`; supply
#'   an explicit name only when a kit holds two datasets of the same class.
#' @param description Optional dataset description.
#' @param required Character vector of fields the engine must require.
#' @param unique Optional single field that must be unique per row.
#' @return A modified copy of `kit`.
#' @family kit builders
#' @examples
#' kit <- dwk_init("t") |>
#'   dwk_dataset("Event", data.frame(eventID = c("E1", "E2")),
#'     required = "eventID", unique = "eventID")
#' @export
dwk_dataset <- function(kit, class, data, name = NULL,
                        description = "",
                        required = character(),
                        unique = NULL) {
  check_dwk_kit(kit, "dwk_dataset")
  check_string(class, "class", "dwk_dataset")
  check_data_frame(data, "data", "dwk_dataset")
  if (is.null(name)) name <- class
  check_string(name, "name", "dwk_dataset")
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
