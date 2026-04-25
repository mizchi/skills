---
name: conventional-changelog
description: Reference for Conventional Commits and automatic CHANGELOG generation. Compares release-please / changesets / git-cliff / towncrier and covers commit format, Keep a Changelog, and semver tag practices. Use when setting up or unifying a release flow.
---

# Conventional Changelog

A guide to writing commit messages following the Conventional Commits spec and mechanically generating CHANGELOGs and semver tags from them. Pick tools across npm / cargo / python / rust / go and avoid writing CHANGELOGs by hand.

## When to use

- Setting up a release flow on a new repo
- Commit messages on an existing repo are inconsistent and you want to introduce CHANGELOG generation
- You tried release-please but it did not fit / you want to evaluate alternatives
- Looking for a changelog tool suited to the language (Rust / Python / Go, etc.)
- Tags and CHANGELOGs keep breaking under manual operation, and you want to automate them

## Conventional Commits format

Form: `<type>[optional scope]: <subject>`

```
feat(api): add rate-limit middleware
fix(auth): reject expired tokens before DB lookup
docs: clarify OAuth flow diagram
chore: bump deps
```

### List of types and semver impact

| type | semver bump | Included in CHANGELOG |
|---|---|---|
| `feat` | **minor** | ✓ (Added / Features) |
| `fix` | **patch** | ✓ (Fixed) |
| `perf` | patch | ✓ (Changed) |
| `refactor` | none | × (default) |
| `docs` | none | × |
| `style` | none | × |
| `test` | none | × |
| `build` | none | × |
| `ci` | none | × |
| `chore` | none | × |
| `revert` | depends on the reverted commit | ✓ |

### Breaking change (major bump)

Two ways: put `BREAKING CHANGE:` in the footer, or a `!` after the type:

```
feat(api)!: replace REST endpoint with GraphQL

BREAKING CHANGE: /api/v1/users is removed. Use GraphQL Query.user instead.
```

Writing both is polite (obvious from the title + detail in the footer).

### scope

Optional, but including it makes the CHANGELOG easier to read. In a monorepo, use the package name as the scope:

```
feat(@pkg/auth): add oauth2 flow
feat(@pkg/billing): stripe migration
```

release-please also auto-detects the "target package of the change" from the scope (in manifest mode).

### subject

- Start lowercase (no trailing period)
- Imperative mood ("add X" / "fix Y"; avoid "added" or "fixes")
- Aim for 50 characters or fewer

### body / footer

Body after a blank line, then another blank line before the footer (`Closes #123`, `Co-authored-by: ...`, `BREAKING CHANGE: ...`).

## CHANGELOG.md format (Keep a Changelog)

