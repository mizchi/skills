#!/usr/bin/env bash
# Set up tag-triggered npm publishing (OIDC Trusted Publishing) for a
# single-package repo.
#
# Usage: migrate.sh [--workflow <file.yml>] [--force] <repo-path>
#
#   --workflow  workflow filename (default: release.yml). Must match the
#               --file given to `npm trust github`. For a repo migrating off
#               release-please whose trust is already bound to publish.yml,
#               pass --workflow publish.yml --force to keep the binding.
#   --force     overwrite the workflow file if it exists.
#
# What it does:
#  1. Verifies the git working tree is clean
#  2. Writes .github/workflows/<workflow> (push tag v* -> verify -> npm publish
#     via OIDC -> GitHub Release from CHANGELOG.md)
#  3. Patches package.json: repository/homepage/bugs/publishConfig
#  4. Warns about leftover release-please files (does not delete them)
#
# It does NOT stage, commit, push, publish, or run `npm trust`.

set -euo pipefail

workflow=release.yml
force=""
while [ $# -gt 0 ]; do
  case "$1" in
    --workflow) workflow="${2:?--workflow needs a filename}"; shift 2 ;;
    --force) force=1; shift ;;
    -*) echo "error: unknown option $1" >&2; exit 2 ;;
    *) break ;;
  esac
done
repo="${1:?usage: migrate.sh [--workflow <file.yml>] [--force] <repo-path>}"
case "$workflow" in *.yml|*.yaml) ;; *) echo "error: --workflow must end in .yml/.yaml" >&2; exit 2 ;; esac

[ -d "$repo/.git" ] || { echo "error: $repo is not a git repo" >&2; exit 1; }
[ -f "$repo/package.json" ] || { echo "error: $repo/package.json missing" >&2; exit 1; }
cd "$repo"

if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree not clean at $repo" >&2
  git status --short >&2
  exit 1
fi

if [ "$(jq -r '.private // false' package.json)" = true ]; then
  echo "error: root package.json is private (monorepo?). See references/monorepo.md" >&2
  exit 1
fi

name=$(jq -r '.name' package.json)
version=$(jq -r '.version' package.json)
pm=$(jq -r '.packageManager // ""' package.json)
has_script() { jq -e --arg s "$1" '.scripts[$s] // empty' package.json >/dev/null; }

owner_repo=$(git remote get-url origin 2>/dev/null \
  | sed -E 's#^(git@github\.com:|https://github\.com/)##; s#\.git$##' || true)
case "$owner_repo" in
  */*) ;;
  *) echo "error: cannot derive owner/repo from origin remote" >&2; exit 1 ;;
esac
owner=${owner_repo%%/*}
reponame=${owner_repo##*/}

if [[ "$pm" == pnpm@* ]] || [ -f pnpm-lock.yaml ]; then
  manager=pnpm
  setup_pm=$'      - uses: pnpm/action-setup@v6\n'
  install_cmd="pnpm install --frozen-lockfile"
  run="pnpm run"
else
  manager=npm
  setup_pm=""
  install_cmd="npm ci"
  run="npm run"
fi

echo "→ $owner_repo ($name@$version, $manager)"

verify_steps=""
for s in typecheck lint test build; do
  if has_script "$s"; then verify_steps+="      - run: $run $s"$'\n'; fi
done

mkdir -p .github/workflows
wf=".github/workflows/$workflow"
if [ -f "$wf" ] && [ -z "$force" ]; then
  echo "  ! $wf exists, skipped (use --force to overwrite)"
else
  cat > "$wf" <<YAML
name: release

# Push a v* tag to publish. npm trusts this workflow by filename:
#   npm trust github $name --repo $owner_repo --file $workflow --allow-publish
# No NPM_TOKEN: npm authenticates through OIDC and attaches provenance.
on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write   # gh release create
      id-token: write   # npm trusted publishing (OIDC)
    steps:
      - uses: actions/checkout@v6
${setup_pm}      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: ${manager}
          registry-url: https://registry.npmjs.org
      - run: ${install_cmd}
      - name: Tag matches package.json version
        run: |
          v=\$(node -p "require('./package.json').version")
          if [ "v\$v" != "\$GITHUB_REF_NAME" ]; then
            echo "package.json is \$v, tag is \$GITHUB_REF_NAME"; exit 1
          fi
${verify_steps}      # Trusted publishing needs npm >= 11.5.1.
      - run: npm install -g npm@11
      - name: Publish
        run: |
          version=\${GITHUB_REF_NAME#v}
          case "\$version" in
            *-*) npm publish --access public --tag next ;;
            *)   npm publish --access public ;;
          esac
      - name: GitHub release from the changelog
        run: |
          version=\${GITHUB_REF_NAME#v}
          prerelease=""
          case "\$version" in *-*) prerelease="--prerelease" ;; esac
          awk -v h="## \$version" '\$0 == h || index(\$0, h" ") == 1 { on = 1; next } on && /^## / { exit } on' CHANGELOG.md > notes.md 2>/dev/null || true
          if grep -q '[^[:space:]]' notes.md; then
            gh release create "\$GITHUB_REF_NAME" --title "\$GITHUB_REF_NAME" --notes-file notes.md \$prerelease
          else
            gh release create "\$GITHUB_REF_NAME" --title "\$GITHUB_REF_NAME" --generate-notes \$prerelease
          fi
        env:
          GH_TOKEN: \${{ github.token }}
YAML
  echo "  + $wf"
fi

tmp=$(mktemp)
jq --arg owner "$owner" --arg repo "$reponame" '
  (if .repository then . else . + {
    "repository": { "type": "git", "url": "git+https://github.com/\($owner)/\($repo).git" }
  } end)
  | (if .homepage then . else . + { "homepage": "https://github.com/\($owner)/\($repo)#readme" } end)
  | (if .bugs then . else . + { "bugs": { "url": "https://github.com/\($owner)/\($repo)/issues" } } end)
  | (if .publishConfig then . else . + { "publishConfig": { "access": "public" } } end)
' package.json > "$tmp" && mv "$tmp" package.json
echo "  ~ package.json patched"

repo_url=$(jq -r '.repository.url // .repository // ""' package.json)
case "$repo_url" in
  *"github.com/$owner_repo"*|*"github:$owner_repo"*|"$owner_repo") ;;
  *) echo "  ! package.json repository ($repo_url) does not point at $owner_repo; provenance will fail with E422" ;;
esac

for f in .github/workflows/release-please.yml .github/workflows/release-please.yaml \
         release-please-config.json .release-please-manifest.json; do
  [ -e "$f" ] && echo "  ! leftover release-please file: $f (delete it)"
done
if [ "$workflow" != publish.yml ] && [ -f .github/workflows/publish.yml ] \
   && grep -q 'release:' .github/workflows/publish.yml; then
  echo "  ! .github/workflows/publish.yml publishes on release events; delete it or rerun with --workflow publish.yml --force"
fi

echo "✓ done"
echo
echo "Next (the user runs the npm steps):"
if npm view "$name" version >/dev/null 2>&1; then
  echo "  $name is on npm; skip the first publish"
else
  echo "  npm publish --access public            # first publish, by hand"
fi
echo "  npm trust github $name --repo $owner_repo --file $workflow --allow-publish -y"
echo "  $(dirname "$0")/protect-tags.sh $owner_repo   # v* tags: admins only"
echo "  git switch -c chore/tag-release && git add -A && git commit -m 'ci: publish to npm on tag push via trusted publishing'"
