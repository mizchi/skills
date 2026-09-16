---
name: frontend-review-triage
description: Use when starting a frontend review engagement or when the user asks for an initial assessment ("triage", "day 0", "what's the state of this repo"). Reads package.json, README, gh issues, and produces a scorecard covering lockfiles, TypeScript strictness, testing, CI, and known issues. Runs `scripts/audit-triage.sh`.
---

# Frontend Review — Triage

You are performing Day 0 triage for a frontend consulting engagement. Your job is to produce a short, honest scorecard of the repository's current state, not to recommend fixes. Recommendations come later from the other `frontend-review-*` skills.

## Procedure

0. **Classify the app** before running any script.
   - Ask the user (or infer from README / package.json) which app type applies:
     `admin` / `toc` / `btob-saas` / `ec` / `fintech` / `healthcare` / `iot-ops` / `media`
   - Note any regulatory context (GDPR, PCI DSS, HIPAA, …) and authentication requirements.
   - Read `checklist/00-app-classification.md` Step 3 to determine which security, performance, TypeScript strictness, lint, coverage targets, and dependency freshness checks are P0 vs P1 vs skip for this app type.
   - Save the result to `<client-repo>/.frontend-review/kpi/app-classification.json`.
1. Run `scripts/audit-triage.sh --repo <client-repo>` where `<client-repo>` is the absolute path to the user's repository.
2. Read the resulting JSON at `<client-repo>/.frontend-review/report/latest/raw/triage.json`.
3. Also quickly skim:
   - `package.json` — dependencies, scripts, engines
   - `README.md` — is it up-to-date, does it describe how to run things
   - `.github/workflows/` — which workflows exist
   - `gh issue list --state open --limit 20 --json number,title,labels` — what's already flagged
4. Cross-reference against `checklist/12-known-issues.md` for the "known issues" collection routine.

## Output

Write a Markdown report to `<client-repo>/.frontend-review/report/latest/md/triage-scorecard.md` with:

- **App classification** — type ID and key domain notes (1–3 lines)
- **Priority overrides** — which P0 security/perf checks apply to this app type
- **Scorecard table** (copy from `raw/triage.json` and annotate)
- **Top 3 risks** — what would you fix first? Flag whether each risk is P0 or P1 per the classification matrix.
- **Open questions** for the client (things you can't tell from the code)
- **Next phase** — which `checklist/` items the Week 1 plan should target, ordered by the classification priority

Keep the entire report under 400 lines. If you find yourself writing more, you're analyzing instead of triaging.

## Boundaries

- Do NOT propose fixes beyond a short "top 3 risks" section. Each risk is one sentence.
- Do NOT run any other `audit-*.sh` script — leave those for the domain-specific skills.
- Do NOT modify any files outside `<client-repo>/.frontend-review/`.
- Do NOT push commits or create PRs in the client repo.

## Reference

- Checklist: `checklist/00-app-classification.md`, `checklist/12-known-issues.md`, `checklist/01-package-manager.md`, `checklist/02-dependencies.md`
- Phase: `phase/day-0-triage.md`
