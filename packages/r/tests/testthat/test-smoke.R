test_that("package loads and the or_na helper works", {
  expect_true(is.na(or_na(NULL)))
  expect_equal(or_na(5), 5)
})
