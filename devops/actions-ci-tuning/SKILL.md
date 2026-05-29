---
name: "actions-ci-tuning"
description: "Use when auditing or improving GitHub Actions workflows for a project. Covers cache setup (npm/pnpm/yarn), job parallelism, shard-based test splitting, artifact handling pitfalls, and Playwright-specific patterns. Trigger on: slow CI, cache miss, flaky shard jobs, merge-reports failures, or an explicit 'tune CI' request."
---

# GitHub Actions CI Tuning

Audit and improve GitHub Actions workflows. Focus on correctness first (jobs that error rather than fail), then speed (cache, parallelism), then reliability (flakiness, artifact guards).

---

## Workflow

1. **Inventory** — list all `.github/workflows/*.yml` files and their trigger events, jobs, and rough durations (`gh run list --workflow <file> --limit 5`).
2. **Audit against checklist** — run through each section below and flag every gap.
3. **Prioritise** — group findings by impact: correctness bugs > cache misses > parallelism gains > cosmetic.
4. **Propose changes** — draft minimal diffs; do not refactor unrelated parts.
5. **Verify** — after applying, confirm via `gh run list` that the next run is green and faster.

---

## Checklist

### Package Manager Cache

A cache miss means re-downloading hundreds of packages on every run. This is the single highest-ROI fix in most repos.

**pnpm**

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: latest           # or pin to a specific version

- uses: actions/setup-node@v4
  with:
    node-version-file: .nvmrc  # or node-version: '20'
    cache: 'pnpm'              # ← must be present; omitting it silently skips caching
```

Common mistake: calling `corepack enable` instead of `pnpm/action-setup`. `corepack enable` does NOT set up the pnpm store cache — `actions/setup-node cache: 'pnpm'` requires `pnpm/action-setup` to have run first.

**npm**

```yaml
- uses: actions/setup-node@v4
  with:
    node-version-file: .nvmrc
    cache: 'npm'
```

**yarn (classic / berry)**

```yaml
- uses: actions/setup-node@v4
  with:
    node-version-file: .nvmrc
    cache: 'yarn'
```

**Verify cache is working**: look for `Cache restored successfully` in setup-node logs. If absent, `cache:` key is likely missing or the lockfile path is wrong.

---

### Dependency Install

- Always use `--frozen-lockfile` (pnpm) / `--ci` (npm) / `--immutable` (yarn berry) in CI. Prevents lockfile drift from silently changing the installed tree.
- Never use `npm install` or `pnpm install` without the frozen flag in CI.

---

### Parallel Jobs vs. Steps

- **Independent jobs** (lint, typecheck, test) should be separate jobs so they run in parallel, not sequential steps.
- **Sequential steps** are fine for setup within a single job (install → build → test).
- If a repo has lint + typecheck + unit test all in one job, split them.

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [checkout, setup, install, run lint]
  typecheck:
    runs-on: ubuntu-latest
    steps: [checkout, setup, install, run typecheck]
  test:
    runs-on: ubuntu-latest
    steps: [checkout, setup, install, run test]
```

---

### Test Sharding (Playwright / Vitest)

Use sharding to cut long test suites. Each shard runs a subset of tests in parallel.

**Playwright example — 4 shards:**

```yaml
jobs:
  e2e:
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2, 3, 4]
    steps:
      - run: pnpm exec playwright test --shard=${{ matrix.shard }}/4
        env:
          CI: true
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}       # ← upload even on test failure
        with:
          name: blob-report-${{ matrix.shard }}
          path: blob-report/
          retention-days: 1
```

**Pitfalls:**
- `fail-fast: false` is required — otherwise one failing shard cancels the rest before they upload blob reports.
- `if: ${{ !cancelled() }}` on the upload step ensures blob reports are uploaded even when tests fail. Without this, the merge-reports job gets no artifacts.

---

### Artifact Guard in merge-reports

When shards can fail before uploading blob reports, the `all-blob-reports` directory may not exist. Guard the merge command:

```yaml
- name: Merge reports
  run: |
    if [ -d all-blob-reports ] && [ "$(ls -A all-blob-reports 2>/dev/null)" ]; then
      pnpm exec playwright merge-reports --reporter=html ./all-blob-reports
    else
      echo "No blob reports found, skipping merge"
      mkdir -p playwright-report
      echo "<html><body><p>No test results available</p></body></html>" > playwright-report/index.html
    fi
```

Without this guard, the `merge-reports` job errors with `Error: Directory does not exist: ./all-blob-reports` even when the overall workflow should gracefully report "no results."

---

### Playwright Docker Image

For VRT (Visual Regression Testing), snapshots must be generated in the same environment as CI (Linux + specific fonts). Use the official Playwright Docker image instead of a plain `node:*` image:

