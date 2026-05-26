#!/usr/bin/env bash
# Single-user Nix installer for sandboxed / containerized environments
# (Claude Code web, CI images, rootless containers).
#
# - Installs Nix without the build daemon (single-user mode)
# - Writes /etc/nix/nix.conf with sandbox disabled and flakes enabled
# - Source $HOME/.nix-profile/etc/profile.d/nix.sh after running

set -euo pipefail

NIX_VERSION="2.24.9"
export USER="${USER:-$(id -un)}"
export HOME="${HOME:-/root}"

# nix.conf を先に置く (sandbox 無効・flakes 有効)
mkdir -p /etc/nix "$HOME/.config/nix"
cat > /etc/nix/nix.conf <<'EOF'
build-users-group =
sandbox = false
experimental-features = nix-command flakes
EOF
cp /etc/nix/nix.conf "$HOME/.config/nix/nix.conf"

if [ ! -x "$HOME/.nix-profile/bin/nix" ]; then
  case "$(uname -m)" in
    x86_64)  SYS="x86_64-linux" ;;
    aarch64) SYS="aarch64-linux" ;;
    *) echo "Unsupported arch: $(uname -m)" >&2; exit 1 ;;
  esac

  TARBALL_URL="https://releases.nixos.org/nix/nix-${NIX_VERSION}/nix-${NIX_VERSION}-${SYS}.tar.xz"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  echo "Downloading ${TARBALL_URL}..."
  curl -fsSL "$TARBALL_URL" -o "$tmp/nix.tar.xz"

  mkdir -p "$tmp/unpack"
  tar -xJf "$tmp/nix.tar.xz" -C "$tmp/unpack"
  unpacked="$tmp/unpack/nix-${NIX_VERSION}-${SYS}"

  mkdir -p /nix/store /nix/var/nix
  cp -RPp "$unpacked/store/"* /nix/store/

  nix_pkg="/nix/store/$(basename "$(ls -d "$unpacked/store"/*-nix-"${NIX_VERSION}")")"
  "$nix_pkg/bin/nix-store" --load-db < "$unpacked/.reginfo"

  mkdir -p /nix/var/nix/profiles/per-user/root
  ln -sfn "$nix_pkg" /nix/var/nix/profiles/default
  ln -sfn /nix/var/nix/profiles/default "$HOME/.nix-profile"
fi

# 現在の shell に読み込む (single-user 用 nix.sh)
. "$HOME/.nix-profile/etc/profile.d/nix.sh"
export NIX_SSL_CERT_FILE="${NIX_SSL_CERT_FILE:-/etc/ssl/certs/ca-certificates.crt}"

# 以降の shell 用
cat > /etc/profile.d/nix.sh <<'EOF'
export USER="${USER:-$(id -un)}"
export HOME="${HOME:-/root}"
if [ -e "$HOME/.nix-profile/etc/profile.d/nix.sh" ]; then
  . "$HOME/.nix-profile/etc/profile.d/nix.sh"
fi
export NIX_SSL_CERT_FILE="${NIX_SSL_CERT_FILE:-/etc/ssl/certs/ca-certificates.crt}"
EOF

nix --version
