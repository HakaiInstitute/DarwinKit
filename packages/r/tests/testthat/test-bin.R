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

test_that("missing-binary message names dwk_install_engine and DARWINKIT_BIN", {
  for (os in c("Windows", "Darwin", "Linux")) {
    err <- expect_error(
      resolve_dwkt_bin(bin = NULL, env = "", which = "", sysname = os)
    )
    msg <- conditionMessage(err)
    expect_match(msg, "dwk_install_engine", fixed = TRUE)
    expect_match(msg, "DARWINKIT_BIN", fixed = TRUE)
    expect_match(msg, "releases/latest", fixed = TRUE)
  }
})

test_that("dwkt_asset_for maps each supported platform to its release asset", {
  expect_equal(dwkt_asset_for("Darwin"), "dwkt-macos")
  expect_equal(dwkt_asset_for("Linux"), "dwkt-linux")
  expect_equal(dwkt_asset_for("Windows"), "dwkt-windows.exe")
  expect_true(is.na(dwkt_asset_for("SunOS")))
})

test_that("unknown platform falls back to build-from-source guidance", {
  err <- expect_error(
    resolve_dwkt_bin(bin = NULL, env = "", which = "", sysname = "SunOS")
  )
  expect_match(conditionMessage(err), "from source", fixed = TRUE)
  expect_match(conditionMessage(err), "DARWINKIT_BIN", fixed = TRUE)
})

test_that("managed path is under R_user_dir/bin with platform exe name", {
  expect_equal(
    dwkt_managed_path(sysname = "Linux", root = "/root"),
    file.path("/root", "bin", "dwkt")
  )
  expect_equal(
    dwkt_managed_path(sysname = "Windows", root = "/root"),
    file.path("/root", "bin", "dwkt.exe")
  )
})

test_that("managed install path is used when no bin, env, or PATH", {
  tmp <- withr::local_tempfile()
  file.create(tmp)
  expect_equal(
    resolve_dwkt_bin(bin = NULL, env = "", which = "", managed = tmp),
    tmp
  )
})

test_that("env and PATH win over the managed install path", {
  tmp <- withr::local_tempfile()
  file.create(tmp)
  expect_equal(
    resolve_dwkt_bin(bin = NULL, env = "/env/dwkt", which = "", managed = tmp),
    "/env/dwkt"
  )
  expect_equal(
    resolve_dwkt_bin(bin = NULL, env = "", which = "/path/dwkt", managed = tmp),
    "/path/dwkt"
  )
})

test_that("a non-existent managed path is ignored", {
  err <- expect_error(
    resolve_dwkt_bin(
      bin = NULL, env = "", which = "",
      managed = "/does/not/exist/dwkt", sysname = "Linux"
    )
  )
  expect_match(conditionMessage(err), "dwk_install_engine", fixed = TRUE)
})

test_that("install downloads the platform asset to the managed path", {
  dir <- withr::local_tempdir()
  dest <- file.path(dir, "bin", "dwkt")
  captured <- NULL
  res <- dwk_install_engine(
    sysname = "Linux", dest = dest, quiet = TRUE,
    download = function(url, destfile) {
      captured <<- url
      writeLines("#!/bin/sh", destfile)
    }
  )
  expect_true(file.exists(dest))
  expect_equal(res, dest)
  expect_match(captured, "dwkt-linux", fixed = TRUE)
  expect_match(captured, "releases/latest/download", fixed = TRUE)
})

test_that("install marks the binary executable on unix", {
  skip_on_os("windows")
  dir <- withr::local_tempdir()
  dest <- file.path(dir, "bin", "dwkt")
  dwk_install_engine(
    sysname = "Linux", dest = dest, quiet = TRUE,
    download = function(url, destfile) writeLines("#!/bin/sh", destfile)
  )
  expect_equal(file.access(dest, mode = 1)[[1]], 0L)
})

test_that("install is a no-op when already present and force is FALSE", {
  dir <- withr::local_tempdir()
  dest <- file.path(dir, "bin", "dwkt")
  dir.create(dirname(dest), recursive = TRUE)
  writeLines("existing", dest)
  called <- FALSE
  res <- dwk_install_engine(
    sysname = "Linux", dest = dest, quiet = TRUE,
    download = function(url, destfile) called <<- TRUE
  )
  expect_false(called)
  expect_equal(res, dest)
  expect_equal(readLines(dest), "existing")
})

test_that("force = TRUE re-downloads over an existing binary", {
  dir <- withr::local_tempdir()
  dest <- file.path(dir, "bin", "dwkt")
  dir.create(dirname(dest), recursive = TRUE)
  writeLines("old", dest)
  dwk_install_engine(
    sysname = "Linux", dest = dest, quiet = TRUE, force = TRUE,
    download = function(url, destfile) writeLines("new", destfile)
  )
  expect_equal(readLines(dest), "new")
})

test_that("a failed download leaves no binary behind", {
  dir <- withr::local_tempdir()
  dest <- file.path(dir, "bin", "dwkt")
  expect_error(
    dwk_install_engine(
      sysname = "Linux", dest = dest, quiet = TRUE,
      download = function(url, destfile) stop("network down")
    ),
    "Failed to download"
  )
  expect_false(file.exists(dest))
  expect_length(list.files(dirname(dest)), 0)
})

test_that("an empty download leaves no binary behind", {
  dir <- withr::local_tempdir()
  dest <- file.path(dir, "bin", "dwkt")
  expect_error(
    dwk_install_engine(
      sysname = "Linux", dest = dest, quiet = TRUE,
      download = function(url, destfile) file.create(destfile)
    ),
    "no data"
  )
  expect_false(file.exists(dest))
  expect_length(list.files(dirname(dest)), 0)
})

test_that("install on an unsupported platform errors with build guidance", {
  dir <- withr::local_tempdir()
  dest <- file.path(dir, "bin", "dwkt")
  expect_error(
    dwk_install_engine(
      sysname = "SunOS", dest = dest, quiet = TRUE,
      download = function(url, destfile) stop("should not be called")
    ),
    "from source"
  )
  expect_false(file.exists(dest))
})
