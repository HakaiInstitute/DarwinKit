test_that("dwk_write_csv stringifies numerics and blanks NA", {
  out <- withr::local_tempdir()
  kit <- dwk_init("t") |>
    dwk_dataset(
      "Event",
      tibble::tibble(
        eventID = c("E1", "E2"),
        decimalLatitude = c(48.5, NA)
      ),
      name = "events"
    )
  res <- withVisible(dwk_write_csv(kit, out))
  expect_false(res$visible)
  expect_s3_class(res$value, "dwk_kit") # returns the kit for piping

  written <- read.csv(file.path(out, "events.csv"),
    colClasses = "character",
    na.strings = character(0)
  )
  expect_equal(written$decimalLatitude, c("48.5", ""))
})

test_that("dwk_write_csv can write a subset of datasets", {
  out <- withr::local_tempdir()
  kit <- dwk_init("t") |>
    dwk_dataset("Event", tibble::tibble(eventID = "E1"), name = "events") |>
    dwk_dataset("Occurrence", tibble::tibble(occurrenceID = "O1"), name = "occ")
  dwk_write_csv(kit, out, datasets = "events")
  expect_true(file.exists(file.path(out, "events.csv")))
  expect_false(file.exists(file.path(out, "occ.csv")))
})

test_that("dwk_write_csv errors on unknown dataset names", {
  kit <- dwk_init("t") |>
    dwk_dataset("Event", tibble::tibble(eventID = "E1"), name = "events")
  expect_error(
    dwk_write_csv(kit, withr::local_tempdir(), datasets = "nope"),
    "Unknown dataset\\(s\\): nope"
  )
})
