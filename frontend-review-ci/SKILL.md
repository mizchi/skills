---
name: frontend-review-ci
description: Use when CI is slow (>10 min), flaky, or the user asks to optimize GitHub Actions for a frontend project. Analyzes `gh run list` history, identifies bottleneck steps, proposes sharding / cache / concurrency improvements. Runs `scripts/audit-ci.sh`.
---

# Frontend Review — CI Optimization

You are optimizing GitHub Actions CI for a frontend project. The target is **median ≤ 10 minutes, max ≤ 15 minutes**. Faster CI means developers trust it; trust is what makes the ratchet work.

## Procedure

1. Run `scripts/audit-ci.sh --repo <client-repo>`.
2. Read `<client-repo>/.frontend-review/report/latest/raw/ci.json`.
3. For the slowest runs, dig into step-level timing:
   ```bash
   gh run view <run-id> --log | grep -E '^\d{4}-' | head -200
   ```
4. Inventory current workflows under `.github/workflows/` and note:
   - Does **every job** (lint, build, test, coverage, etc.) use a pnpm/npm store cache? A common miss: `test.yml` has cache but `lint.yml` and `pages.yml` do not.
   - Does `actions/setup-node` use `cache: pnpm`, or is there a manual `actions/cache` block for the pnpm store? Either is fine; the key must include `hashFiles('**/pnpm-lock.yaml')`.
   - Does `actions/cache` cache the Playwright browser store (`~/.cache/ms-playwright`)?
   - Is there a `concurrency:` block?
   - Are vitest / playwright sharded?
   - Are jobs serialized via `needs:` unnecessarily?
   - Are `lint` and `typecheck` in the same serial job? They have no dependency on each other and should be separate parallel jobs.

## Output

Write `<client-repo>/.frontend-review/report/latest/md/ci-analysis.md` with:

- Current median / max duration
- Slowest 3 steps in a representative failing + passing run
- Concrete recommendations, each mapped to a line in a YAML patch (not full rewrite)
- Estimated wins per recommendation

Then produce a draft PR description that the user can copy into `gh pr create`, naming the branch `ci/optimize`.

## Development Iteration Timing Targets

Use these as reference thresholds when diagnosing CI slowness. Any stage exceeding **2× its target** warrants a dedicated bottleneck issue.

| Stage | Target | How to measure |
|---|---|---|
| HMR (edit → screen) | < 500 ms | Vite `--debug` output |
| Unit test — single file | < 1 s | vitest / jest output |
| `test:ci` — full suite | < 1 min | CI step duration |
| `typecheck` | < 30 s | CI step duration |
| `lint` | < 30 s | CI step duration |
| E2E — one shard | < 50 s | CI step duration |
| **PR CI total (parallel)** | **< 5 min** | GitHub Actions wall-clock |
| `install` (cache hit) | < 15 s | CI step duration |
| `build` | < 30 s | CI step duration |

The **PR CI total** target is the critical gate. CI slower than 5 minutes is routinely bypassed by developers.

## Bottleneck Identification Procedure

1. Pull step-level timing from the slowest recent run:
   ```bash
   gh run view <run-id> --log | grep -E '^\d{4}-' | head -200
   ```
2. Identify the **single slowest job** in the DAG — only the longest path in a parallel graph determines wall-clock time.
3. Within that job, identify the slowest step.
4. Propose **one change per PR** — bundling multiple optimisations makes regression attribution impossible.
5. Measure wall-clock before/after on the same branch to verify the win.

## Typical Optimisation Patterns

| Area | Common fix |
|---|---|
| `install` | pnpm / npm store cache key, `--frozen-lockfile`, narrow `onlyBuiltDependencies`. **Audit every workflow file** — partial cache (only some jobs cached) is the most common oversight; `install` without cache is ~20-25 s, with cache hit it drops to ~2-3 s |
| `lint + typecheck` | Split into two parallel jobs (no mutual dependency). On a project with ~170 TS files, this alone cuts the lint-job wall-clock in half |
| `typecheck` | Project References split, `skipLibCheck: true`, resolve circular type imports |
| `lint` | lint-staged for PR (changed files only), enable linter's own incremental cache |
| `vitest` | `isolate: false`, tune `--pool` thread count, exclude test fixtures from coverage |
| Playwright | Tune shard count to test volume, `page.route()` to mock external APIs, move flaky tests to daily-only tag |
| Runner size | Larger runner (4-core+) only as a last resort after exhausting the above |

## Boundaries

- Do NOT actually create the PR or push the branch — just draft the description.
- Do NOT modify workflow YAML in the client repo; the user does that after reviewing your proposal.

## Reference

- Checklist: `checklist/09-ci-optimization.md`
- Phase: `phase/week-1-ci-baseline.md`
- Templates: `templates/github-actions/ci.yml`, `templates/github-actions/e2e.yml`
