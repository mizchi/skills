# Skills repository — maintainer notes

This repo is the upstream source for mizchi's agent skills. Each top-level directory is a skill distributed via [APM](https://github.com/apm-sh/apm).

## When editing a skill in this repo

Skills here are installed to `~/.claude/skills/<name>/` via `apm install -g mizchi/skills/<name>`. When you edit a file here, the local copy that Claude Code actually reads does NOT update automatically.

**Propagation rule**: every time a file under `<skill-name>/` is edited, mirror the same change to `~/.claude/skills/<skill-name>/` so the running Claude Code session picks it up immediately.

Use the same relative path — e.g. editing `./justfile/SKILL.md` means also writing `~/.claude/skills/justfile/SKILL.md`. Deletions and renames propagate the same way.

After a batch of edits, commit + push here, then the next `apm install -g --update` on any machine pulls the same change. The mirror-write just keeps the current session live without waiting for an install cycle.

## What is NOT in this repo

- `npm-release/` — kept local-only per `~/.local/share/chezmoi/.chezmoiignore` (contains release-pipeline specifics that should not be public). If you add release-automation notes, put them in that chezmoi-tracked skill, not here.
- Skills owned by other repos (`moonbit-*`, `flaker-setup`, `ast-grep`, `tuimbt-practice`) — edit them at their upstream.

## Before committing

- Skill directory name must match the `name:` in its `SKILL.md` frontmatter.
- Do not commit MoonBit build artifacts (`_build/`, `.mooncakes/`) or `node_modules/` — `.gitignore` covers them.
- If a skill gains security-sensitive detail, move it to chezmoi-local and remove from this repo (see how `npm-release` is handled).
