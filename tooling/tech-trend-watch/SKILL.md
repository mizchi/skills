---
name: tech-trend-watch
description: Long-term technology stack review using State of JS, State of CSS, and Thoughtworks Technology Radar — satisfaction×usage matrix, ADOPT/TRIAL/ASSESS/HOLD mapping, P0–P3 migration priority. Use for annual stack audits, planning major migrations (jest→vitest, webpack→Vite, etc.), or on-demand replacement decisions. Not for general architecture design.
---

# Long-Term Technology Watch

## Data Sources

| Source | Cadence | URL | What it measures |
|---|---|---|---|
| State of JS | Annual (autumn) | https://stateofjs.com | JS libraries, frameworks, tools — usage + satisfaction |
| State of CSS | Annual (autumn) | https://stateofcss.com | CSS tools, frameworks, features — usage + satisfaction |
| Thoughtworks Tech Radar | Quarterly | https://www.thoughtworks.com/radar | Broad tech (langs, platforms, tools, techniques) — ring assignments |

Fetch the latest edition of each before starting the review. State of JS/CSS also publish a public JSON API:

```
https://assets.devographics.com/surveys/js<YYYY>/en-US/results.json
https://assets.devographics.com/surveys/css<YYYY>/en-US/results.json
```

## Step 1 — Inventory current stack

List all significant dependencies from `package.json`:

```bash
jq -r '(.dependencies // {}) + (.devDependencies // {}) | keys[]' package.json | sort
```

Focus on: frameworks, bundlers, test runners, type checkers, linters, CSS tooling, state management, routing, data fetching, animation. Exclude low-level utilities and polyfills from the review.

## Step 2 — State of JS/CSS mapping

For each technology in the current stack, locate it in the State of JS/CSS results.

### Satisfaction × Usage matrix

```
                  Low usage        High usage
                ┌────────────────┬────────────────┐
High            │   EMERGING     │    STABLE      │
satisfaction    │  (consider     │  (keep, likely │
                │   adopting)    │   healthy)     │
                ├────────────────┼────────────────┤
Low             │   AVOID        │    LEGACY      │
satisfaction    │  (don't start) │  (plan exit)   │
                └────────────────┴────────────────┘
```

Thresholds (State of JS survey): **high** ≥ 70%, **low** ≤ 55%. Values between 55–70% are borderline — check year-over-year trend to break the tie.

**STABLE** (high usage + high satisfaction): No action. Healthy ecosystem.

**EMERGING** (low usage + high satisfaction): Evaluate for adoption. Check: maturity, ecosystem completeness, migration cost from current choice.

**LEGACY** (high usage + low satisfaction): Schedule migration. High usage means inertia is the only reason it's still there. Check: what are people migrating to?

**AVOID** (low usage + low satisfaction): Do not start new projects on this. If already used: plan removal.

### Additional signals

- **Year-over-year trend**: Is satisfaction rising or falling? A falling trend in STABLE is an early LEGACY signal.
- **Retention vs interest**: High retention (users stick with it) + high interest (non-users want it) = safe bet.
- **"Would not use again" spike**: Single strongest LEGACY signal.

## Step 3 — Technology Radar mapping

Check the Thoughtworks Tech Radar for each item. Rings:

| Ring | Meaning | Action |
|---|---|---|
| **ADOPT** | Proven, low risk, recommended for wide use | Use as default choice |
| **TRIAL** | Worth pursuing, proven for specific cases | Try in real projects, gather experience |
| **ASSESS** | Promising, explore impact | Spike / PoC only, not production |
| **HOLD** | Proceed with caution, don't start new | No new projects; plan exit if already used |

If an item appears on the radar, note the ring and the date of first appearance. Items that have been HOLD for 2+ years without movement are candidates for active removal.

Items not on the radar are not necessarily bad — the radar skews toward enterprise/consultancy concerns and lags emerging JS ecosystem tools by 1–2 years.

## Step 4 — Cross-reference and prioritize

Combine signals into a 4-level action priority:

| Priority | State of JS signal | Tech Radar signal | Action |
|---|---|---|---|
| **P0 — Migrate now** | LEGACY | HOLD | Create migration PR this sprint |
| **P1 — Plan migration** | LEGACY or falling | ASSESS or HOLD | Schedule in next quarter |
| **P2 — Watch** | Declining retention | Not on radar | Monitor next annual cycle |
| **P3 — No action** | STABLE | ADOPT or TRIAL | Keep as-is |

Newly EMERGING tech: do not migrate unless the current tool is P0/P1. Switching costs > marginal improvement unless forced.

## Step 5 — Migration candidate evaluation

For each P0/P1 item, estimate:

1. **Migration effort**: grep for usage count, estimate hours
2. **Target alternative**: what did State of JS "movers" migrate to?
3. **Coexistence period**: can old and new run side-by-side during migration?
4. **Risk**: does it touch runtime (high risk) or build tooling only (lower risk)?

Example evaluation template:

```
### jest → vitest

- Current usage: 47 test files (grep -r "from 'jest'" src/)
- State of JS signal: LEGACY (satisfaction dropped from 85% → 61% 2021→2024)
- Tech Radar: HOLD (Vol.30)
- Target: vitest (STABLE, Tech Radar ADOPT Vol.31)
- Effort: ~4h (config migration + minor API diffs, @testing-library compatible)
- Coexistence: no (different config, but can migrate per-file)
- Risk: build tooling only → low
- Recommendation: migrate in one PR
```

## Step 6 — Output

Write a review doc with:

```
## Tech Watch — <YYYY-QN>

### Data source versions
- State of JS: <year>
- State of CSS: <year>
- Tech Radar: Vol.<N> (<date>)

### Stack health summary
| Technology | Category | Signal | Priority | Notes |
|---|---|---|---|---|
| vitest | test runner | STABLE / ADOPT | P3 | — |
| tailwindcss | CSS | STABLE / ADOPT | P3 | v4 migration due |
| jest | test runner | LEGACY / HOLD | P0 | migrate to vitest |
| ... | | | | |

### P0 — Migrate now
- [ ] <package>: <brief rationale> → <target>

### P1 — Plan migration (next quarter)
- [ ] <package>: <brief rationale>

### P2 — Watch (next annual cycle)
- <package>: <signal to monitor>

### Newly emerged (consider adopting)
- <technology>: EMERGING, TRIAL — evaluate for <use case>
```

## Cadence

- **Annual**: Run full review aligned with State of JS/CSS release (typically November–January).
- **Quarterly**: Check Tech Radar new volume for changes to existing stack items.
- **On-demand (new adoption)**: Run Step 3 (Radar only) when evaluating whether to add a new library with no existing incumbent.
- **On-demand (replacement decision)**: Run Steps 2–5 for both the current tool and the candidate. Omit Step 1 stack inventory and Step 6 full output doc — produce a single migration evaluation instead. Use this path when the question has an incumbent ("should we switch from X to Y?" or "should we add Y or keep X?").

## Boundaries

- This skill covers strategic decisions, not implementation. For executing updates, use `dep-lib-review`.
- Do not use Tech Radar alone — it lags the JS ecosystem. Always cross-reference with State of JS/CSS.
- "Everyone is migrating to X" is not sufficient reason to migrate. Evaluate migration cost vs. actual pain with the current tool.

## Related

- `dep-lib-review` — executes the actual update (patch/minor/major batching)
- `frontend-review-deps` — operational dependency audit with CVE triage and trend-watch scripts
