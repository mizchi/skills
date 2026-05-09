---
name: skill-selector
description: Use when initializing a project, or mid-stream when a missing capability is detected, to decide which skills to add via APM. Two-phase: pick from a curated catalog first; only escalate to broader search/evaluation when the catalog has no fit. Avoids the failure mode of impulse-installing skills you never use or hand-searching GitHub when a vetted answer already exists.
---

# Skill Selector

Adding a skill is cheap on disk and not free in context. Pick deliberately.

This skill separates two concerns:

1. **Selection from a curated catalog** — fast, opinionated, mostly enough.
2. **Search-and-evaluate** — broader, slower, only when phase 1 doesn't fit.

Run them as distinct passes. The catalog has been pre-vetted. Outside-catalog skills haven't, and need explicit evaluation before adoption.

## When to use

- Starting a new project / new repo and you want it stocked with the right skills
- Mid-development, when a recurring task type is uncovered (suddenly need Playwright, suddenly need release automation)
- A slash command or another skill hints at a downstream skill not yet installed

When NOT to use:

- One-off task that won't recur — solve it inline; don't install a skill you'll never trigger again
- The project already lists the relevant skill in `apm.yml` — re-check before searching

## Phase 1 — Curated catalog

The catalog lives in [references/catalog.md](references/catalog.md). It is grouped by project signal (language / tool / process), with `apm install` strings inline.

Workflow:

1. Read `references/catalog.md`.
2. Identify project signals — e.g., `package.json` (Node), `moon.mod.json` (MoonBit), `gleam.toml` (Gleam), `flake.nix` (Nix), `.github/workflows/` (CI), Playwright config, `dotenvx` keystore. Use those to short-list catalog rows.
3. Confirm with the user before installing — propose, let them subtract. Default to fewer skills, not more. Each skill consumes context every conversation.
4. Install via APM (see `apm-usage`):
   - Project scope: edit `apm.yml`, run `apm install`. Commit `apm.lock.yaml`.
   - Global scope: `apm install -g <repo>/<path>`, verify in `~/.apm/apm.yml`.
5. If a need is unmet, escalate to Phase 2. Do not skip Phase 1 — even if a search query is already forming in your head, scanning the catalog is cheaper.

## Phase 2 — Search and evaluate

Use only when Phase 1 has no candidate.

Workflow:

1. **Search**:
   - GitHub: `topic:claude-skill`, `path:**/SKILL.md`, `org:apm-sh`, the user's own orgs
   - APM registry / index pages
   - Cross-references inside skills already installed — they often point at compatible peers
2. **Evaluate** each candidate against the rubric:
   - **Fit**: does the description's "Use when..." actually match the project? Re-read the description, not the title.
   - **Maintenance**: last update recent? Visible activity in the upstream repo?
   - **License**: SPDX identifier present? Compatible with consuming project?
   - **Frontmatter health**: `name` matches directory name; description under 1024 chars and triggering-condition-shaped (not workflow-summary — see `superpowers:writing-skills` CSO section).
   - **Body quality**: explicit "When NOT to use"? Concrete examples vs vague advice?
   - **Footprint**: heavy always-loaded vs demand-loaded? Prefer demand-loaded.
   - **Cross-reference cost**: skills marked as REQUIRED dependencies pull additional load.
3. **Reject by default**. A skill that fails fit / license / maintenance is not borderline — it's a no.
4. **Test before pinning**: install the candidate temporarily, run a representative scenario through a fresh subagent, judge by the executor's self-report (see `empirical-prompt-tuning`).
5. **Decide**:
   - Adopt → pin to a tag or SHA in `apm.yml`. Avoid floating refs for production projects.
   - Reject → record the reason in a project note (e.g., `docs/skills-rejected.md` or a CLAUDE.md line). Don't re-evaluate the same skill three months later.

## Phase boundary — do not blur

The two phases solve different problems:

- Phase 1 trades breadth for confidence. The catalog is curated; trust it.
- Phase 2 trades confidence for breadth. Compensate with explicit evaluation.

Common failure: starting in Phase 2 ("let me grep GitHub for a Playwright skill") when Phase 1 already has `playwright-test`. Always read the catalog first.

Reverse failure: forcing a Phase 1 fit when the catalog truly has nothing suitable. If no row matches within ~30 seconds of scanning, escalate — don't pad the install list with adjacent-but-not-quite skills.

## Maintenance of the catalog

- Catalog is part of this skill. Keep it in sync when `mizchi/skills` (and upstream skill repos referenced) gain or lose skills.
- A skill discovered through Phase 2 may be promoted into the catalog after it has been used in 2+ projects without issue.
- If the catalog feels stale, cross-check against [`mizchi/skills` README](https://github.com/mizchi/skills) before falling back to Phase 2.

## Common mistakes

| Mistake | Fix |
|---|---|
| Installing skills "just in case" | Don't. Each one costs context per conversation. Install only when there's a near-term task that needs it. |
| Skipping the catalog and going straight to GitHub search | Re-read the catalog first. It exists to avoid this. |
| Adopting a Phase 2 skill without testing | Run an empirical scenario via a subagent first. Descriptions can lie. |
| Floating refs in `apm.yml` for project scope | Pin to a tag or SHA. Drift mid-feature is its own debugging hell. |
| Re-evaluating the same rejected skill quarterly | Record the rejection reason in-repo. Don't re-search ground already covered. |
| Treating Phase 1 catalog as exhaustive | If nothing matches in ~30 seconds, escalate to Phase 2. Don't shoehorn. |

## Related

- `apm-usage` — actual `apm install` syntax and manifest format
- `empirical-prompt-tuning` — how to test a candidate skill before adopting it
- `superpowers:writing-skills` — when no existing skill fits, write one instead of adopting a poor match
- `chezmoi-management` — for skills that must stay private (the APM-vs-chezmoi boundary)
