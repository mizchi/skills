# GitHub Actions caching for Bazel

The bundled workflow is `assets/workflows/bazel.yml`. Action versions and runtimes were checked on 2026-11-24: `actions/checkout` v7.0.1, `bazel-contrib/setup-bazel` 0.19.2, `actions/cache` v6.1.0 (including `restore/` and `save/`) all declare `runs.using: node24`. Pin by SHA and re-check `action.yml` before bumping.

## Why not `setup-bazel`'s `disk-cache`

From `setup-bazel` 0.19.2 source (`config.js`, `index.js`, `post.js`):

- disk cache key = `setup-bazel-<version>-<os>-<arch>-disk[-<name>]-<hashFiles(MODULE.bazel, MODULE.bazel.lock, WORKSPACE*, **/BUILD.bazel, **/BUILD)>`
- restore uses the key prefix as a fallback; on an **exact** key hit it records `cache-hit=true`
- the post step returns early when `cache-hit=true`, so nothing is saved

A commit that edits only `.go`, `.py` or `.ts` files keeps the same key, restores the old snapshot, rebuilds the changed actions, and throws the new results away. The cache stays frozen at the last BUILD-file change. Keep `setup-bazel` for `bazelisk-cache` and `repository-cache`, whose inputs really are the MODULE files, and manage the disk cache with `actions/cache`.

## Disk cache with `actions/cache`

```yaml
- uses: actions/cache/restore@<sha> # v6.1.0
  with:
    path: ${{ runner.temp }}/bazel-disk
    key: bazel-disk-${{ runner.os }}-${{ hashFiles('.bazelversion') }}-${{ github.sha }}
    restore-keys: |
      bazel-disk-${{ runner.os }}-${{ hashFiles('.bazelversion') }}-
      bazel-disk-${{ runner.os }}-
# ... bazel test //... --config=ci
- run: bazel shutdown
  if: always()
- if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  uses: actions/cache/save@<sha> # v6.1.0
  with:
    path: ${{ runner.temp }}/bazel-disk
    key: bazel-disk-${{ runner.os }}-${{ hashFiles('.bazelversion') }}-${{ github.sha }}
```

- **Per-commit key.** Every main build saves a new entry; `restore-keys` returns the most recent one with the prefix. Old entries age out under GitHub's per-repository cache limit (10 GB by default, least recently used evicted first).
- **Bounded size.** `build:ci --experimental_disk_cache_gc_max_size=2G` plus `--experimental_disk_cache_gc_idle_delay=0s`. Measured on Bazel 9.3.3: with `idle_delay=0s` a 297 MB cache was trimmed to the 100 MB cap at `bazel shutdown`; with the default 5 m delay, shutdown did not trim. So the CI config needs both flags and the workflow needs the `bazel shutdown` step before saving.
- **`.bazelversion` in the key.** A new Bazel version starts from the version-less prefix; stale entries do no harm (keys are content-addressed) and the GC trims them.
- **Path.** `--disk_cache` is set through `setup-bazel`'s `bazelrc` input, which writes `~/.bazelrc`. Bazel reads the user rc after the workspace `.bazelrc`, so do not set `--disk_cache` in the workspace `.bazelrc`.

## Trust boundary

- Pull requests restore and never save (`cache-save: ${{ github.event_name == 'push' }}` for `setup-bazel`, the `if:` on `actions/cache/save`). A PR from a fork cannot write an action result that main later trusts.
- `permissions: contents: read` is enough for caching.
- Do not use `pull_request_target` to get secrets for a remote cache into fork PRs.

## Remote cache variant

Use a remote cache when several workflows or developers should share results, or the 10 GB budget evicts too early. Bazel speaks gRPC (`grpc://`, `grpcs://`) and HTTP (`http://`, `https://`) cache protocols; self-hosted servers (for example `bazel-remote`) and managed services both work.

```
# .bazelrc
build:remote-cache --remote_cache=grpcs://cache.example.com
build:remote-cache --remote_download_toplevel
build:remote-cache --remote_cache_compression
build:remote-cache-readonly --config=remote-cache
build:remote-cache-readonly --remote_upload_local_results=false
```

```yaml
- uses: bazel-contrib/setup-bazel@<sha> # 0.19.2
  with:
    bazelrc: |
      build --remote_header=authorization=Bearer ${{ secrets.BAZEL_CACHE_TOKEN }}
- run: bazel test //... --config=ci --config=${{ github.event_name == 'push' && 'remote-cache' || 'remote-cache-readonly' }}
```

- main uploads, pull requests read only; fork PRs have no secret and fall back to the disk cache.
- Secrets go through `setup-bazel`'s `bazelrc` input (written to `~/.bazelrc`), never into the workspace `.bazelrc` or a command line that is echoed.
- For a GCS bucket, `setup-bazel` has a `google-credentials` input; for S3 or GCS behind OIDC, see `aws-github-oidc-scoped-role`.

The disk cache workflow above was run on GitHub Actions; results per run are in `verified-example.md`. The remote-cache variant was not run.
