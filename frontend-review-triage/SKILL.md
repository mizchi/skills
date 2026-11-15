---
name: frontend-review-triage
description: Use when starting a frontend review engagement or when the user asks for an initial assessment ("triage", "day 0", "what's the state of this repo"). Reads package.json, README, gh issues, and produces a scorecard covering lockfiles, TypeScript strictness, testing, CI, and known issues. Runs `scripts/audit-triage.sh`.
---

# Frontend Review — Triage

You are performing Day 0 triage for a frontend consulting engagement. Your job is to produce a short, honest scorecard of the repository's current state, not to recommend fixes. Recommendations come later from the other `frontend-review-*` skills.

## Procedure

Collector reports use a versioned envelope: read values under `data`, inspect `status` and `issues`, and keep missing measurements distinct from zero. See the local collection contract.

0. **Classify the app** before running any script.
   - Ask the user (or infer from README / package.json) which app type applies:
     `admin` / `toc` / `btob-saas` / `ec` / `fintech` / `healthcare` / `iot-ops` / `media`
   - Note any regulatory context (GDPR, PCI DSS, HIPAA, …) and authentication requirements.
   - Derive security, performance, type/lint, coverage and dependency priorities from the client's explicit requirements and deployed data paths. Record assumptions; a domain label alone does not establish regulatory compliance or a KPI target.
   - Save the result to `<client-repo>/.frontend-review/kpi/app-classification.json`.
1. Run `scripts/audit-triage.sh --repo <client-repo>` where `<client-repo>` is the absolute path to the user's repository.
2. Read the resulting JSON at `<client-repo>/.frontend-review/report/latest/raw/triage.json`.
3. Also quickly skim:
   - `package.json` — dependencies, scripts, engines
   - `README.md` — is it up-to-date, does it describe how to run things
   - `.github/workflows/` — which workflows exist
   - `gh issue list --state open --limit 20 --json number,title,labels` — what's already flagged
4. Compare repository issue history and documented limitations with the collected facts; record missing evidence explicitly.

## Output

Write a Markdown report to `<client-repo>/.frontend-review/report/latest/md/triage-scorecard.md` with:

- **App classification** — type ID and key domain notes (1–3 lines)
- **Priority overrides** — which P0 security/perf checks apply to this app type
- **Scorecard table** (copy from `raw/triage.json` and annotate)
- **Top 3 risks** — what would you fix first? Flag whether each risk is P0 or P1 per the classification matrix.
- **Open questions** for the client (things you can't tell from the code)
- **Next phase** — the checks and measurements to establish next, ordered by the recorded client requirements

Keep the entire report under 400 lines. If you find yourself writing more, you're analyzing instead of triaging.

## Boundaries

- Do NOT propose fixes beyond a short "top 3 risks" section. Each risk is one sentence.
- Do NOT run any other `audit-*.sh` script — leave those for the domain-specific skills.
- Do NOT modify any files outside `<client-repo>/.frontend-review/`.
- Do NOT push commits or create PRs in the client repo.

## Reference

Read the bundled [collection contract](references/collection-contract.md) for report schemas, standalone script paths, partial results and verification limits. The operational guidance above does not require an external checklist bundle.
