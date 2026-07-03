staged_kit <- function() {
  dwk_init("t", standard = "obis") |>
    dwk_null_values(c("NA", "")) |>
    dwk_dataset("Event",
      tibble::tibble(
        eventID = c("E1", "E2"),
        decimalLatitude = c(48.5, 49.0)
      ),
      name = "events",
      description = "evts",
      required = c("eventID", "decimalLatitude"),
      unique = "eventID"
    ) |>
    dwk_dataset(
      "Occurrence",
      tibble::tibble(occurrenceID = "O1", eventID = "E1"),
      name = "occ"
    )
}

test_that("dwk_stage writes parquet per dataset and a config with relative paths", {
  stage <- withr::local_tempdir()
  res <- withVisible(dwk_stage(staged_kit(), stage))
  expect_false(res$visible) # config path returned invisibly
  cfg <- res$value
  expect_equal(basename(cfg), "darwinkit.yaml")

  expect_true(file.exists(file.path(stage, "events.parquet")))
  expect_true(file.exists(file.path(stage, "occ.parquet")))

  # Parquet round-trips.
  back <- nanoparquet::read_parquet(file.path(stage, "events.parquet"))
  expect_equal(back$eventID, c("E1", "E2"))

  parsed <- yaml::read_yaml(cfg)
  expect_equal(parsed$standard, "obis")
  expect_equal(unlist(parsed$validation$nullValues), c("NA", ""))
  ev <- Filter(function(d) d$name == "events", parsed$validation$datasets)[[1]]
  expect_equal(ev$class, "Event")
  # Relative to the config file: the engine resolves against dirname(configPath),
  # keeping the staged directory portable (fit for git).
  expect_equal(ev$path, "events.parquet")
})

test_that("null-sentinel strings become NA in staged Parquet", {
  # The engine treats Parquet NULLs as native and does not apply nullValues on
  # read, so sentinels must be converted to NA before write_parquet().
  kit <- dwk_init("t") |>
    dwk_null_values(c("NA", "")) |>
    dwk_dataset(
      "Event",
      tibble::tibble(eventID = c("E1", "E2"), parentEventID = c("E0", "")),
      name = "events"
    )
  stage <- withr::local_tempdir()
  dwk_stage(kit, stage)
  back <- nanoparquet::read_parquet(file.path(stage, "events.parquet"))
  expect_true(is.na(back$parentEventID[2])) # "" was a sentinel
  expect_equal(back$parentEventID[1], "E0") # non-sentinel untouched
})

test_that("required/unique emit fieldMappings the engine understands", {
  cfg <- dwk_stage(staged_kit(), withr::local_tempdir())
  parsed <- yaml::read_yaml(cfg)

  ev <- Filter(function(d) d$name == "events", parsed$validation$datasets)[[1]]
  fm <- ev$fieldMappings
  by_name <- setNames(fm, vapply(fm, function(m) m$originName, character(1)))

  expect_equal(by_name$eventID$targetName, "eventID")
  expect_equal(by_name$eventID$requirement, "required")
  expect_equal(by_name$eventID$constraints[[1]]$type, "unique")
  expect_equal(by_name$decimalLatitude$requirement, "required")
  expect_null(by_name$decimalLatitude$constraints)

  # No required/unique -> no fieldMappings key at all.
  occ <- Filter(function(d) d$name == "occ", parsed$validation$datasets)[[1]]
  expect_null(occ$fieldMappings)
})

test_that("a unique field that is not in required still gets a mapping", {
  kit <- dwk_init("t") |>
    dwk_dataset("Event", tibble::tibble(eventID = "E1"),
      name = "events", unique = "eventID"
    )
  parsed <- yaml::read_yaml(dwk_stage(kit, withr::local_tempdir()))
  fm <- parsed$validation$datasets[[1]]$fieldMappings
  expect_equal(fm[[1]]$originName, "eventID")
  expect_null(fm[[1]]$requirement)
  expect_equal(fm[[1]]$constraints[[1]]$type, "unique")
})

test_that("staging an empty kit errors", {
  expect_error(dwk_stage(dwk_init("t"), withr::local_tempdir()), "no datasets")
})

test_that("a named unique vector still emits the unique constraint", {
  kit <- dwk_init("t") |>
    dwk_dataset("Event", tibble::tibble(eventID = "E1"),
      name = "events", unique = c(id = "eventID")
    )
  parsed <- yaml::read_yaml(dwk_stage(kit, withr::local_tempdir()))
  fm <- parsed$validation$datasets[[1]]$fieldMappings
  expect_equal(fm[[1]]$constraints[[1]]$type, "unique")
})
