---
name: skill-selector
description: 'Meta-skill for picking project skills via APM. Invoke ONLY when the user explicitly asks to set up apm.yml, choose which skills a project needs, or evaluate a catalog match — do NOT auto-invoke on routine project-init or apm-management tasks. Two-phase: pick from a curated catalog first; only escalate to broader search/evaluation when the catalog has no fit. Avoids the failure mode of impulse-installing skills you never use or hand-searching GitHub when a vetted answer already exists.'
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
2. Identify project signals from three sources:
   - **Repo files**: `package.json` (Node), `moon.mod.json` (MoonBit), `gleam.toml` (Gleam), `flake.nix` (Nix), `.github/workflows/` (CI), Playwright config, `dotenvx` keystore.
   - **Stated user intent**: in-message cues like "we plan to deploy to X", "we publish a small npm utility eventually".
   - **CLAUDE.md mandates**: persistent rules in user-level `~/.claude/CLAUDE.md` or project-level `CLAUDE.md` (e.g., "task runner: justfile", "lint: ast-grep") count as signals even when the scenario text is silent. When mandate and stated intent disagree, surface the conflict to the user before installing. In the proposal, label mandate-driven rows explicitly (e.g., `# from ~/.claude/CLAUDE.md: task runner = justfile`) so a reviewer doesn't mistake them for padding.
3. Confirm with the user before installing — propose, let them subtract. Default to fewer skills, not more. Each skill consumes context every conversation.
   - **Non-interactive contexts** (subagent dispatch, scripted automation, batch runs): emit the proposal as the deliverable and stop. The caller subtracts. Do not stall waiting for a confirmation that will not come.
   - **Active-in-language heuristic**: if the user is actively writing code in a language with a `<lang>-practice` skill in the catalog (e.g. `moonbit-practice`, `gleam-practice`), include it. If they only consume a single binding or dep written in that language, hold off.
   - **Platform-name caveat**: when a catalog row's description names a specific CI provider / runtime / cloud:
     - **Project platform matches**: adopt as-is. Do not re-read the underlying SKILL.md; the catalog row already answered the question.
     - **Project platform differs**: read the underlying SKILL.md before deciding. The core capability may still apply — install for that core, note "integration glue N/A." Skipping for platform mismatch alone is wrong.
     - **If you cannot read the underlying SKILL.md** (no local install, no upstream clone, no network): do NOT silently skip the check. **Surface the uncertainty in the proposal explicitly** — e.g., note "adopting `<skill>` based on its catalog description; the SKILL.md was not consulted, so the core-vs-integration split is unverified." The user can then decide whether to verify before committing the install. Silently dropping the verification leaves a bug (the wrong skill adopted, or a usable skill rejected) that no later step recovers.
   - **Out-of-band rows**: rows tagged `(out-of-band)` in the catalog cannot be installed via public APM (chezmoi-local, gated, etc.). Mention them in prose if the project would benefit, but do NOT put them in `apm.yml`.
