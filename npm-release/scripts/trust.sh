#!/usr/bin/env bash
# Register a GitHub Actions trusted publisher for every public package in a repo.
# `npm trust` is unaware of workspaces, so this walks them.
#
# Usage: trust.sh [--dry-run] [--file <workflow.yml>] [--env <name>] <repo-path>
#
# Packages: the root package.json when it is not private, plus every
# non-private packages/*/package.json. owner/repo comes from the origin remote.
# Run it yourself: npm asks for 2FA on the first request.

set -euo pipefail

file=release.yml
dry=""
env_args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) dry=1; shift ;;
    --file) file="${2:?--file needs a filename}"; shift 2 ;;
    --env) env_args=(--env "${2:?--env needs a name}"); shift 2 ;;
    -*) echo "error: unknown option $1" >&2; exit 2 ;;
    *) break ;;
  esac
done
repo="${1:?usage: trust.sh [--dry-run] [--file <workflow.yml>] [--env <name>] <repo-path>}"
cd "$repo"

owner_repo=$(git remote get-url origin \
  | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##')
[ -f ".github/workflows/$file" ] || echo "warning: .github/workflows/$file does not exist" >&2

pkgs=()
for p in package.json packages/*/package.json; do
  [ -f "$p" ] || continue
  [ "$(jq -r '.private // false' "$p")" = true ] && continue
  pkgs+=("$(jq -r '.name' "$p")")
done
[ ${#pkgs[@]} -gt 0 ] || { echo "error: no public packages found" >&2; exit 1; }

for name in "${pkgs[@]}"; do
  cmd=(npm trust github "$name" --repo "$owner_repo" --file "$file" ${env_args[@]+"${env_args[@]}"} --allow-publish -y)
  if [ -n "$dry" ]; then
    echo "${cmd[*]}"
  else
    echo "→ $name"
    "${cmd[@]}"
  fi
done
