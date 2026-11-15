#!/bin/sh
set -eu
exec node "$(dirname "$0")/frontend-audit.mjs" typescript "$@"
