#!/usr/bin/env bash
# Print the directory of a mizchi/skills skill so its SKILL.md can be read and followed.
#
#   bash fetch_skill.sh <name>
#
# Order: an installed copy (./.claude/skills, ~/.claude/skills, ./.agents/skills, ~/.agents/skills), then
# $MIZCHI_SKILLS_DIR (a local checkout), then a shallow clone of github.com/mizchi/skills kept in
# ${XDG_CACHE_HOME:-~/.cache}/mizchi-skills and refreshed when older than a day. Installs nothing and writes no
# agent configuration.
set -euo pipefail
name="${1:-}"
if [[ ! "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "usage: fetch_skill.sh <skill-name> (lowercase letters, digits, hyphens)" >&2
  exit 2
fi
for d in "$PWD/.claude/skills" "$HOME/.claude/skills" "$PWD/.agents/skills" "$HOME/.agents/skills"; do
  if [ -f "$d/$name/SKILL.md" ]; then echo "$d/$name"; exit 0; fi
done
src="${MIZCHI_SKILLS_DIR:-}"
if [ -z "$src" ]; then
  src="${XDG_CACHE_HOME:-$HOME/.cache}/mizchi-skills"
  if [ ! -d "$src/.git" ]; then
    git clone -q --depth 1 https://github.com/mizchi/skills.git "$src" >&2
  elif [ -n "$(find "$src/.git/FETCH_HEAD" "$src/.git/HEAD" -mmin +1440 2>/dev/null | head -1)" ] || [ ! -f "$src/.git/FETCH_HEAD" ]; then
    git -C "$src" pull -q --ff-only >&2 || echo "fetch_skill: could not update $src; using the cached copy" >&2
  fi
fi
if [ -f "$src/$name/SKILL.md" ]; then
  echo "$src/$name"
  exit 0
fi
echo "fetch_skill: no skill named '$name' in $src (see references/catalog.md)" >&2
exit 1
