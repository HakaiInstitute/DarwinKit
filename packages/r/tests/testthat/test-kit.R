test_that("dwk_init builds an empty kit", {
  kit <- dwk_init("survey", description = "d", standard = "obis")
  expect_s3_class(kit, "dwk_kit")
  expect_equal(kit$name, "survey")
  expect_equal(kit$description, "d")
  expect_equal(kit$standard, "obis")
  expect_equal(kit$datasets, list())
  expect_equal(kit$null_values, c("NA", "N/A", "", "NULL", "null"))
})

test_that("description defaults to NULL", {
  expect_null(dwk_init("survey")$description)
})

test_that("dwk_init validates its arguments", {
  expect_error(dwk_init(1), "`name` must be a non-empty string")
  expect_error(dwk_init(""), "`name` must be a non-empty string")
  expect_error(dwk_init("t", standard = c("a", "b")), "`standard` must be a non-empty string")
})

test_that("dwk_null_values replaces the null marker list", {
  kit <- dwk_init("t") |> dwk_null_values(c("NA", "-999"))
  expect_equal(kit$null_values, c("NA", "-999"))
})

test_that("dwk_null_values rejects non-kit and non-character input", {
  expect_error(dwk_null_values(list(), "NA"), "expects a dwk_kit")
  expect_error(dwk_null_values(dwk_init("t"), 1), "character vector")
})

test_that("print.dwk_kit summarizes an empty kit", {
  kit <- dwk_init("survey")
  expect_output(print(kit), "survey")
  expect_output(print(kit), "no datasets")
  expect_output(print(kit), "null values: NA, N/A, , NULL, null")
})
