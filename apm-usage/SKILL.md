---
name: apm-usage
description: Reference for APM manifests, installation, targeted updates, deployment paths and lockfiles. Invoke when the user explicitly asks about APM or apm.yml, or an unfamiliar APM command/error needs exact CLI details. Do not automatically invoke for every project that happens to have installed skills.
---

# APM — Agent Package Manager

APM distributes skills, instructions, prompts, plugins and MCP declarations.
Checked on 2026-11-18 with the APM 0.36.0 macOS arm64 binary. Preserve a project's
installed version and consumer lock until a deliberate upgrade; inspect that
version's help when it predates this guide. Python 3.11+ is required for pip or
source installs; native bundles include their runtime. [Official CLI reference](https://microsoft.github.io/apm/reference/).

## Install, replay and update are different

```sh
apm --version
apm install --help
apm install owner/repo/path --target claude
apm install --frozen

# Preview and update the requested dependency only
apm update owner/repo/path --dry-run
apm update owner/repo/path --yes

# User scope, only when requested
apm install -g owner/repo/path --target claude
apm update -g owner/repo/path --dry-run
apm update -g owner/repo/path --yes

apm uninstall owner/repo/path
apm deps list
apm deps tree
apm audit
```

`apm install` installs/replays the dependency graph; `--frozen` requires an existing
matching lockfile. `apm update` refreshes selected dependencies. The old
`apm install --update` spelling is a deprecated compatibility path, not the normal
update command. An update without a package selects a wider scope, so use it only
when that wider update is intended. `apm self-update` updates the tool itself,
not the installed skills. See [update behavior](https://microsoft.github.io/apm/reference/cli/update/).

`apm install --frozen` replays the matching lockfile. In APM 0.36.0,
`apm update` can advance a full-SHA revision pin to the commit behind the highest
eligible stable annotated semver tag. Review the proposed old/new SHA and tag
with `--dry-run`; accepting the plan rewrites the manifest and lock. Declining
leaves the manifest, lock and deployed files unchanged. Branches and lightweight
tags are not replacement targets for these pins. With no eligible annotated
release, APM warns and retains that SHA while continuing other updates.

An exact Git tag declaration continues to select that tag. Change the declared
tag intentionally to select another release; do not move an existing tag to
publish a replacement. Exact registry-version constraints also remain in force.
`--force` can overwrite local content and bypass critical install findings;
it is not the ordinary refresh flag. See the [0.36.0 validation](references/update-validation.md)
for the tested revision-pin and frozen-replay scope.

## Explicit manifest and scope

```yaml
name: my-project
version: 1.0.0
targets:
  - claude
  - codex
dependencies:
  apm:
    - owner/repo/skills/my-skill#v1.0.0
    - ./packages/local-skill
scripts:
  verify: "echo verify installed resources"
```

Explicit `targets` avoid depending on which marker directories happen to exist.
Inspect `apm targets --json`; target support expands across releases. Local-path
dependencies are for project development, not global installs. Commit the consumer
manifest and `apm.lock.yaml` together for reproducibility.

| Scope | Manifest / lock | Module cache |
| --- | --- | --- |
| Project | `./apm.yml`, `./apm.lock.yaml` | `./apm_modules/` |
| User | `~/.apm/apm.yml`, `~/.apm/apm.lock.yaml` | `~/.apm/apm_modules/` |

Installed paths depend on target and namespace rules. With APM 0.35.1, the
verified Claude+Codex consumer deployed to `.claude/skills/source/` and `.agents/skills/source/`;
APM used the source directory name, not an assumed frontmatter name. Read the
reported path and inspect its files instead of constructing a path from the
package name. Other targets can share `.agents/skills`; use the current target
matrix/help rather than copying an older `.cursor/skills` table. Compatibility
flags such as `--legacy-skill-paths` must be an explicit choice.

## Named scripts versus lifecycle hooks

`scripts` is a named command map used by `apm run <name>` where that experimental
feature is enabled. A command named `postinstall` in that map is not by itself an
automatic install hook. The local install test confirmed it did not run.
Current lifecycle automation uses a separate `lifecycle` feature and trust rules;
inspect `apm lifecycle --help` and the official lifecycle documentation before
adopting it. Do not silently run dependency-provided scripts during installation.

## Verify a consumer

Use a temporary project with explicit targets and a local source dependency:

1. Run `apm install --dry-run`, then the real `apm install`.
2. Check the manifest/lock, reported deployment paths and every required resource.
3. Run `apm install --frozen` and `apm update <package> --dry-run`.
4. Verify discovery after the relevant agent reload/new session.

The 0.35.1 local check verified install, frozen replay, target output and update
planning. The 0.36.0 check additionally exercised SHA-pin dry-run/apply, retained
unreleased pins, malformed/non-commit tag rejection and lock consistency with
local Git repositories. A real terminal decline kept the manifest, lock and
deployed files unchanged. These checks used an isolated binary and consumers;
they do not establish hosted-source behavior or agent quality. See the distribution skill's
[consumer validation guide](../publish-agent-skill/references/apm.md) for those
additional steps; the installed skill remains self-contained through the steps
above when that optional companion is absent.

## Coexist with chezmoi

Keep APM's module cache and its installed skill copies outside chezmoi ownership.
Manage only the intended manifest/lock or self-authored source through chezmoi.
Confirm actual deployment paths before changing ignore rules; a skill name can
collide with a local source. Preserve the user's current ownership boundary.
Do not overwrite locally authored content just to make an install succeed.

For private sources, use the user's configured provider/gh credentials or CI
credential mechanism; consult `apm auth --help` and the selected host's auth guide
rather than assuming one credential priority across releases. Never put tokens
inside a manifest, lockfile or example command.

## Author portable skills

A skill directory contains SKILL.md and any referenced scripts, references or
assets. Follow [the skill specification](https://agentskills.io/specification):
matching lowercase directory/name, a descriptive trigger, and self-contained
resources. An APM install or audit proves delivery/integrity, not that the skill's
instructions work. Run a representative task and the bundled checks before
publishing. More authoring detail: [publishing.md](references/publishing.md).
