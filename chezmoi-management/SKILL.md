---
name: chezmoi-management
description: mizchi's chezmoi dotfiles operations: source location, diff/apply flow, skill addition, the APM vs chezmoi boundary, pre-commit (prek + secretlint). Consult when touching ~/.claude/, ~/.config/, or ~/.zshrc, or initializing a new machine.
---

# chezmoi Management (mizchi personal)

Personal dotfiles operations notes. The official chezmoi docs are already sufficient, so this document focuses solely on **how things concretely work in my own environment**.

## Baseline environment

| Item | Value |
|---|---|
| Source directory | `~/.local/share/chezmoi/` |
| Remote | `https://github.com/mizchi/chezmoi-dotfiles.git` |
| Branch | `main` |
| pre-commit | [prek](https://github.com/j178/prek) + [secretlint](https://github.com/secretlint/secretlint) |
| Post-apply hook | `run_after_apm-install.sh` → `apm install --global --target claude` |

## Layout cheat sheet

```
~/.local/share/chezmoi/
├── dot_apm/          → ~/.apm/      (APM config)
├── dot_claude/       → ~/.claude/   (Claude Code)
│   ├── CLAUDE.md.tmpl
│   ├── settings.json.tmpl
│   ├── rules/
│   └── skills/       → ~/.claude/skills/   (self-authored skills)
├── dot_codex/        → ~/.codex/
├── dot_config/       → ~/.config/   (helix, mise, sheldon, starship, zellij, zsh)
├── dot_zshrc         → ~/.zshrc
└── run_after_apm-install.sh  (scripts/run_after_* run every time after apply)
```

### Meaning of filename prefixes

| prefix | Meaning | Example |
|---|---|---|
| `dot_` | Leading `.` | `dot_zshrc` → `.zshrc` |
| `executable_` | `+x` permission | `executable_setup.sh` → `setup.sh` (755) |
| `private_` | `0600` permission | `private_key` → `key` (600) |
| `.tmpl` | Go template | `CLAUDE.md.tmpl` → `CLAUDE.md` expanded with hostname etc. |
| `run_once_` | Run only the first time | `run_once_install_brew.sh` |
| `run_after_` | Run every time after apply | `run_after_apm-install.sh` |

## Daily flow

### (1) Check what differs

```bash
chezmoi diff                   # diff between source and dest
chezmoi status                 # rough status (MM/M /?? etc.)
```

**Direction sense for `chezmoi diff`**: the output is in `- dest` / `+ target` order (following git diff's old=current / new=after-apply convention).
- `-` lines = content in dest (the current real file) — will be **removed** by apply
- `+` lines = content in target (the expected state after source.tmpl expansion) — will be **added** by apply
- `chezmoi apply` moves in the direction of aligning dest to target (source → dest)

When in doubt, the fastest way to confirm is to look at both `cat <source>` and `cat <dest>`.

The columns for `chezmoi status` are `[source][dest]`:
- `M` = modified, `A` = added, `D` = deleted, `?` = untracked (not in source)
- `MM` → changes on both sides (need to absorb the manually-edited dest into source)
- ` M` → source unchanged but dest was modified (stray change)
- `DA` → marked as deleted in source but exists in dest (junk like `node_modules/`)

### (2) Edited dest (the real file) → absorb into source

```bash
chezmoi add ~/.zshrc                    # add a new file
chezmoi re-add                          # bulk-reflect changes from managed dest into source
chezmoi re-add ~/.claude/CLAUDE.md      # individual
```

### (3) Edited source (repo side) → apply to dest

```bash
chezmoi diff                            # look first
chezmoi apply                           # all
chezmoi apply ~/.claude/CLAUDE.md       # individual
chezmoi apply --verbose                 # show what it's doing
```

### (4) Open source in an editor

```bash
chezmoi edit ~/.zshrc                   # open the source side (whether to apply after closing the editor is controlled by the -a flag)
chezmoi edit -a ~/.zshrc                # also run apply after editing
chezmoi cd                              # cd to source dir
```

## New machine initialization

```bash
# chezmoi itself: brew install chezmoi, etc.

chezmoi init https://github.com/mizchi/chezmoi-dotfiles.git --apply
# ↑ does clone + apply. run_after_apm-install.sh runs and
#   external skills are installed via apm install --global --target claude

# Enable pre-commit (once per new machine)
cd $(chezmoi source-path)
prek install
```

## Skill-addition flow (my personal routine)

1. Develop and verify in `~/.claude/skills/<name>/` (for nix-setup, get `nix build` passing)
2. `chezmoi add ~/.claude/skills/<name>` to reflect into source
   - Scripts with `+x` get the `executable_` prefix automatically
3. `cd ~/.local/share/chezmoi && git status` to confirm added files
4. `git add dot_claude/skills/<name>/` + commit + `git push origin main`

### If you edited an existing skill

Both `chezmoi add` and `chezmoi re-add` overwrite. In practice, `re-add` tends to produce fewer extraneous diffs:

```bash
chezmoi re-add ~/.claude/skills/nix-setup/SKILL.md
```

## APM vs chezmoi boundary

`~/.claude/skills/` is a **mix of two systems**:

| Kind | How it gets in | Managed at |
|---|---|---|
| APM-managed (external repo) | Fetched by `apm install --global` after apply | `~/.local/share/chezmoi/dot_apm/apm.yml` |
| chezmoi-managed (self-authored) | Copied into source by `chezmoi add` | `~/.local/share/chezmoi/dot_claude/skills/<name>/` |

**Currently installed via APM** (excerpt from `dot_apm/apm.yml`):

- `moonbitlang/moonbit-agent-guide/*` (moonbit-agent-guide, moonbit-refactoring, moonbit-c-binding)
- `mizchi/moonbit-practice/skills/moonbit-practice`
- `mizchi/flaker/skills/flaker-setup`
- `ast-grep/agent-skill/ast-grep`
- `mizchi/tui.mbt/skills/tuimbt-practice`

**Decision criteria**:
- Public / likely to be used from other repos → place in the upstream repo and register with APM
- Operational notes used only in my own environment / experimental skills → chezmoi-managed

If a directory of the same name exists in both locations, **APM may overwrite it at install time**, so watch out for name collisions.

**Check for APM name collisions before adding a new skill to chezmoi**:

```bash
# Check whether the same name exists on the APM side
grep "<skill-name>" ~/.local/share/chezmoi/dot_apm/apm.yml
# or
chezmoi cd && grep -r "<skill-name>" dot_apm/
```

## Editing tmpl files

`CLAUDE.md.tmpl` and `settings.json.tmpl` are Go templates:

```bash
chezmoi edit ~/.claude/CLAUDE.md     # opens the source-side .tmpl, not the real file
chezmoi execute-template < foo.tmpl  # manually check the expansion result
chezmoi data                         # list data available for expansion (hostname, OS, etc.)
```

Examples of template variables: `{{ .chezmoi.os }}`, `{{ .chezmoi.hostname }}`

**Caution**: Running `chezmoi re-add` against a `.tmpl`-managed file (`CLAUDE.md.tmpl`, `settings.json.tmpl`, etc.) will overwrite the `.tmpl` syntax in source with the expanded dest content. To update a `.tmpl` file, use `chezmoi edit` (which automatically opens the `.tmpl` side) or edit `~/.local/share/chezmoi/dot_claude/CLAUDE.md.tmpl` directly.

**Pre-check before re-add**: always check whether the target file is `.tmpl`-managed with `chezmoi source-path`:

```bash
chezmoi source-path ~/.claude/CLAUDE.md
# → /Users/mz/.local/share/chezmoi/dot_claude/CLAUDE.md.tmpl
# If it ends in .tmpl, don't re-add — edit manually. If not .tmpl, re-add is OK
```

### When you want to change the default value of a tmpl variable

Rather than rewriting the tmpl itself to a hard-coded value, put the variable in the `[data]` section of `~/.config/chezmoi/chezmoi.toml`:

```toml
[data]
  claude_default_mode = "auto"
  github_username = "mizchi"
```

It's more flexible to preserve tmpl structures like `{{ .claude_default_mode | default "acceptEdits" }}` as-is and switch only the values per-host via `[data]` (leaves room to vary settings across machines).

## pre-commit (prek + secretlint)

Before commit, `secretlint` runs via `prek`, and diffs containing API keys or tokens are rejected.

**Common false positives**:
- Example sha256 / hex strings (can trip when length resembles aws keys / github tokens)
- Sample values written in `.envrc` comments

Remediation:
```bash
# If it really is a false positive, exclude the rule in .secretlintrc.json
# If the detection is correct, fix the line and git add ... && git commit
```

Exclusion syntax in `.secretlintrc.json` (excerpt):

```json
{
  "rules": [
    {
      "id": "@secretlint/secretlint-rule-preset-recommend",
      "options": {
        "allows": [
          "/sha256-[a-f0-9]{64}/",
          "fake-token-for-example",
          "skill-examples/*"
        ]
      }
    }
  ]
}
```

`allows` takes either a regex (surrounded by `/.../`) or a literal string match. Per-file exclusion is possible via `disabledRules` + `includes`/`excludes`.

Don't use `--no-verify` (defeats the purpose).

## Troubleshooting

### `chezmoi status` shows a flood of `DA` (`node_modules/` etc.)

Append to `.chezmoiignore`:
```
node_modules
**/.DS_Store
```

### source and dest conflict

```bash
chezmoi merge ~/.zshrc          # 3-way merge (vimdiff-style)
chezmoi forget ~/.something     # remove from source (keep dest)
chezmoi destroy ~/.something    # remove both (destructive)
```

The `chezmoi merge` backend is configured in the `[merge]` section of `~/.config/chezmoi/chezmoi.toml`:

```toml
[merge]
  command = "nvim"
  args = ["-d", "{{ .Destination }}", "{{ .Source }}", "{{ .Target }}"]
```

If unset, chezmoi consults `git config merge.tool`. If both are unset, it falls back to vimdiff.

### Apply broke things → roll back to a previous revision

chezmoi itself has no undo. Roll back via git on the source side:
```bash
chezmoi cd
git log --oneline -5
git reset --hard <rev>
cd -
chezmoi apply
```

### Which files are managed

```bash
chezmoi managed                 # list of managed files
chezmoi unmanaged ~/            # unmanaged files
chezmoi managed ~/.claude       # filter by path
```

### apply is slow

`apm install` inside `run_after_apm-install.sh` runs every time. If no skill updates are needed, skip it via an env var at apply time:
```bash
SKIP_APM=1 chezmoi apply    # only if the script supports it (otherwise ignored)
```

If unsupported, ignore.

## Reference command cheat sheet

```bash
chezmoi diff                    # diff
chezmoi status                  # status
chezmoi apply [-v]              # apply
chezmoi add <path>              # take in a new file
chezmoi re-add [<path>]         # re-take an existing file
chezmoi edit [-a] <path>        # edit source (-a applies immediately after)
chezmoi merge <path>            # 3-way merge for conflicts
chezmoi forget <path>           # drop from source
chezmoi managed [<path>]        # list managed files
chezmoi unmanaged <path>        # unmanaged files
chezmoi cd                      # cd to source-path
chezmoi source-path             # show source directory
chezmoi execute-template <     # test template expansion
chezmoi data                    # list variables usable in templates
chezmoi doctor                  # setup diagnosis
```
