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

dwkt_install_message <- function(sysname) {
  asset <- dwkt_asset_for(sysname)
  base <- sprintf(
    "https://github.com/%s/releases/latest/download", .dwkt_repo
  )
  page <- sprintf("https://github.com/%s/releases/latest", .dwkt_repo)

  if (is.na(asset)) {
    return(paste0(
      "Could not find the 'dwkt' binary, and your platform (", sysname, ") has ",
      "no prebuilt binary. Build it from source (deno task compile:*) and either ",
      "put it on your PATH as 'dwkt' or set the DARWINKIT_BIN environment variable.\n",
      "Releases: ", page
    ))
  }

  install_cmd <- if (identical(sysname, "Windows")) {
    sprintf("curl -L -o dwkt.exe %s/%s", base, asset)
  } else {
    sprintf("curl -L -o dwkt %s/%s && chmod +x dwkt", base, asset)
  }

  paste0(
    "Could not find the 'dwkt' binary.\n",
    "Install it for your platform (", sysname, "):\n",
    "  ", install_cmd, "\n",
    "or download it from ", page, " (asset: ", asset, ").\n",
    "Then put it on your PATH as 'dwkt', or set DARWINKIT_BIN to its path."
  )
}

# Resolve the dwkt binary path. Lookups are injectable so the logic is testable
# without a real binary on the machine.
resolve_dwkt_bin <- function(bin = NULL,
                             env = Sys.getenv("DARWINKIT_BIN", ""),
                             which = unname(Sys.which("dwkt")),
                             sysname = Sys.info()[["sysname"]]) {
  if (!is.null(bin) && nzchar(bin)) {
    return(bin)
  }
  if (nzchar(env)) {
    return(env)
  }
  if (nzchar(which)) {
    return(which)
  }
  stop(dwkt_install_message(sysname), call. = FALSE)
}
