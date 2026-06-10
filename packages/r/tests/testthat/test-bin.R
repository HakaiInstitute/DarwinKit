test_that("explicit bin wins", {
  expect_equal(resolve_dwkt_bin(bin = "/opt/dwkt"), "/opt/dwkt")
})

test_that("env var is used when no explicit bin", {
  expect_equal(
    resolve_dwkt_bin(bin = NULL, env = "/env/dwkt", which = ""),
    "/env/dwkt"
  )
})

test_that("PATH lookup is used when no bin or env", {
  expect_equal(
    resolve_dwkt_bin(bin = NULL, env = "", which = "/usr/local/bin/dwkt"),
    "/usr/local/bin/dwkt"
  )
})

test_that("missing binary raises platform-aware install guidance", {
  err <- expect_error(
    resolve_dwkt_bin(bin = NULL, env = "", which = "", sysname = "Windows")
  )
  expect_match(conditionMessage(err), "dwkt-windows.exe", fixed = TRUE)
  expect_match(conditionMessage(err), "releases/latest", fixed = TRUE)
  expect_match(conditionMessage(err), "DARWINKIT_BIN", fixed = TRUE)
})

test_that("macOS guidance names the macos asset", {
  err <- expect_error(
    resolve_dwkt_bin(bin = NULL, env = "", which = "", sysname = "Darwin")
  )
  expect_match(conditionMessage(err), "dwkt-macos", fixed = TRUE)
})

test_that("Linux guidance names the linux asset", {
  err <- expect_error(
    resolve_dwkt_bin(bin = NULL, env = "", which = "", sysname = "Linux")
  )
  expect_match(conditionMessage(err), "dwkt-linux", fixed = TRUE)
})

test_that("unknown platform falls back to build-from-source guidance", {
  err <- expect_error(
    resolve_dwkt_bin(bin = NULL, env = "", which = "", sysname = "SunOS")
  )
  expect_match(conditionMessage(err), "from source", fixed = TRUE)
  expect_match(conditionMessage(err), "DARWINKIT_BIN", fixed = TRUE)
})