```
mcr.microsoft.com/playwright:v1.59.1-noble   # pin to the same version as @playwright/test
```

**Why not `node:24`?**
- `node:24` requires `playwright install --with-deps chromium` which triggers `apt-get` and can hang for hours in Docker Desktop on macOS (known issue with apt in QEMU-emulated environments).
- The `mcr.microsoft.com/playwright` image ships Chromium and all system dependencies pre-installed — no apt-get needed, starts in seconds.

**Version pinning**: keep the image version in sync with `@playwright/test` in `package.json`. Mismatch causes browser-not-found errors.

---

### Concurrency Control

Cancel in-progress runs for the same branch/PR to avoid queue buildup:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Exception: do NOT cancel release/deploy workflows on `main`. Scope it to PR branches only:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```

---

### Scheduled Workflow Reliability

- Scheduled workflows on GitHub Actions can silently stop firing if the repo has no activity for 60 days.
- Add a `workflow_dispatch:` trigger alongside `schedule:` so it can be manually re-triggered without a code change.
- For critical scheduled jobs (e.g., nightly E2E), add a failure notification step (GitHub issue creation, Slack, etc.) so silent failures are visible.

```yaml
on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:      # ← always add this
```

---

### Action Version Pinning

- Pin third-party actions to a full commit SHA, not a tag. Tags can be moved.
- Use a comment with the human-readable version for readability:

```yaml
uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
```

- Dependabot or Renovate can keep SHA pins up to date automatically. Check that `.github/dependabot.yml` includes the `github-actions` ecosystem.

**Node.js 20 deprecation warning**: GitHub started issuing "Node.js 20 actions are deprecated" warnings in 2025/2026. This refers to the action's own runtime (`runs.using: node20`), not the project's Node version. Fix by upgrading to the first major version that uses `node24`:

| action | node24-compatible version (as of 2026-05) |
|---|---|
| `actions/checkout` | v6.0.0+ |
| `actions/setup-node` | v6.0.0+ |
| `actions/cache` | v5.0.0+ |
| `actions/upload-artifact` | v7.0.0+ |
| `actions/download-artifact` | v8.0.0+ |
| `aws-actions/configure-aws-credentials` | v6.0.0+ |

Latest pinned SHAs (2026-05):
```yaml
uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e # v6.4.0
uses: actions/cache@27d5ce7f107fe9357f9df03efb73ab90386fccae # v5.0.5
uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1
uses: actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8.0.1
uses: aws-actions/configure-aws-credentials@99214aa6889fcddfa57764031d71add364327e59 # v6.1.3
```

Note: SHAs drift — always verify with `gh release view --repo <owner>/<action>` before pinning.

---

### Environment Variables

- `CI: true` should be set at the job or workflow level, not only in individual run steps. Many tools (Playwright, Vite, etc.) change behavior based on this flag.
- Secrets should use `${{ secrets.NAME }}` — never hardcode tokens.
- `NODE_OPTIONS: --max-old-space-size=4096` is sometimes needed for large builds in constrained runners (default heap is ~1.5 GB for a 7 GB runner).

---

## Quick Audit Commands

```bash
# List recent run durations for a workflow
gh run list --workflow e2e.yml --limit 10 --json databaseId,displayTitle,createdAt,updatedAt,conclusion \
  | jq '.[] | {title: .displayTitle, duration: (.updatedAt | fromdate) - (.createdAt | fromdate), conclusion: .conclusion}'

# Find jobs that always time out
gh run list --workflow e2e.yml --status failure --limit 20 --json databaseId \
  | jq -r '.[].databaseId' \
  | xargs -I{} gh run view {} --json jobs \
  | jq '.jobs[] | select(.conclusion == "timed_out") | .name'

# Check cache usage in a run
gh run view <run_id> --log | grep -i "cache"
```

---

## Common Anti-Patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| `corepack enable` only (no pnpm/action-setup) | pnpm store is not cached | Add `pnpm/action-setup@v4` before setup-node |
| `pnpm install` without `--frozen-lockfile` | Lockfile can silently drift | Use `--frozen-lockfile` always in CI |
| `fail-fast: true` on test matrix | Shards cancel before uploading artifacts | Set `fail-fast: false` |
| Upload artifact without `if: ${{ !cancelled() }}` | Blob reports lost on test failure | Add the `if` condition |
| `playwright merge-reports` without directory guard | Job errors when no shards uploaded | Guard with `[ -d all-blob-reports ]` check |
| `node:*` image for Playwright VRT | apt-get hangs in Docker Desktop on macOS | Use `mcr.microsoft.com/playwright` image |
| Scheduled workflow without `workflow_dispatch` | Can't manually re-trigger | Always add `workflow_dispatch:` |
| Action pinned to tag not SHA | Tag can be moved (supply-chain risk) | Pin to full commit SHA |
