---
title: "Installation"
nav_order: 2
nav_section: "Getting Started"
description: "Install the dwkit binary, or run DarwinKit from source with Deno."
---

# Installation

## Install the binary

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/HakaiInstitute/DarwinKit/main/install.sh | sh
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/HakaiInstitute/DarwinKit/main/install.ps1 | iex
```

The installer detects your OS/architecture, downloads the matching binary,
verifies its SHA-256 checksum, and installs `dwkit` to `~/.local/bin`
(`%LOCALAPPDATA%\Programs\dwkit` on Windows). Confirm it works:

```bash
dwkit --version
```

Two optional environment variables control the install:

- `DWKIT_VERSION` — pin a specific version (e.g. `DWKIT_VERSION=1.3.2`); default is the latest release.
- `DWKIT_INSTALL_DIR` — install to a different directory.

**R users:** biocleanr's `dwc_install_engine()` downloads the same binary
automatically — no manual install needed.

## Run from source

Requires [Deno 2.0+](https://deno.land/):

```bash
deno task cli validate
```
