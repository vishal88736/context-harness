#!/bin/sh
set -eu
canopy_app_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -x "$canopy_app_dir/runtime/node" ]; then
  exec "$canopy_app_dir/runtime/node" "$canopy_app_dir/scripts/launcher.mjs"
fi
exec node "$canopy_app_dir/scripts/launcher.mjs"
