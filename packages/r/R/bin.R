# GitHub repo that hosts the dwkt release binaries.
.dwkt_repo <- "HakaiInstitute/DarwinKit"

# Map an R Sys.info() sysname to its release asset file name.
dwkt_asset_for <- function(sysname) {
  switch(sysname,
    Darwin  = "dwkt-macos",
    Linux   = "dwkt-linux",
    Windows = "dwkt-windows.exe",
    NA_character_
  )
}

# Managed per-user install location for the dwkt binary. Injectable root so the
# path logic is testable without touching the real user-data directory.
dwkt_managed_path <- function(sysname = Sys.info()[["sysname"]],
                              root = tools::R_user_dir("darwinkit", "data")) {
  exe <- if (identical(sysname, "Windows")) "dwkt.exe" else "dwkt"
  file.path(root, "bin", exe)
}

dwkt_install_message <- function(sysname) {
  asset <- dwkt_asset_for(sysname)
  page <- sprintf("https://github.com/%s/releases/latest", .dwkt_repo)

  if (is.na(asset)) {
    return(paste0(
      "Could not find the 'dwkt' binary, and your platform (", sysname, ") has ",
      "no prebuilt binary. Build it from source (deno task compile:*) and either ",
      "put it on your PATH as 'dwkt' or set the DARWINKIT_BIN environment variable.\n",
      "Releases: ", page
    ))
  }

  paste0(
    "Could not find the 'dwkt' binary.\n",
    "Install it with:\n",
    "  darwinkit::dwk_install_engine()\n",
    "or set DARWINKIT_BIN to the path of an existing binary.\n",
    "Releases: ", page
  )
}

# Resolve the dwkt binary path. Lookups are injectable so the logic is testable
# without a real binary on the machine. Order: explicit bin, DARWINKIT_BIN env,
# PATH, then the managed install path written by dwk_install_engine().
resolve_dwkt_bin <- function(bin = NULL,
                             env = Sys.getenv("DARWINKIT_BIN", ""),
                             which = unname(Sys.which("dwkt")),
                             sysname = Sys.info()[["sysname"]],
                             managed = dwkt_managed_path(sysname)) {
  if (!is.null(bin) && nzchar(bin)) {
    return(bin)
  }
  if (nzchar(env)) {
    return(env)
  }
  if (nzchar(which)) {
    return(which)
  }
  if (nzchar(managed) && file.exists(managed)) {
    return(managed)
  }
  stop(dwkt_install_message(sysname), call. = FALSE)
}

# Default network downloader. Separated so dwk_install_engine() can inject a
# stub in tests and never hit the network.
dwkt_download <- function(url, destfile) {
  utils::download.file(url, destfile, mode = "wb", quiet = TRUE)
}

#' Download and install the DarwinKit engine binary
#'
#' Downloads the `dwkt` release binary for the current platform into a managed
#' per-user location (under [tools::R_user_dir()]), where [dwk_validate()] finds
#' it automatically. No `PATH` editing or administrator rights are required.
#' Re-run with `force = TRUE` to upgrade to the current latest release.
#'
#' @param force If `TRUE`, re-download even when a binary is already installed.
#' @param quiet If `TRUE`, suppress progress messages.
#' @param sysname Platform name; exposed for testing.
#' @param dest Destination path for the binary; exposed for testing.
#' @param download Downloader `function(url, destfile)`; exposed for testing.
#' @return The installed binary path, invisibly.
#' @examples
#' \dontrun{
#' dwk_install_engine()
#' }
#' @export
dwk_install_engine <- function(force = FALSE,
                               quiet = FALSE,
                               sysname = Sys.info()[["sysname"]],
                               dest = dwkt_managed_path(sysname),
                               download = dwkt_download) {
  asset <- dwkt_asset_for(sysname)
  if (is.na(asset)) {
    stop(dwkt_install_message(sysname), call. = FALSE)
  }

  if (file.exists(dest) && !force) {
    if (!quiet) {
      message(
        "dwkt is already installed at ", dest,
        "\nRe-run dwk_install_engine(force = TRUE) to reinstall."
      )
    }
    return(invisible(dest))
  }

  url <- sprintf(
    "https://github.com/%s/releases/latest/download/%s", .dwkt_repo, asset
  )
  dir.create(dirname(dest), recursive = TRUE, showWarnings = FALSE)
  if (!quiet) message("Downloading ", asset, " (latest)...")

  # Download to a temp file in the destination directory, then move into place,
  # so a failed or partial download never leaves a binary where the resolver
  # would find it.
  tmp <- tempfile("dwkt-", tmpdir = dirname(dest))
  tryCatch(
    download(url, tmp),
    error = function(e) {
      if (file.exists(tmp)) unlink(tmp)
      stop(
        "Failed to download dwkt from ", url, ": ", conditionMessage(e),
        call. = FALSE
      )
    }
  )

  if (!file.exists(tmp) || file.info(tmp)$size == 0) {
    if (file.exists(tmp)) unlink(tmp)
    stop("Download produced no data from ", url, call. = FALSE)
  }

  # rename is atomic within the same directory; fall back to copy if it fails
  # (e.g. crossing a filesystem boundary).
  if (!file.rename(tmp, dest)) {
    file.copy(tmp, dest, overwrite = TRUE)
    unlink(tmp)
  }
  if (!identical(sysname, "Windows")) Sys.chmod(dest, "0755")

  if (!quiet) message("Installed dwkt to ", dest)
  invisible(dest)
}
