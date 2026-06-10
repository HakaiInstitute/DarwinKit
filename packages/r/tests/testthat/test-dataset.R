test_that("dwk_dataset adds a dataset stored as a tibble", {
  kit <- dwk_init("t") |>
    dwk_dataset("events", "Event", data.frame(eventID = "E1"),
      description = "evts", required = "eventID", unique = "eventID"
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
  kit2 <- dwk_dataset(kit, "events", "Event", tibble::tibble(eventID = "E1"))
  expect_equal(kit$datasets, list())
  expect_named(kit2$datasets, "events")
})

test_that("re-adding a dataset name replaces it with a message", {
  kit <- dwk_init("t") |>
    dwk_dataset("events", "Event", tibble::tibble(eventID = "E1"))
  expect_message(
    kit <- dwk_dataset(
      kit, "events", "Event",
      tibble::tibble(eventID = c("E1", "E2"))
    ),
    "Replacing existing dataset 'events'"
  )
  expect_equal(nrow(kit$datasets$events$data), 2)
})

test_that("dwk_dataset validates its arguments", {
  kit <- dwk_init("t")
  expect_error(dwk_dataset(kit, "e", "Event", "not a df"), "must be a data.frame")
  expect_error(dwk_dataset(kit, 1, "Event", tibble::tibble()), "non-empty string")
  expect_error(
    dwk_dataset(kit, "e", "Event", tibble::tibble(), required = 1),
    "`required` must be a character vector"
  )
  expect_error(
    dwk_dataset(kit, "e", "Event", tibble::tibble(), unique = c("a", "b")),
    "`unique` must be a non-empty string"
  )
  expect_error(dwk_dataset(list(), "e", "Event", tibble::tibble()), "expects a dwk_kit")
})

test_that("dwk_relation appends a relation with a default requirement", {
  kit <- dwk_init("t") |>
    dwk_relation("occ", "eventID", "events", "eventID")
  expect_length(kit$relations, 1)
  r <- kit$relations[[1]]
  expect_equal(r$source_dataset, "occ")
  expect_equal(r$target_field, "eventID")
  expect_equal(r$requirement, "required")
})

test_that("dwk_relation rejects an invalid requirement level", {
  expect_error(
    dwk_relation(dwk_init("t"), "a", "f", "b", "g", requirement = "mandatory"),
    "should be one of"
  )
})
