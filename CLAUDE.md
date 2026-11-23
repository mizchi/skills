# Skills repository — maintainer notes

This repo is the upstream source for mizchi's agent skills. Each top-level directory is a skill distributed via [APM](https://github.com/microsoft/apm).

## When editing a skill in this repo

Skills here are installed to `~/.claude/skills/<name>/` via `apm install -g mizchi/skills/<name>`. When you edit a file here, the local copy that Claude Code actually reads does NOT update automatically.

**Propagation rule**: every time a file under `<skill-name>/` is edited, mirror the same change to `~/.claude/skills/<skill-name>/` so the running Claude Code session picks it up immediately.

Use the same relative path — e.g. editing `./justfile/SKILL.md` means also writing `~/.claude/skills/justfile/SKILL.md`. Deletions and renames propagate the same way.

After a batch of edits, commit + push here, then the next `apm update -g <requested-package> --yes` on any machine pulls the same change. The mirror-write just keeps the current session live without waiting for an install cycle.

## What is NOT in this repo

- Skills owned by other repos (`moonbit-*`, `flaker-setup`, `ast-grep`, `tuimbt-practice`) — edit them at their upstream.

## Before committing

- Run `pkf hooks install` once per checkout. The `pre-commit` hook runs `pkf run pre-commit`, which validates YAML frontmatter in tracked `SKILL.md` files.
- Use `pkf run test` to run the frontmatter validator tests plus the repository frontmatter check.
- For skill consistency checks, use `just --justfile skill-lint.justfile plan` before a live `check`; inspect candidates against the source. `just --justfile skill-lint.justfile replay` validates the calibrated rules offline. See `.jev-lint/README.md` for translation checks and scope.
- Every new or revised jev-lint rule must include explicit false-positive-risk (clean), false-negative-risk (bad), and unrelated-control fixtures in `case-coverage.json`. Run `pnpm lint:rule-cases`; three easy positives/negatives or an implicit clean default do not satisfy this requirement. Use paired unrelated changes where possible and keep labels outside fixture text.
- Run `pnpm links:install` once, then `just --justfile markdown-links.justfile check` after Markdown edits. Use `online` for HTTP(S) status checks; see `docs/markdown-links.md` for scope and reports.
- For a commit-to-commit skill review, use `pnpm review:skills --base <sha> --head <sha> --dry-run` before the live run. See `docs/skill-review-ci.md` for the PR execution boundary.
- For upstream freshness, use `just --justfile skill-freshness.justfile plan` and `check`; review current evidence and relevant smoke tests before explicit `accept`. Do not accept baselines automatically in CI. See `docs/skill-freshness.md`.
- Skill directory name must match the `name:` in its `SKILL.md` frontmatter.
- Do not commit MoonBit build artifacts (`_build/`, `.mooncakes/`) or `node_modules/` — `.gitignore` covers them.
- If a skill gains security-sensitive detail, move it to a gitignored or chezmoi-local file and remove it from this repo.

## Language policy

`SKILL.md` must be written in English (public repo rule). When a skill originated in Japanese, the original is preserved next to it as `SKILL-ja.md`. When editing a skill that has both:

- Edit `SKILL.md` (English) as the source of truth.
- Update `SKILL-ja.md` only when a non-trivial content change needs to be kept in sync for Japanese readers. Small wording fixes to the English file don't require touching the Japanese copy.
- Exception: `mizchi-blog-style` stays Japanese-only because the skill itself teaches Japanese writing style — translating would defeat its purpose.

## Tool adoption policy

- Use Node.js 24 or newer for maintained scripts, runtime requirements and new examples. Select a supported patch release that satisfies the installed packages' `engines`; a bare major-version minimum does not replace those constraints.
- GitHub JavaScript actions must use a supported action release whose own `runs.using` is `node24` or newer. Setting `actions/setup-node` to 24 changes project commands, not other actions' embedded runtimes. Verify action metadata before updating tags or SHA pins.
- Do not introduce devbox or dotenvx as a default for new projects, CI, environment variables, or secrets. Retain the project's existing tools.
- Use devbox when the project already uses it or the user explicitly selects it. Choosing another environment setup requires no justification for rejecting devbox.
- Use dotenvx when the project already uses it or the user explicitly selects it. Ordinary `.env` files, multiple environments, and a need for secrets do not by themselves authorize adopting dotenvx.
- Skill descriptions, examples, catalogs, templates, and evaluation scenarios must follow these choices. Neither tool is prohibited in projects that have adopted it.