Follows [keepachangelog.com](https://keepachangelog.com/). Versions in descending order, semver, and a fixed set of 6 sections:

```markdown
# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- foo bar

## [1.2.0] - 2026-04-19

### Added

- New `--json` output flag for `foo scan` ([#42](https://github.com/owner/repo/pull/42))

### Changed

- `parse_config` now accepts YAML in addition to TOML

### Fixed

- Crash when config file is empty ([#40](https://github.com/owner/repo/issues/40))

### Deprecated

- `--legacy-mode` flag. Use `--mode=legacy` instead.

### Removed

- `foo bar --old-flag` (deprecated in 1.0.0)

### Security

- Upgrade `openssl` to 3.2.0 to address CVE-2025-XXXXX

## [1.1.0] - 2026-03-01

...

[Unreleased]: https://github.com/owner/repo/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/owner/repo/compare/v1.1.0...v1.2.0
```

The 6 sections:
- `Added`: new features
- `Changed`: changes to existing functionality
- `Deprecated`: scheduled for removal (still present)
- `Removed`: already removed
- `Fixed`: bug fixes
- `Security`: vulnerability fixes

## semver tag practices

- Tags in `v<MAJOR>.<MINOR>.<PATCH>` form (`v1.2.3`). The `v` prefix is the norm
- Pre-releases: `v1.0.0-beta.1` / `v1.0.0-rc.1`
- `git tag -a v1.2.3 -m "Release v1.2.3"` (annotated tag) → `git push origin v1.2.3`
- Wire up tag creation and deployment via GitHub Release + Actions with `on: release`

## Tool comparison

| Tool | Supported languages | Style | CHANGELOG generation | version bump | Main strengths | Weaknesses |
|---|---|---|---|---|---|---|
| **release-please** | npm / python / rust / go / java / php / ruby | Auto-creates a Release PR | ✓ | ✓ (tag on PR merge) | Monorepo support, stable Google-maintained project | PR-based with a learning curve |
| **changesets** | npm only | Manual entries via `changeset add` | ✓ | ✓ | Monorepo + flexibility (npm workspaces) | Not commit-driven |
| **conventional-changelog-cli** | Language-agnostic (command) | One-shot generation from commits | ✓ | × | Lightweight, appends to existing CHANGELOG | Tags / bumps handled separately by hand |
| **standard-version** (deprecated) | npm | commit → bump + CHANGELOG | ✓ | ✓ | Simple | **Maintenance halted**; migration to release-please recommended |
| **git-cliff** | Language-agnostic (written in Rust) | Highly customizable via TOML config | ✓ | × | Fast, flexible templates, popular in the Rust ecosystem | Tags / bumps separate |
| **towncrier** | Python | Write a news fragment per PR | ✓ | × | Fragments avoid merge conflicts | Idiosyncratic workflow |
| **auto** (intuit/auto) | Multiple | Label-based + CI integration | ✓ | ✓ | Driven by GitHub labels | Custom label conventions |

### One-line recommendations

- **Want to automate a single npm package** → release-please
- **npm monorepo** → release-please (manifest mode) or changesets (for fine-grained control)
- **Rust** → git-cliff
- **Python** → towncrier (or release-please)
- **Go / generic** → git-cliff or release-please
- **Just want to generate a CHANGELOG (manual tag management)** → conventional-changelog-cli or git-cliff

## release-please setup (most recommended path)

Fresh setup on an npm project:

```json
// release-please-config.json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "release-type": "node",
  "packages": {
    ".": { "package-name": "my-pkg", "changelog-path": "CHANGELOG.md" }
  },
  "include-v-in-tag": true,
  "bump-minor-pre-major": true
}
```

```json
// .release-please-manifest.json
{ ".": "0.0.0" }
```

```yaml
# .github/workflows/release-please.yml
name: release-please
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

Write commits following the Conventional Commits spec and push to main; a "Release PR" is created automatically. Merging it triggers the tag + GitHub Release + CHANGELOG update.

**Two forms of publish-linked workflow**:

| Form | trigger | Strengths | Weaknesses |
|---|---|---|---|
| Job separation within the same workflow (`needs: release-please` + `if: outputs.release_created`) | `push: main` | Self-contained in one file, directly references release-please outputs, easy to grasp | If the release-please job fails, publish is dragged down with it; responsibilities get mixed |
| Separate workflow (`on: release`) | `release: { types: [published] }` | Separation of concerns, publish runs even for manual releases, re-runs are independent | secrets / permissions must be declared in two places; release-please outputs are unavailable |

**Selection guidance**: For a single package with a single publish target (npm only), a single workflow is concise. If there are multiple publish targets (npm + GitHub Container Registry etc.) or manual releases are also allowed, use a separate `on: release` workflow. When using OIDC Trusted Publishing, attaching `id-token: write` only to the publish job is sufficient, and either form works.

See the publish flow in the `npm-release` skill (locally managed) for details.

### Pre-release (beta / rc) staged releases

When you want to ship a v2.0.0 with breaking changes in the order beta → rc → stable. Use release-please's `prerelease` / `prerelease-type` flags:

```json
// release-please-config.json
{
  "packages": {
    ".": {
      "package-name": "my-pkg",
      "prerelease": true,
      "prerelease-type": "beta"
    }
  }
}
```

Flow:

1. Stack commits with `prerelease-type: "beta"` → `v2.0.0-beta.1` is cut
2. More commits stack up as `v2.0.0-beta.2` / `beta.3` ...
3. Promote to RC: rewrite config to `"prerelease-type": "rc"` → `v2.0.0-rc.1`
4. Stable release: `"prerelease": false` (or remove the field) → `v2.0.0`

**How to write the CHANGELOG**: release-please **finalizes an independent section for each beta/rc** (it is not the Keep a Changelog style of accumulating into `[Unreleased]`). `[2.0.0-beta.1]` / `[2.0.0-beta.2]` / `[2.0.0-rc.1]` / `[2.0.0]` all remain. The `2.0.0` stable section aggregates every `feat!` / `BREAKING CHANGE` from the period.

### Monorepo + `workspace:*` interaction

In a pnpm workspace with `@org/core`, `@org/ui`, `@org/cli` where `@org/ui` and `@org/cli` depend on `@org/core`:

```json
// release-please-config.json
{
  "plugins": [
    { "type": "node-workspace", "updatePeerDependencies": true }
  ],
  "packages": {
    "packages/core": {
      "release-type": "node",
      "package-name": "@org/core",
      "include-component-in-tag": true
    },
    "packages/ui": {
      "release-type": "node",
      "package-name": "@org/ui",
      "include-component-in-tag": true
    },
    "packages/cli": {
      "release-type": "node",
      "package-name": "@org/cli",
      "include-component-in-tag": true
    }
  },
  "separate-pull-requests": false,
  "include-v-in-tag": true
}
```

- `include-component-in-tag: true` → tag names include the component name, like `@org/core-v2.0.0` (avoids monorepo collisions)
- `node-workspace` plugin → detects a bump on `@org/core`, rewrites `dependencies."@org/core"` in `@org/ui` / `@org/cli`, and adds both as patch bumps to the PR
- `updatePeerDependencies: true` → rewrites peer dependencies the same way (needed on the library side)
- `separate-pull-requests: false` → consolidates bumps for all packages into a single Release PR

**Include the package name in the commit scope**:

```
feat(@org/core): add streaming parser
fix(@org/ui): button focus ring on safari
feat(@org/cli)!: rename --config to --profile
```

The scope automatically determines the target of the change. An entry is written only into the CHANGELOG of the relevant package.

**How `workspace:*` substitution works**: Even if you write `"@org/core": "workspace:*"` in `@org/ui/package.json`, pnpm automatically substitutes it with `^<actual version>` at publish time. release-please leaves the source as `workspace:*` during bumps without touching it. This assumption lines up perfectly (on the pnpm side, `workspace:^` → `^same-major`, `workspace:~` → `~same-minor`).

## git-cliff setup (Rust / generic)

```bash
cargo install git-cliff
# or
brew install git-cliff
```

```toml
# cliff.toml
[changelog]
header = "# Changelog\n"
body = """
{% if version %}## [{{ version }}] - {{ timestamp | date(format="%Y-%m-%d") }}{% endif %}
{% for group, commits in commits | group_by(attribute="group") %}
### {{ group | upper_first }}
{% for commit in commits %}
- {{ commit.message | upper_first }} ({{ commit.id | truncate(length=7, end="") }})
{% endfor %}
{% endfor %}
"""

[git]
conventional_commits = true
filter_unconventional = true       # Exclude existing non-conforming commits from the CHANGELOG
protect_breaking_commits = true
commit_parsers = [
  { message = "^feat",     group = "Added" },
  { message = "^fix",      group = "Fixed" },
  { message = "^perf",     group = "Changed" },
  { message = "^refactor", group = "Changed" },
  { message = "^deprecat", group = "Deprecated" },
  { message = "^remove",   group = "Removed" },
  { message = "^security", group = "Security" },
  { message = "^revert",   group = "Reverted" },
  { message = "^(docs|style|test|build|ci|chore)", skip = true },
  { message = ".*",        skip = true },   # Bulk-exclude non-conforming commits (do not rewrite history)
]
tag_pattern = "v[0-9]*"
sort_commits = "newest"
```

For Rust projects used alongside `cargo-release`, `cargo-release` handles the version bump in `Cargo.toml` and tagging, while git-cliff focuses solely on CHANGELOG generation (loosely coupled). This is also why you would not layer a PR-based automatic bump like release-please on top.

```bash
git-cliff --output CHANGELOG.md            # Regenerate from full history
git-cliff --unreleased --prepend CHANGELOG.md  # Prepend only the unreleased section
git-cliff --tag v1.2.0 --output CHANGELOG.md   # Generate for a specific tag
```

### Wiring with cargo-release (concrete example)

Put hooks into `[package.metadata.release]` in `Cargo.toml`. Running `cargo release <level>` runs bump → CHANGELOG generation → commit → tag → push in sequence:

```toml
# Cargo.toml
[package.metadata.release]
# After the version bump and before the commit, update CHANGELOG with git-cliff
pre-release-hook = ["git", "cliff", "--tag", "v{{version}}", "--unreleased", "--prepend", "CHANGELOG.md"]
# The tag itself is created by cargo-release
tag-name = "v{{version}}"
# Include CHANGELOG.md in the release commit
pre-release-commit-message = "chore(release): v{{version}}"
```

Order:

1. `cargo release minor --execute` → version bump in `Cargo.toml`
2. `pre-release-hook` runs `git cliff` to finalize the next version's `[Unreleased]` as `[v0.2.0] - 2026-04-19` and update `CHANGELOG.md`
3. cargo-release bundles `Cargo.toml` + `CHANGELOG.md` into the release commit
4. `tag-name` creates `v0.2.0` as an annotated tag
5. `cargo publish` + `git push --tags`

**Note**: The `[changelog.bump]` section on the git-cliff side (`features_always_bump_minor` etc.) is a git-cliff-specific feature where git-cliff itself decides the bump; do not use it when combined with cargo-release (the bump decision belongs to cargo-release). `<level>` (patch / minor / major) is chosen by a human.

## conventional-changelog-cli (lightweight, language-agnostic)

```bash
npm install -g conventional-changelog-cli
conventional-changelog -p angular -i CHANGELOG.md -s -r 0
# -p: preset (angular / atom / ember / eslint / jquery / jshint)
# -i: input, -s: same file, -r 0: full history
```

The main preset is `angular` (the origin of Conventional Commits). Well-suited to appending to an existing CHANGELOG.

## Validating commit messages with pre-commit

Reject commits that violate the Conventional Commits spec at commit time:

### commitlint

```bash
npm install -D @commitlint/cli @commitlint/config-conventional
```

```js
// commitlint.config.js
module.exports = { extends: ['@commitlint/config-conventional'] };
```

```yaml
# .pre-commit-config.yaml (prek / pre-commit)
- repo: https://github.com/alessandrojcm/commitlint-pre-commit-hook
  rev: v9.16.0
  hooks:
    - id: commitlint
      stages: [commit-msg]
      additional_dependencies: ['@commitlint/config-conventional']
```

**Pitfall**: Without `additional_dependencies`, the hook cannot resolve `config-conventional` at run time and fails with `Cannot find module`. Just `extends` in `commitlint.config.js` is not enough; you must also declare it explicitly in the hook's isolated environment.

**prek vs pre-commit**: `prek` is a Rust-based pre-commit-compatible implementation (https://github.com/j178/prek). Configuration files (`.pre-commit-config.yaml`) and hook specifications are shared, and execution is 5-10x faster. Commands: `prek install` / `prek run`. The mizchi environment uses prek (see the `chezmoi-management` skill).

### commitizen (interactive commit creation)

```bash
npm install -D commitizen cz-conventional-changelog
# package.json
"config": { "commitizen": { "path": "./node_modules/cz-conventional-changelog" } }
# usage
git cz
```

## Common failures

- **Introducing the commit convention partway through**: existing history stays in the broken format. release-please ignores "non-conforming commits" during its scan. No retroactive rewrite is needed; just align from now on
- **Using `chore:` for everything so no release PR opens**: writing `chore:` for a bug fix omits it from the CHANGELOG / does not bump the version. **Pick the type by "kind of change", not by importance** (fix is a user-visible fix, chore is internal housekeeping)
- **Writing BREAKING CHANGE in the subject and omitting the footer**: release-please looks at the `BREAKING CHANGE:` in the footer or the `!` on the type. Writing "breaking: ..." in the subject will not trigger a major bump
- **Mixing manual CHANGELOG edits with the tool**: manually editing a CHANGELOG managed by release-please causes drift on the next generation. Add entries only via PRs (use release-please's "Edit" feature)
- **Creating a tag first and then opening a release-please PR**: release-please creates the tag on PR merge. A manual tag conflicts with it. For manual operation, standardize on conventional-changelog-cli / git-cliff + manual tagging

## Red flags

| Thought that comes up | Reality |
|---|---|
| "Writing the CHANGELOG by hand is more polished" | Generating from commits misses nothing. Handwriting inevitably produces omissions and inconsistent wording |
| "Create the tag first, then write the changelog" | The order is backwards. Stick to commit → tool generates CHANGELOG → tag |
| "Breaking changes are clear if written in the subject" | Tools mechanically read the footer / `!`. Natural-language phrasing in the subject is ignored |
| "Let's add project-specific types" | You can express things within `feat` / `fix` / `chore`. Custom types are not supported by the tools' presets |
| "Let's fix non-conforming commits via rebase" | Retroactive rewrites pollute history. Just align from now on; the tool will ignore the rest |

## Related

- `npm-release` — automates all the way to publish with release-please + OIDC Trusted Publishing (session-specific local management)
- `apm-usage` references/publishing.md — CHANGELOG conventions when publishing a skill
- `gh-fix-ci` — when the release workflow fails in CI
- Keep a Changelog: https://keepachangelog.com/
- Conventional Commits: https://www.conventionalcommits.org/
- release-please: https://github.com/googleapis/release-please
- git-cliff: https://git-cliff.org/
