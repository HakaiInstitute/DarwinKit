# Pre-staging sanity checks: a kit must have datasets, and every relation must
# reference datasets/fields that exist. Field-level required/unique checks are
# the engine's job (config-mapped fields are implicitly required there).
check_stageable <- function(kit) {
  if (length(kit$datasets) == 0) {
    stop(
      "Kit has no datasets. Add one with `dwk_dataset()` before staging or validating.",
      call. = FALSE
    )
  }
  for (r in kit$relations) {
    for (side in c("source", "target")) {
      ds_name <- r[[paste0(side, "_dataset")]]
      field <- r[[paste0(side, "_field")]]
      if (!ds_name %in% names(kit$datasets)) {
        stop(
          sprintf(
            "Relation references unknown dataset '%s'. Known datasets: %s.",
            ds_name, paste(names(kit$datasets), collapse = ", ")
          ),
          call. = FALSE
        )
      }
      if (!field %in% names(kit$datasets[[ds_name]]$data)) {
        stop(
          sprintf(
            "Relation field '%s' is not a column of dataset '%s'.",
            field, ds_name
          ),
          call. = FALSE
        )
      }
    }
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
    nanoparquet::write_parquet(d$data, file.path(stage, parquet_name))
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

  rules <- lapply(kit$relations, function(r) {
    list(
      ruleType = "foreignKey",
      sourceDataset = r$source_dataset,
      sourceField = r$source_field,
      targetDataset = r$target_dataset,
      targetField = r$target_field,
      requirement = r$requirement %||% "required"
    )
  })

  config <- list(
    name = kit$name,
    standard = kit$standard,
    validation = list(
      nullValues = as.list(kit$null_values),
      datasets = dataset_entries
    )
  )
  if (!is.null(kit$description)) config$description <- kit$description
  if (length(rules) > 0) config$datasetRules <- rules

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
