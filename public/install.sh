#!/bin/sh
# memory-pack installer
#
#   curl -fsSL https://chatgpt.significanthobbies.com/install.sh | sh
#
# Downloads the memory-pack binary for this machine from GitHub Releases,
# verifies its checksum, and installs it. Nothing is compiled and no package
# manager is required.
#
# memory-pack releases and history live in the standalone Insights repository.
# The SaaS Maker fallback preserves any releases made during consolidation.
#
# Environment:
#   MEMORY_PACK_VERSION   release tag to install (default: latest)
#   MEMORY_PACK_BIN_DIR   install directory (default: $HOME/.local/bin)

set -eu

REPO="sarthakagrawal927/chatgpt-memory-insights"
LEGACY_REPO="sass-maker/saas-maker"
TAG_PREFIX="memory-pack-v"
BINARY="memory-pack"
VERSION="${MEMORY_PACK_VERSION:-latest}"
BIN_DIR="${MEMORY_PACK_BIN_DIR:-$HOME/.local/bin}"

say() { printf '%s\n' "$*"; }
die() { printf 'install: %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1; }

detect_target() {
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin)
      case "$arch" in
        arm64 | aarch64) echo "aarch64-apple-darwin" ;;
        x86_64) echo "x86_64-apple-darwin" ;;
        *) die "unsupported macOS architecture: $arch" ;;
      esac
      ;;
    Linux)
      case "$arch" in
        aarch64 | arm64) echo "aarch64-unknown-linux-musl" ;;
        x86_64 | amd64) echo "x86_64-unknown-linux-musl" ;;
        *) die "unsupported Linux architecture: $arch" ;;
      esac
      ;;
    *)
      die "unsupported system: $os. Build from source instead:
  cargo install --git https://github.com/$REPO memory-pack"
      ;;
  esac
}

fetch() {
  # fetch <url> <destination>
  if need curl; then
    curl -fsSL --retry 3 "$1" -o "$2"
  elif need wget; then
    wget -q "$1" -O "$2"
  else
    die "neither curl nor wget is available"
  fi
}

verify() {
  # verify <file> <expected-name> <sums-file>
  expected="$(awk -v name="$2" '$2 == name || $2 == "*" name { print $1 }' "$3" | head -n 1)"
  [ -n "$expected" ] || die "no checksum published for $2"

  if need sha256sum; then
    actual="$(sha256sum "$1" | awk '{ print $1 }')"
  elif need shasum; then
    actual="$(shasum -a 256 "$1" | awk '{ print $1 }')"
  else
    say "warning: no sha256 tool found, skipping checksum verification"
    return 0
  fi

  [ "$actual" = "$expected" ] || die "checksum mismatch for $2
  expected $expected
  actual   $actual"
  say "checksum verified"
}

target="$(detect_target)"
asset="$BINARY-$target"

tmp="$(mktemp -d)"
cleanup() {
  rm -f "$tmp/releases.json" "$tmp/probe" "$tmp/$BINARY" "$tmp/SHA256SUMS"
  rmdir "$tmp"
}
trap cleanup EXIT INT TERM

latest_tag() {
  # latest_tag <repo>: newest published memory-pack release tag, if any.
  # SaaS Maker hosts other releases too, so /releases/latest is not usable.
  fetch "https://api.github.com/repos/$1/releases?per_page=100" "$tmp/releases.json" 2>/dev/null ||
    return 1
  sed -n "s/.*\"tag_name\": *\"\($TAG_PREFIX[^\"]*\)\".*/\1/p" "$tmp/releases.json" | head -n 1
}

if [ "$VERSION" = "latest" ]; then
  primary_lookup_failed=false
  legacy_lookup_failed=false
  if VERSION="$(latest_tag "$REPO")"; then
    :
  else
    primary_lookup_failed=true
  fi
  if [ -n "$VERSION" ]; then
    base="https://github.com/$REPO/releases/download/$VERSION"
  else
    if VERSION="$(latest_tag "$LEGACY_REPO")"; then
      :
    else
      legacy_lookup_failed=true
    fi
    if [ -n "$VERSION" ]; then
      base="https://github.com/$LEGACY_REPO/releases/download/$VERSION"
    elif [ "$primary_lookup_failed" = true ] && [ "$legacy_lookup_failed" = true ]; then
      VERSION="memory-pack-v0.1.2"
      base="https://github.com/$REPO/releases/download/$VERSION"
      say "warning: both release API lookups failed; using retained $VERSION"
    else
      die "no memory-pack release is available"
    fi
  fi
else
  base="https://github.com/$REPO/releases/download/$VERSION"
  if ! fetch "$base/SHA256SUMS" "$tmp/probe" 2>/dev/null; then
    base="https://github.com/$LEGACY_REPO/releases/download/$VERSION"
  fi
fi

say "Downloading $asset ($VERSION)"
fetch "$base/$asset" "$tmp/$BINARY" ||
  die "could not download $base/$asset
Check that a release exists, or build from source:
  cargo install --git https://github.com/$REPO memory-pack"

if fetch "$base/SHA256SUMS" "$tmp/SHA256SUMS" 2>/dev/null; then
  verify "$tmp/$BINARY" "$asset" "$tmp/SHA256SUMS"
else
  say "warning: no SHA256SUMS published for this release, skipping verification"
fi

mkdir -p "$BIN_DIR" || die "could not create $BIN_DIR"
chmod +x "$tmp/$BINARY"
mv -f "$tmp/$BINARY" "$BIN_DIR/$BINARY" || die "could not install into $BIN_DIR"

# A binary carrying the quarantine attribute is killed by Gatekeeper with no
# message at all. curl does not set it, but a proxy or wrapper might.
if [ "$(uname -s)" = "Darwin" ] && need xattr; then
  xattr -d com.apple.quarantine "$BIN_DIR/$BINARY" 2>/dev/null || true
fi

say "Installed $BINARY to $BIN_DIR/$BINARY"

case ":${PATH}:" in
  *":$BIN_DIR:"*)
    say ""
    say "Run it:"
    say "  $BINARY --dry-run --list"
    ;;
  *)
    say ""
    say "$BIN_DIR is not on your PATH. Add it:"
    say "  export PATH=\"\$PATH:$BIN_DIR\""
    say ""
    say "Or run it directly:"
    say "  $BIN_DIR/$BINARY --dry-run --list"
    ;;
esac