4. Install via APM. **Read `apm-usage` first** to confirm the exact `apm.yml` syntax — the manifest format is non-trivial and field names should not be inferred from this skill alone.
   - Project scope: edit `apm.yml`, run `apm install`. Commit `apm.lock.yaml`.
   - Global scope: `apm install -g <repo>/<path>`, verify in `~/.apm/apm.yml`.
   - **`targets:` declaration is required.** APM 0.12+ does not fall back to a default target when no marker directory (`.claude/` / `.github/` / etc.) exists at the repo root — `apm install` errors out asking for an explicit choice. Write `targets: [claude]` (or whatever the host harness is) in `apm.yml` unconditionally; do not rely on directory auto-detection.
   - **`targets:` does not strictly gate deploy directories.** Even with `targets: [claude]`, APM 0.12+ may also write to `.agents/skills/` alongside `.claude/skills/`. Inspect the `apm install` output (`Skill integrated -> ...`) and treat every listed path as a deploy target for the gitignore decision below.
   - Pinning: catalog entries do not carry tags. Resolve a concrete tag or SHA via `apm view <repo>` (or check the upstream repo's release page) before committing `apm.yml`. Floating refs are listed under Common mistakes.
5. **Decide the gitignore policy before the first commit.** `apm install` auto-adds `apm_modules/` to `.gitignore` but does NOT add the deploy targets. Pick one and stick to it:
   - **Commit deploy targets** (`.claude/skills/`, `.agents/skills/`, …): repo is self-contained, teammates / CI can clone without running `apm install`. Cost: file count balloons (7 skills ≈ 700 files in a recent utels install). Choose when teammates may not have APM, or when you want skill content reviewable in PRs.
   - **Gitignore deploy targets**: leaner repo; teammates run `apm install --frozen-lockfile` after clone. Add the exact paths emitted by `apm install` (e.g., `.claude/skills/`, `.agents/skills/`). Caveat: if the project also keeps local skills under the same directory (`.claude/skills/<local-skill>/`), gitignore only the APM-managed subpaths, not the whole directory.
   - Always commit `apm.yml` and `apm.lock.yaml` regardless. Without the lockfile the install is not reproducible — the deploy-target gitignore choice only changes whether the *generated* artifacts live in git.
   - Propose the choice to the user when the install lands the first APM skills in the repo. Don't silently pick — file-count bloat vs. clone-time install are both legitimate but the trade-off is repo-specific.
6. If a need is unmet, escalate to Phase 2. Do not skip Phase 1 — even if a search query is already forming in your head, scanning the catalog is cheaper.

## Phase 2 — Search and evaluate (delegated to `skill-finder`)

Phase 2 is owned by the `skill-finder` skill. Trigger it only when **all** of the following are true:

- Phase 1 has no candidate (catalog scanned, no row matched within ~30 seconds).
- The need is **recurring**, not a one-off setup task. One-off scaffolding (Vite/React init, single-shot config conversion, ad-hoc data migration) belongs inline.
- The need is **stated as an active pain or near-term task**, not just an ambient signal. A Rust service that exists in the repo but isn't currently causing skill-shaped questions does not by itself justify Phase 2 — wait until the recurring need surfaces.

If any of the three is false, do nothing. Re-read the "When NOT to use" section above before escalating.

To run Phase 2: tell the user "Phase 1 catalog has no fit; want me to invoke `skill-finder` for a cross-source search?" and only proceed on explicit go-ahead. `skill-finder` performs the cross-source survey (Anthropic official → claude-skill-registry → VoltAgent → ComposioHQ → Superpowers → GitHub topic), applies the same rubric, and gates adoption through a mandatory waxa eval. Do not duplicate that workflow inline.

## Phase boundary — do not blur

The two phases solve different problems:

- Phase 1 trades breadth for confidence. The catalog is curated; trust it.
- Phase 2 trades confidence for breadth. Compensate with explicit evaluation.

Common failure: starting in Phase 2 ("let me grep GitHub for a Playwright skill") when Phase 1 already has `playwright-test`. Always read the catalog first.

Reverse failure: forcing a Phase 1 fit when the catalog truly has nothing suitable. If no row matches within ~30 seconds of scanning, escalate — don't pad the install list with adjacent-but-not-quite skills.

## Maintenance of the catalog

- Catalog is part of this skill. Keep it in sync when `mizchi/skills` (and upstream skill repos referenced) gain or lose skills.
- A skill discovered through Phase 2 (`skill-finder`) may be promoted into the catalog after it has been used in 2+ projects without issue and after passing its waxa eval.
- If the catalog feels stale, cross-check against [`mizchi/skills` README](https://github.com/mizchi/skills) before falling back to `skill-finder`.

## Common mistakes

| Mistake | Fix |
|---|---|
| Installing skills "just in case" | Don't. Each one costs context per conversation. Install only when there's a near-term task that needs it. |
| Skipping the catalog and going straight to GitHub search | Re-read the catalog first. It exists to avoid this. |
| Adopting a Phase 2 skill without testing | `skill-finder` requires a waxa eval gate before adoption. Don't bypass it — descriptions can lie. |
| Floating refs in `apm.yml` for project scope | Pin to a tag or SHA. Drift mid-feature is its own debugging hell. |
| Re-evaluating the same rejected skill quarterly | Record the rejection reason in-repo. Don't re-search ground already covered. |
| Silently committing (or silently gitignoring) the APM deploy targets | Surface the choice — see step 5. Default-commit can balloon the repo; default-ignore can break teammates without APM. |
| Assuming `targets: [claude]` keeps deploy paths under `.claude/skills/` only | APM 0.12+ may also write to `.agents/skills/`. Read the `apm install` output and treat every path it lists as a deploy target. |
| Treating Phase 1 catalog as exhaustive | If nothing matches in ~30 seconds, escalate to Phase 2. Don't shoehorn. |

## Related

- `skill-finder` — Phase 2 owner; cross-source survey + waxa eval gate when the catalog has no fit
- `apm-usage` — actual `apm install` syntax and manifest format
- `empirical-prompt-tuning` — how to test a candidate skill before adopting it
- `superpowers:writing-skills` — when no existing skill fits, write one instead of adopting a poor match
- `chezmoi-management` — for skills that must stay private (the APM-vs-chezmoi boundary)
