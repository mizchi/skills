---
name: flaker-storage-cache-on-ci
description: Persist flaker's DuckDB storage across GitHub Actions runs and feed it from multiple sources (vitest reports, custom adapter reports, etc.). Use when wiring `@mizchi/flaker` into a new repo's CI, adding a new ingest source to an existing flaker setup, or debugging why `flaker apply` / `flaker run --gate ...` "lost its history" between runs. Encodes the cache key shape, fetch-depth requirements, `--changed` derivation, and the import-step placement that internal flaker users converged on.
---

# flaker storage cache on GitHub Actions

`flaker` keeps its data in a DuckDB file at the path declared by `flaker.toml` `[storage] path` (default `.flaker/data`). For flaky detection / KPI / quarantine to work, that file must persist between CI runs. GitHub Actions has no first-class runtime storage, so the convention is **`actions/cache@v4` with a sliding key**.

## When this skill applies

- "新しい repo に flaker を CI で動かす"
- "flaker の履歴が CI で消えてる / 毎回ゼロからになる"
- "flaker に <source> を import するワークフロー追加して"
- "VRT / playwright / custom-adapter report を flaker に流したい"

## Cache key shape

```yaml
- name: Cache flaker data
  if: always()
  uses: actions/cache@v4
  with:
    path: .flaker/data
    key: flaker-data-${{ github.run_id }}
    restore-keys: |
      flaker-data-
```

- `key` uses `github.run_id` so each run *writes* a new cache entry on save (GH Actions saves at end of job).
- `restore-keys: flaker-data-` matches anything written previously, falling back to the most recent — so the next run sees the latest accumulated state regardless of which earlier run produced it.
- `if: always()` so a failed earlier step still triggers the save (history-on-failure is fine and often more useful than history-only-on-success).

The `path` MUST equal `flaker.toml`'s `[storage] path`. Default is `.flaker/data` (a file, not a directory — pre-creating it as a dir breaks the DuckDB open).

**In a pnpm workspace monorepo**: prefix the cache `path` with the package directory, e.g. `packages/<pkg>/.flaker/data`. flaker does NOT walk up to find `flaker.toml` — it must live next to where flaker is invoked. Mismatched cache path vs flaker.toml location surfaces as `Config file not found` (when running from repo root) or "history vanished every run" (when cache and flaker disagree on where storage is).

## Triggering writes

`actions/cache@v4` saves automatically in its post-step. Callers don't `cache save` explicitly. The save key is the run-id, so duplicate writes never collide.

## fetch-depth for `--changed` derivation

Any flaker invocation that uses the **hybrid / affected** strategy (`flaker run --gate merge` in CI profile, by default) needs `--changed <files,...>`. Without it: `Error: hybrid mode requires resolver and changedFiles`.

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0  # need history for `git diff` against the PR base
```

```yaml
- name: flaker run --gate merge
  env:
    BASE_REF: ${{ github.event.pull_request.base.ref }}
  run: |
    changed=$(git diff --name-only "origin/${BASE_REF}...HEAD" | tr '\n' ',' | sed 's/,$//')
    pnpm exec flaker run --gate merge --changed "$changed"
```

Empty diff (config-only PR, etc.) is fine — hybrid falls back to the configured fallback strategy.

## Workflows: which one persists, which one reads

Reference layout for splitting workflows by trigger:

| Workflow | Trigger | Reads cache | Writes cache | Notes |
|---|---|---|---|---|
| `flaker-nightly.yml` | cron + workflow_dispatch | yes | yes | Runs `flaker apply`. The canonical writer of vitest history. |
| `<source>-baseline.yml` | push to main + cron | yes | yes | Imports a custom-adapter report via `flaker import --adapter <name>`. Same cache key. |
| `flaker-pr.yml` | pull_request | yes | (yes implicitly, harmless) | Advisory only, `continue-on-error: true`. |
| `<source>-pr-gate.yml` | pull_request | NO | NO | PR-scoped runs would distort the population — keep them ephemeral. |

**Rule of thumb**: anything that touches main / scheduled writes; PR-scoped checks read-only or no cache.

## Adding a new ingest source

Common pattern (custom adapter, see flaker#79 for the adapter contract):

1. Produce the report file (e.g. `<source>-report.json`, `vitest-report.json`).
2. Restore the cache (or rely on the same job's earlier restore step).
3. Import:
   ```yaml
   - name: Import <source> into flaker
     if: always()
     run: |
       pnpm exec flaker import <report-file> \
         --adapter <name> \
         --commit "${{ github.sha }}" \
         --branch "${{ github.ref_name }}" \
         --source ci
   ```
4. The cache save at end-of-job picks up the new rows automatically.

`if: always()` ensures partial-failure runs still record what they saw before the failure.

## Don't do this

- **Don't pre-create `.flaker/data` as a directory** before flaker runs. DuckDB expects to open it as a file; `IO Error: Could not read from file ... Is a directory` is the symptom. The cache `path: .flaker/data` referencing a not-yet-existing file is fine — actions/cache restores it if present, and flaker creates it if not.
- **Don't add `flaker import` to PR-only workflows** without thinking. PR runs happen on every commit-to-PR and would dominate the population. Keep PR jobs read-only against the cache.
- **Don't use `NODE_OPTIONS=--preserve-symlinks-main`** with flaker ≥ 0.10.7. It was a workaround for a pnpm symlink bug fixed in 0.10.7; under 0.11.x the env var **silently turns the CLI into a no-op, exit 0** (no output, no work done). Surfaced via downstream usage, removed in flaker upstream.
- **Don't try to write the cache from a PR fork**. GH Actions disallows writes from forks for security reasons; the restore still works, the save silently no-ops.

## Diagnostics

If history "vanishes":

1. Check the cache hit log line in the workflow run — if it says `Cache not found for input keys`, the restore-keys prefix doesn't match what was saved.
2. Check `flaker.toml` `[storage] path` matches the cached `path:` exactly.
3. Run `flaker doctor` in the same job — confirms the file is open-able.
4. `flaker status --markdown` exposes row counts so you can see what was actually loaded.

## Reference

- `flaker` itself (`docs/contributing.md`) for the storage path convention.
- The `--adapter` system docs for writing a custom report importer.
