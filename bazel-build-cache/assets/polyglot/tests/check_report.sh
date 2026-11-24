#!/usr/bin/env bash
set -euo pipefail
expected="items=3 total=10"
actual="$(cat "$1")"
if [[ "$actual" != "$expected" ]]; then
  echo "expected '$expected', got '$actual'" >&2
  exit 1
fi
