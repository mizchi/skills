# apm.yml manifest schema

## Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Package identifier |
| `version` | string | Yes | Semver (e.g. `1.0.0`) |
| `description` | string | No | Brief description |
| `author` | string | No | Author or organization |
| `license` | string | No | SPDX identifier |
| `target` | enum | No | `vscode` / `claude` / `codex` / `all` (auto-detected if omitted) |
| `type` | enum | No | `instructions` / `skill` / `hybrid` / `prompts` |
| `scripts` | map | No | Named commands via `apm run <name>` |
| `dependencies` | object | No | `apm` and `mcp` dependency lists |
| `devDependencies` | object | No | Dev-only deps (excluded from `apm pack`) |

## Dependency string forms

```
owner/repo                           # GitHub shorthand
owner/repo#v1.0.0                    # pinned tag
owner/repo#main                      # branch ref
owner/repo/path/to/skill             # subdirectory
gitlab.com/org/repo                  # non-GitHub host
./packages/my-skill                  # local path
```

## Dependency object form

```yaml
- git: https://gitlab.com/org/repo.git
  path: skills/my-skill              # subdirectory within repo
  ref: v2.0                          # branch, tag, or commit SHA
  alias: my-skill                    # local name override
```

## MCP dependency forms

```yaml
mcp:
  # Registry reference
  - io.github.github/github-mcp-server

  # With overlays
  - name: io.github.github/github-mcp-server
    transport: stdio
    tools: ["repos", "issues"]
    env:
      GITHUB_TOKEN: "${MY_TOKEN}"

  # Self-defined (private)
  - name: internal-server
    registry: false
    transport: http
    url: "${SERVER_URL}"
```

## Canonical normalization

APM normalizes all dependency references:

| Input | Stored as |
|-------|-----------|
| `https://github.com/owner/repo.git` | `owner/repo` |
| `git@github.com:owner/repo.git` | `owner/repo` |
| `github.com/owner/repo` | `owner/repo` |
| `https://gitlab.com/org/repo.git` | `gitlab.com/org/repo` |

Duplicate detection works across all input forms.
