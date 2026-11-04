#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "$(uname -m)" in
  x86_64) canopy_arch=x64 ;;
  aarch64) canopy_arch=arm64 ;;
  *) echo 'This helper supports Linux x64 and arm64.' >&2; exit 1 ;;
esac
canopy_cache="$PWD/.cache/cloudshell-node"
mkdir -p "$canopy_cache"
curl --fail --silent --show-error --location https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt --output "$canopy_cache/SHASUMS256.txt"
canopy_archive=$(awk -v arch="$canopy_arch" '$2 ~ "^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$" {print $2}' "$canopy_cache/SHASUMS256.txt")
[[ "$canopy_archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || { echo 'Could not resolve an official Node 24 archive.' >&2; exit 1; }
curl --fail --silent --show-error --location "https://nodejs.org/dist/latest-v24.x/$canopy_archive" --output "$canopy_cache/$canopy_archive"
awk -v file="$canopy_archive" '$2 == file' "$canopy_cache/SHASUMS256.txt" > "$canopy_cache/selected.sha256"
(cd "$canopy_cache" && sha256sum --check selected.sha256)
tar -xJf "$canopy_cache/$canopy_archive" -C "$canopy_cache"
canopy_install="$canopy_cache/${canopy_archive%.tar.xz}"
printf 'export PATH=%q/bin:"$PATH"\n' "$canopy_install" > "$canopy_cache/env.sh"
echo 'Node 24 is installed inside this checkout. Run: source .cache/cloudshell-node/env.sh'
