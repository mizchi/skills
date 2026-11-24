# Verified example

`assets/polyglot/` was built and measured on 2026-11-24, macOS arm64, Bazel 9.3.3 via bazelisk 1.30.0.

Pipeline: `//gen:data` (Go writes JSON) → `//report:summary` (Python summarizes) → `//web:report` (TypeScript renders text) → `//tests:report_test` (shell asserts `items=3 total=10`).

| Run | Condition | Result |
|---|---|---|
| cold | empty disk cache | 25 actions executed, 43 s, test PASSED |
| unchanged, after `bazel clean` | disk cache warm | 25/25 disk cache hit, 2.4 s |
| new output base and new checkout path | disk cache warm | 25/25 hit — keys do not depend on the checkout path |
| `bazel clean --expunge`, repository cache emptied | disk cache warm | 25/25 hit, 5.6 s |
| comment appended to `report/summarize.py` | — | only the Python genrule reran; downstream hits (early cutoff), 0.5 s |
| `--config=ci` with an unregistered module added | — | fails: "Missing checksum for registry file ... not permitted with --lockfile_mode=error" |
| GC with `--experimental_disk_cache_gc_idle_delay=0s`, cap 100M | 297 MB cache | 100 MB after `bazel shutdown` |
| GC with default idle delay, cap 60M | 100 MB cache | unchanged after `bazel shutdown` |

Anomaly: 3 of 13 clean rebuilds missed every action although the per-action digests in the execution logs matched runs that hit. Not reproduced afterwards; cause unknown (see `cache-misses.md`).

## GitHub Actions (ubuntu-latest)

`assets/workflows/bazel.yml` ran on 2026-11-24 in a private verification repository holding this example. Cache sizes: disk 77 MB, repository 441 MB, bazelisk 55 MB.

| Run | Trigger | Restored | Actions | Job time | Saved |
|---|---|---|---|---|---|
| 1 | push to main, empty caches | nothing | 25 executed, 0 hit | 2 m 49 s (test step 130 s) | disk, repository, bazelisk |
| 2 | push to main, comment added to `report/summarize.py` | all three (disk by `restore-keys` prefix) | 24 hit, 1 executed (the Python genrule) | 1 m 10 s | a new per-commit disk entry |
| 3 | `workflow_dispatch` on main, no change | all three (disk by prefix) | 25/25 hit | 1 m 09 s | none (save is push-only) |
| 4 | pull request, comment added to `gen/main.go` | all three (disk from main) | 20 hit, 5 executed (Go compile and link); Python, TypeScript and the test hit | 1 m 16 s | none — no cache entry was created for the PR ref |

Run 2 is the case `setup-bazel`'s own `disk-cache` gets wrong: no BUILD file changed, so its key would have been an exact hit and the new result would not have been saved.

With every action a hit, the test step still took about 35 s (`Critical Path: 0.33s`). That time is module resolution, repository extraction and analysis, not execution. `setup-bazel`'s `external-cache` input targets it; not measured.

Not verified here: the remote cache variant, macOS and Windows runners, TypeScript 7.

Re-run locally:

```
cd assets/polyglot
pnpm install --lockfile-only
bazel test //... --disk_cache=/tmp/bazel-disk
bazel clean && bazel test //... --disk_cache=/tmp/bazel-disk   # expect N disk cache hit
python3 ../../scripts/check_bazel_hygiene.py .
```
