test_that("dwk_dataset adds a dataset stored as a tibble", {
  kit <- dwk_init("t") |>
    dwk_dataset("Event", data.frame(eventID = "E1"),
      name = "events", description = "evts", required = "eventID", unique = "eventID"
    )
  d <- kit$datasets$events
  expect_s3_class(d$data, "tbl_df")
  expect_equal(d$class, "Event")
  expect_equal(d$description, "evts")
  expect_equal(d$required, "eventID")
  expect_equal(d$unique, "eventID")
})

test_that("verbs are immutable: the original kit is untouched", {
  kit <- dwk_init("t")
  kit2 <- dwk_dataset(kit, "Event", tibble::tibble(eventID = "E1"), name = "events")
  expect_equal(kit$datasets, list())
  expect_named(kit2$datasets, "events")
})

test_that("re-adding a dataset name replaces it with a message", {
  kit <- dwk_init("t") |>
    dwk_dataset("Event", tibble::tibble(eventID = "E1"), name = "events")
  expect_message(
    kit <- dwk_dataset(
      kit, "Event",
      tibble::tibble(eventID = c("E1", "E2")),
      name = "events"
    ),
    "Replacing existing dataset 'events'"
  )
  expect_equal(nrow(kit$datasets$events$data), 2)
})

test_that("dwk_dataset validates its arguments", {
  kit <- dwk_init("t")
  expect_error(dwk_dataset(kit, "Event", "not a df"), "must be a data.frame")
  expect_error(dwk_dataset(kit, 1, tibble::tibble()), "non-empty string")
  expect_error(
    dwk_dataset(kit, "Event", tibble::tibble(), required = 1),
    "`required` must be a character vector"
  )
  expect_error(
    dwk_dataset(kit, "Event", tibble::tibble(), unique = c("a", "b")),
    "`unique` must be a non-empty string"
  )
  expect_error(dwk_dataset(list(), "Event", tibble::tibble()), "expects a dwk_kit")
})

test_that("name defaults to class", {
  kit <- dwk_init("t") |> dwk_dataset("Event", data.frame(eventID = "E1"))
  expect_true("Event" %in% names(kit$datasets))
  expect_equal(kit$datasets[["Event"]]$class, "Event")
})

test_that("explicit name overrides the class default", {
  kit <- dwk_init("t") |>
    dwk_dataset("Occurrence", data.frame(occurrenceID = "O1"), name = "occ2")
  expect_true("occ2" %in% names(kit$datasets))
  expect_equal(kit$datasets[["occ2"]]$class, "Occurrence")
})
