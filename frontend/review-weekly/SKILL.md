---
name: frontend-review-weekly
description: Use for the weekly AI review. Orchestrates all frontend-review-* skills in order, dispatches the 5 perspective sub-skills in parallel, diffs against last week's KPIs, and produces a weekly report that feeds the ratchet.
---

# Frontend Review — Weekly Orchestrator

You are running the weekly AI review. Your job is NOT to make new judgments — it's to:

1. Re-run every `frontend-review-*` skill in the correct order.
2. Dispatch the 5 perspective sub-skills in parallel.
3. Diff the KPIs against last week's baseline.
4. File GitHub issues for repeat findings.
5. Propose static-rule promotions for patterns that appear 3+ weeks in a row.

## Procedure

### Phase 1: raw data collection

Run, in this order:

1. `frontend-review-triage`
2. `frontend-review-ci`
3. `frontend-review-hygiene`
4. `frontend-review-deps`
5. `frontend-review-testing`
6. `frontend-review-security`

Each of these writes to `<client-repo>/.frontend-review/report/latest/`.

### Phase 1.5: architecture review (run when findings are suspected)

Run these on-demand, or always for the first weekly of a new engagement:

7. `frontend-review-state`
8. `frontend-review-performance`

These write to `<client-repo>/.frontend-review/report/latest/md/`.

### Phase 2: perspective review (parallel)

Dispatch the 5 perspective skills concurrently using the `dispatching-parallel-agents` skill. Each reads the raw JSON and produces a perspective-specific markdown report:

- `frontend-expert`
- `react-expert`
- `performance-expert`
- `security-expert`
- `frontend-ops-expert`

### Phase 3: KPI diff and ratchet

Compare `<client-repo>/.frontend-review/report/latest/raw/*.json` against `<client-repo>/.frontend-review/kpi/baseline.json`. Flag:

- Any **regression** (bad) — these must be fixed before the next weekly
- Any **improvement** (good) — these update the baseline (ratchet tightens)

### Phase 4: repeat-finding detection

Compare this week's findings with the previous 2 `report/weekly-*.md` files. Any finding that appears in all three weeks is a candidate for **static rule promotion**: propose an eslint/biome custom rule, a codemod, or a CI gate that would make the check automatic. Write these proposals to `<client-repo>/eslint-rules/proposals/<rule-name>.md` (create the directory if needed) but do NOT implement them — that's a separate engineering task.

### Phase 5: report

Write `<client-repo>/.frontend-review/report/weekly-$(date +%Y-w%V).md` with:

- **KPI delta table** (per category)
- **Regressions** (must fix)
- **Improvements** (ratchet updates)
- **Perspective summaries** (1 paragraph per perspective)
- **Static rule promotions** (pointer to proposals)
- **Issues filed** (`gh issue create` output)

## Trend Monitoring

Alongside KPI diffing, check the following external signals once per weekly cycle to detect ecosystem drift early.

### Monitoring sources

| Source | Cadence | What to look for |
|---|---|---|
| **jser.info** | Weekly (Sunday publish) | Major releases, RFCs, breaking changes, security advisories affecting the project's dependencies |
| **State of JS** (yearly, ~Dec) | Annual | Usage/satisfaction trends; two consecutive years of satisfaction decline is a switch-trigger |
| **State of CSS** (yearly) | Annual | CSS adoption trends, Tailwind / CSS-in-JS sentiment |
| **JavaScript Rising Stars** (yearly, ~Jan) | Annual | GitHub star growth; early signal for emerging tools |
| **Official release blogs** | On release | Track the project's direct dependencies (framework, bundler, test runner, linter, TypeScript) for major releases |

For the weekly run, WebFetch `https://jser.info/` and scan for any mention of packages listed in `package.json`. Flag anything relevant under an **Ecosystem Signals** heading.

### Switch triggers

Recommend investigating a tool replacement when **any two** of these conditions are met:

1. Satisfaction score has declined for **2 consecutive years** in State of JS / State of CSS.
2. **No major release in the past 6 months** and GitHub issue accumulation is trending up.
3. A **maintainer departure or deprecation notice** was reported.
4. A **clear superior alternative** exists: feature parity + significant performance or DX improvement + realistic migration path.

## AI / Human Responsibility Split

**AI can act on (without human pre-approval):**
- Auto-fixable lint / typecheck errors
- Expanding test coverage for existing patterns
- Dependency version bumps (after lint + test pass)

**Human must decide:**
- Test failure triage: is the spec wrong, the implementation wrong, or the test wrong?
- New library additions or removals
- Architecture boundary changes (new state layer, new routing pattern, new async boundary)
- Any change that modifies what the app does, not just how it does it

Flag any AI-generated PRs in the weekly report that appear to cross into the human-decision zone.

## Boundaries

- Do NOT skip any of the Phase 1 domain skills, even if time is short.
- Do NOT modify source code in the client repo.
- Do NOT silently update `kpi/baseline.json` on a regression. Only update on improvement.

## Reference

- Checklist: `11-ai-review.md`, `13-kpi-tracking.md`
- Phase: `week-4-ai-review.md`, `ongoing.md`
- Related skills: all `frontend-review-*` and sub-skills in `review-perspectives/`
- External skill: `superpowers:dispatching-parallel-agents`
