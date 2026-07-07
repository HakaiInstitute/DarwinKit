#!/bin/sh
# DarwinKit (dwkit) installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/HakaiInstitute/DarwinKit/main/install.sh | sh
#
# Env:
#   DWKIT_VERSION      pin a version (e.g. 1.3.2 or v1.3.2); default: latest
#   DWKIT_INSTALL_DIR  install directory; default: $HOME/.local/bin
#   DWKIT_BASE_URL     advanced: override the asset base URL (mirror/testing)
set -eu

REPO="HakaiInstitute/DarwinKit"

info() { printf '%s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- detect target ----------------------------------------------------------
os=$(uname -s)
case "$os" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) die "unsupported OS '$os'. Build from source: https://github.com/$REPO" ;;
esac

arch=$(uname -m)
case "$arch" in
  x86_64 | amd64) arch="x86_64" ;;
  aarch64 | arm64) arch="arm64" ;;
  *) die "unsupported architecture '$arch'. Build from source: https://github.com/$REPO" ;;
esac

target="${os}-${arch}"
case "$target" in
  darwin-arm64 | linux-x86_64 | linux-arm64) ;;
  *) die "no prebuilt binary for '$target'. Build from source: https://github.com/$REPO" ;;
esac
asset="dwkit-${target}"

# --- resolve base url + install dir -----------------------------------------
if [ -n "${DWKIT_BASE_URL:-}" ]; then
  base_url="$DWKIT_BASE_URL"
elif [ -n "${DWKIT_VERSION:-}" ]; then
  ver="${DWKIT_VERSION#v}"
  base_url="https://github.com/$REPO/releases/download/v${ver}"
else
  base_url="https://github.com/$REPO/releases/latest/download"
fi
install_dir="${DWKIT_INSTALL_DIR:-$HOME/.local/bin}"

# --- download ---------------------------------------------------------------
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Retry with linear backoff. GitHub's release-download redirect can 404 for a
# short window just after a release is published, and networks are flaky —
# retrying resolves both without failing an otherwise-good install.
fetch() {
  attempt=1
  max=6
  while :; do
    curl -fsSL "$1" -o "$2" && return 0
    [ "$attempt" -ge "$max" ] && return 1
    delay=$((attempt * 3))
    info "  download failed (attempt $attempt/$max); retrying in ${delay}s ..."
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

info "Downloading $asset ..."
fetch "$base_url/$asset" "$tmp/$asset" || die "failed to download $base_url/$asset"
fetch "$base_url/SHA256SUMS" "$tmp/SHA256SUMS" || die "failed to download $base_url/SHA256SUMS"

# --- verify checksum --------------------------------------------------------
expected=$(grep -E "[[:space:]]${asset}\$" "$tmp/SHA256SUMS" | awk '{print $1}')
[ -n "$expected" ] || die "no checksum for $asset in SHA256SUMS"

if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/$asset" | awk '{print $1}')
else
  actual=$(shasum -a 256 "$tmp/$asset" | awk '{print $1}')
fi
[ "$expected" = "$actual" ] || die "checksum mismatch for $asset (expected $expected, got $actual)"

# --- install ----------------------------------------------------------------
mkdir -p "$install_dir"
chmod 0755 "$tmp/$asset"
mv "$tmp/$asset" "$install_dir/dwkit"
info "Installed dwkit to $install_dir/dwkit"

# --- post-install -----------------------------------------------------------
if v=$("$install_dir/dwkit" --version 2>/dev/null); then
  info "dwkit $v is ready."
else
  info "Installed, but 'dwkit --version' did not run cleanly."
fi

case ":$PATH:" in
  *":$install_dir:"*) ;;
  *) info "Add it to your PATH:  export PATH=\"$install_dir:\$PATH\"" ;;
esac
