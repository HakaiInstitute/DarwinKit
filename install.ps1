# DarwinKit (dwkit) installer for Windows.
#
#   irm https://raw.githubusercontent.com/HakaiInstitute/DarwinKit/main/install.ps1 | iex
#
# Env:
#   DWKIT_VERSION      pin a version (e.g. 1.3.2 or v1.3.2); default: latest
#   DWKIT_INSTALL_DIR  install directory; default: %LOCALAPPDATA%\Programs\dwkit
#   DWKIT_BASE_URL     advanced: override the asset base URL (mirror/testing)
$ErrorActionPreference = 'Stop'
$repo = 'HakaiInstitute/DarwinKit'

switch ($env:PROCESSOR_ARCHITECTURE) {
  'AMD64' { $arch = 'x86_64' }
  default {
    throw "unsupported architecture '$($env:PROCESSOR_ARCHITECTURE)'. No prebuilt Windows binary; build from source: https://github.com/$repo"
  }
}
$asset = "dwkit-windows-$arch.exe"

if ($env:DWKIT_BASE_URL) {
  $baseUrl = $env:DWKIT_BASE_URL
} elseif ($env:DWKIT_VERSION) {
  $ver = $env:DWKIT_VERSION -replace '^v', ''
  $baseUrl = "https://github.com/$repo/releases/download/v$ver"
} else {
  $baseUrl = "https://github.com/$repo/releases/latest/download"
}

$installDir = if ($env:DWKIT_INSTALL_DIR) {
  $env:DWKIT_INSTALL_DIR
} else {
  Join-Path $env:LOCALAPPDATA 'Programs\dwkit'
}

$tmp = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("dwkit-" + [guid]::NewGuid()))
try {
  Write-Host "Downloading $asset ..."
  Invoke-WebRequest -Uri "$baseUrl/$asset" -OutFile (Join-Path $tmp $asset)
  Invoke-WebRequest -Uri "$baseUrl/SHA256SUMS" -OutFile (Join-Path $tmp 'SHA256SUMS')

  $pattern = "\s$([regex]::Escape($asset))$"
  $expected = Get-Content (Join-Path $tmp 'SHA256SUMS') |
    Where-Object { $_ -match $pattern } |
    ForEach-Object { ($_ -split '\s+')[0] } |
    Select-Object -First 1
  if (-not $expected) { throw "no checksum for $asset in SHA256SUMS" }

  $actual = (Get-FileHash -Algorithm SHA256 -Path (Join-Path $tmp $asset)).Hash.ToLower()
  if ($expected.ToLower() -ne $actual) {
    throw "checksum mismatch for $asset (expected $expected, got $actual)"
  }

  New-Item -ItemType Directory -Force -Path $installDir | Out-Null
  $dest = Join-Path $installDir 'dwkit.exe'
  Move-Item -Force -Path (Join-Path $tmp $asset) -Destination $dest
  Write-Host "Installed dwkit to $dest"

  & $dest --version

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if (($userPath -split ';') -notcontains $installDir) {
    $newPath = if ([string]::IsNullOrEmpty($userPath)) { $installDir } else { "$userPath;$installDir" }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host "Added $installDir to your User PATH. Open a new terminal to use 'dwkit'."
  }
} finally {
  Remove-Item -Recurse -Force $tmp
}
