#!/usr/bin/env bash
# Protect release tags (v*) with a repository ruleset: only repository admins
# can create, move, or delete them. With tag-triggered publishing, whoever can
# push a v* tag can publish to npm, so this is part of the release setup.
#
# Usage: protect-tags.sh [--pattern 'v*'] <owner/repo>
#
# Idempotent: if a ruleset with the same name exists, it is updated in place.

set -euo pipefail

pattern='v*'
while [ $# -gt 0 ]; do
  case "$1" in
    --pattern) pattern="${2:?--pattern needs a glob}"; shift 2 ;;
    -*) echo "error: unknown option $1" >&2; exit 2 ;;
    *) break ;;
  esac
done
repo="${1:?usage: protect-tags.sh [--pattern 'v*'] <owner/repo>}"
name="protect release tags"

# actor_id 5 = the Repository admin role.
body=$(jq -n --arg name "$name" --arg ref "refs/tags/$pattern" '{
  name: $name,
  target: "tag",
  enforcement: "active",
  conditions: { ref_name: { include: [$ref], exclude: [] } },
  rules: [ { type: "creation" }, { type: "update" }, { type: "deletion" } ],
  bypass_actors: [ { actor_id: 5, actor_type: "RepositoryRole", bypass_mode: "always" } ]
}')

id=$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$name\") | .id")
if [ -n "$id" ]; then
  gh api -X PUT "repos/$repo/rulesets/$id" --input - <<<"$body" >/dev/null
  echo "updated ruleset $id on $repo (refs/tags/$pattern)"
else
  id=$(gh api -X POST "repos/$repo/rulesets" --input - <<<"$body" --jq .id)
  echo "created ruleset $id on $repo (refs/tags/$pattern)"
fi
gh api "repos/$repo/rulesets/$id" \
  --jq '{name, enforcement, include: .conditions.ref_name.include, rules: [.rules[].type], can_bypass: .current_user_can_bypass}'
