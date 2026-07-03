# Pre-staging sanity check: a kit must have at least one dataset.
# Field-level required/unique checks are the engine's job (config-mapped
# fields are implicitly required there).
check_stageable <- function(kit) {
  if (length(kit$datasets) == 0) {
    stop(
      "Kit has no datasets. Add one with `dwk_dataset()` before staging or validating.",
      call. = FALSE
    )
  }
  invisible(kit)
}

# Build the fieldMappings entries for one dataset from its required/unique
# spec. Returns NULL when there is nothing to map (key omitted from YAML).
field_mappings_for <- function(d) {
  fields <- union(d$required, d$unique %||% character())
  if (length(fields) == 0) {
    return(NULL)
  }
  lapply(fields, function(f) {
    m <- list(originName = f, targetName = f)
    if (f %in% d$required) m$requirement <- "required"
    if (identical(f, d$unique)) m$constraints <- list(list(type = "unique"))
    m
  })
}

# Replace null-sentinel values (e.g. "", "NA") with NA before writing to
# Parquet. Parquet has native NULL — the engine does not apply nullValues to
# Parquet reads — so we must convert here rather than rely on the engine to
# do it at load time.
apply_null_values <- function(df, null_values) {
  for (col in names(df)) {
    v <- df[[col]]
    if (is.character(v)) {
      df[[col]] <- ifelse(v %in% null_values, NA_character_, v)
    }
  }
  df
}

# Write all datasets to Parquet under `stage` and emit darwinkit.yaml.
# Dataset paths are written relative to the config file: the engine resolves
# them against dirname(configPath), so the staged directory is portable.
# Returns the config file path.
stage_datasets <- function(stage, kit) {
  dir.create(stage, recursive = TRUE, showWarnings = FALSE)
  stage <- normalizePath(stage, mustWork = FALSE)

  dataset_entries <- list()
  for (nm in names(kit$datasets)) {
    d <- kit$datasets[[nm]]
    parquet_name <- paste0(nm, ".parquet")
    nanoparquet::write_parquet(
      apply_null_values(d$data, kit$null_values),
      file.path(stage, parquet_name)
    )
    entry <- list(
      name = nm,
      class = d$class,
      path = parquet_name,
      description = d$description %||% ""
    )
    fm <- field_mappings_for(d)
    if (!is.null(fm)) entry$fieldMappings <- fm
    dataset_entries[[length(dataset_entries) + 1]] <- entry
  }

  config <- list(
    name = kit$name,
    standard = kit$standard,
    validation = list(
      nullValues = as.list(kit$null_values),
      datasets = dataset_entries
    )
  )
  if (!is.null(kit$description)) config$description <- kit$description

  config_path <- file.path(stage, "darwinkit.yaml")
  yaml::write_yaml(config, config_path)
  config_path
}

#' Stage a kit as a shadow DarwinKit workspace
#'
#' Materializes the kit at `dir`: one `<name>.parquet` per dataset plus a
#' generated `darwinkit.yaml` referencing them by relative path. The
#' directory is self-contained — commit it to git, or validate it directly
#' with `dwkt validate --config <dir>/darwinkit.yaml`.
#'
#' @param kit A `dwk_kit` with at least one dataset.
#' @param dir Directory to stage into (created if needed).
#' @return The path to the generated `darwinkit.yaml`, invisibly.
#' @family output
#' @examples
#' \dontrun{
#' kit |> dwk_stage("darwinkit/")
#' }
#' @export
dwk_stage <- function(kit, dir) {
  check_dwk_kit(kit, "dwk_stage")
  check_string(dir, "dir", "dwk_stage")
  check_stageable(kit)
  invisible(stage_datasets(dir, kit))
}
