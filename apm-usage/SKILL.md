---
name: apm-usage
description: Reference for APM (Agent Package Manager) — apm.yml syntax, install / uninstall / update commands, target detection, lockfile workflow. Read when you need exact field names, but do NOT auto-invoke on every apm-related task; user prompts about projects with installed skills can be handled with general APM knowledge. Invoke explicitly when the user mentions APM by name, asks to author or audit an apm.yml, or runs into an unfamiliar APM command / error.
---

# APM (Agent Package Manager)

APM is a dependency manager for AI agent skills, instructions, prompts, and MCP servers. Think of it as npm for agent configuration.

## When this skill applies

- "add a skill to this project"
- "install skills globally"
- "create a skill for this repo"
- "set up apm.yml"
- "update agent dependencies"

## Core commands

```bash
# Install all dependencies from apm.yml
apm install

# Install a specific package
apm install owner/repo
apm install owner/repo/skills/skill-name    # subdirectory skill
apm install owner/repo#v1.0.0               # pinned version

# Global (user-scope) install → ~/.claude/skills/
apm install -g owner/repo/skills/skill-name

# Update all to latest
apm install --update        # project scope
apm install -g --update     # global scope

# Remove
apm uninstall owner/repo
apm uninstall -g owner/repo

# Inspect
apm deps list               # project deps
apm deps list -g             # global deps
apm deps tree                # dependency tree
apm deps tree -g

# Security scan
apm audit

# Dry run (preview without changes)
apm install --dry-run
```

## apm.yml manifest

```yaml
name: my-project
version: 1.0.0
# Deployment targets. APM 0.12+ requires this when no marker directory
# (.claude/ / .github/ / etc.) exists at the repo root. Declare it
# unconditionally to make the install reproducible.
targets:
  - claude
dependencies:
  apm:
    # GitHub shorthand
    - owner/repo
    - owner/repo#v1.0.0                  # pinned tag
    - owner/repo/skills/skill-name       # subdirectory

    # Non-GitHub hosts
    - gitlab.com/org/repo
    - git: git@gitlab.com:org/repo.git
      path: skills/my-skill
      ref: main

    # Local path (dev only, not for -g)
    - ./packages/my-skill

  mcp:
    - io.github.github/github-mcp-server
scripts: {}
```

### `scripts:` examples

`scripts:` is a name → command map. Register post-`apm install` setup or one-shot tasks used during development:

```yaml
scripts:
  postinstall: "echo 'skills installed; restart Claude Code to pick them up'"
  verify: "ls -1 .claude/skills | sort"
  audit: "apm audit"
```

Invoke with `apm run <name>` (e.g. `apm run verify`). `postinstall` runs automatically when `apm install` succeeds (hook). One-shot tasks (e.g. `apm run audit`) must be called explicitly.

### Lockfile (`apm.lock.yaml`) workflow

`apm install` generates `apm.lock.yaml`. To guarantee reproducibility:

- **project scope**: **commit** `apm.lock.yaml` so teammates resolve the same skill versions. Same idea as `package-lock` in `node_modules`.
- **global scope**: sync `~/.apm/apm.lock.yaml` via chezmoi so a new machine installs the same versions.
- In CI / on a new machine, use `apm install --frozen-lockfile` to prevent drift (fails if the lockfile does not match the manifest).
- Only run `apm install --update` when you intentionally want to update the lockfile.

### Coexisting with chezmoi

If you manage dotfiles with chezmoi, the boundary with APM is:

| path | chezmoi | APM |
|---|---|---|
| `~/.apm/apm.yml` | managed (copied into source) | reads |
| `~/.apm/apm.lock.yaml` | managed (for new-machine reproducibility) | generates |
| `~/.apm/apm_modules/` | ignore (large cache) | manages |
| `~/.claude/skills/<name>/` | ignore (APM-managed is outside chezmoi) | deploy target |

Add the following to chezmoi's `.chezmoiignore`:

```
.apm/apm_modules
.claude/skills/<apm-managed-name>
```

Watch for name collisions with your own skills (those copied into the chezmoi source with `chezmoi add`). On collision APM overwrites at install time. See the `chezmoi-management` skill for details.

## Creating skills in a repository

Follow the [agentskills.io](https://agentskills.io/specification) open standard. Publishing-focused guide (repo layout, tag/release, dependency declaration, verification checklist) is in [references/publishing.md](references/publishing.md).

### Directory structure

```
my-repo/
└── skills/
    └── my-skill/
        ├── SKILL.md           # Required
        ├── scripts/           # Optional: executable code
        ├── references/        # Optional: detailed docs
        └── assets/            # Optional: templates, resources
```

### SKILL.md format

```markdown
---
name: my-skill
description: One-line description of what this skill does and when to use it.
---

# Skill body

Instructions for the AI agent. Keep under 500 lines.
Move detailed reference material to references/ directory.
```

### Frontmatter fields

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | 1-64 chars, lowercase alphanumeric + hyphens, must match directory name |
| `description` | Yes | 1-1024 chars, describe what + when |
| `license` | No | SPDX identifier or license file reference |
| `compatibility` | No | Environment requirements (max 500 chars) |
| `metadata` | No | Arbitrary key-value pairs |

### Name validation rules

- Lowercase letters, numbers, hyphens only
- Cannot start or end with hyphen
- No consecutive hyphens (`--`)
- Must match the parent directory name

### Users install with

```bash
apm install owner/my-repo/skills/my-skill
```

## Skill patterns for library authors

### Single skill in a library repo

```
my-library/
├── skills/
│   └── my-library-guide/
│       └── SKILL.md
├── src/
└── package.json
```

### Multiple skills (monorepo)

```
my-org-skills/
├── skill-a/
│   └── SKILL.md
├── skill-b/
│   └── SKILL.md
└── skill-c/
    └── SKILL.md
```

Users install individually: `apm install owner/my-org-skills/skill-a`

## Target detection

APM tries to auto-detect deployment targets from project structure:

| Directory exists | Target | Skills deployed to |
|-----------------|--------|-------------------|
| `.claude/` | claude | `.claude/skills/` |
| `.github/` | copilot | `.github/skills/` |
| `.cursor/` | cursor | `.cursor/skills/` (if supported) |
| `.codex/` | codex | `.agents/skills/` |

**APM 0.12+ no longer falls back to `copilot` when no marker directory exists** — the previous default was removed and `apm install` now errors out asking for an explicit target. **Always declare `targets:` in `apm.yml`** so the install never depends on the working tree's directory layout:

```yaml
name: my-project
version: 1.0.0
targets:
  - claude
dependencies:
  apm:
    - owner/repo
```

Or override per command with `--target claude`.

## Global vs project scope

| | Project (`apm install`) | Global (`apm install -g`) |
|---|---|---|
| Manifest | `./apm.yml` | `~/.apm/apm.yml` |
| Modules | `./apm_modules/` | `~/.apm/apm_modules/` |
| Lockfile | `./apm.lock.yaml` | `~/.apm/apm.lock.yaml` |
| Deploy to | `./.claude/skills/` | `~/.claude/skills/` |
| Local `.apm/` content | Deployed | Skipped |

## Authentication

For private repos, APM resolves auth automatically:

1. `gh auth login` (GH_TOKEN) — zero-config if already logged in
2. `git credential fill` — OS keychain, SSH keys
3. `GITHUB_APM_PAT` environment variable — for CI or explicit setup

No extra configuration needed if `gh auth login` is done.

## Priority and conflict resolution

- Local skills always override dependency skills on name collision
- Dependencies processed in declaration order; first wins
- `apm install --force` overwrites local files on collision
