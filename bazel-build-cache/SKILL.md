---
name: bazel-build-cache
description: Use when deciding whether a repository should adopt Bazel, or when setting up Bazel builds and their caches locally and on GitHub Actions. Bazel fits when at least two hold — artifacts flow between languages, a full CI build takes minutes while changes touch a small part, or a shared cache or reproducibility is required. Covers that decision and when to stay with a task runner such as pkfire, a Bzlmod-only setup verified on Bazel 9, disk / repository / remote cache layers, a GitHub Actions workflow whose cache actually updates, a hygiene check that blocks sandbox and cache escapes, and cache-miss diagnosis.
---

# Bazel build cache

Bazel turns every build step into a declared action, so a change reruns only the actions whose inputs changed and identical work is shared through a cache. It also has a fixed cost: on GitHub Actions the example still spent about 35 s per run with every action a cache hit, and each ruleset brings its own setup traps. Decide before adding it, and state the decision.

## When to use Bazel

Use Bazel when **at least two** of these hold:

1. **Artifacts cross language boundaries.** One language's output is another's input: protobuf or OpenAPI code generation for several languages, data generated in Go and read by TypeScript. Several languages that merely sit side by side in one repository do not count.
2. **A full CI build takes several minutes and most changes touch a small part of it.** Rebuilding only the affected actions has to beat the fixed cost. A build that already finishes in a minute or two gains little.
3. **A shared cache or reproducibility is a requirement.** Developers and CI should share results, or builds must be hermetic.

Do not use it, even then, when:

- a language on the critical path has no maintained ruleset (MoonBit, Gleam): you would write and maintain custom rules;
- the development loop depends on a framework's own tooling (Vite, Next.js, `wrangler dev` with hot reload): that loop stays outside Bazel, so either limit Bazel to CI build and test from the start, or do not adopt it;
- the hard-to-follow part is side effects (deploys, migrations, external API calls): those cannot be Bazel actions and stay in the task runner.

When the only problem is that the pipeline is hard to follow, first make each task's dependencies, inputs and outputs explicit in pkfire, which also caches by input hash and supports a remote cache. Move to Bazel when its action-level caching, sandboxed detection of undeclared inputs, or per-package incremental builds are what is missing. A combined layout also works: Bazel owns the build and test graph, and pkfire calls `bazel` for builds alongside dev servers and deploys.

## Ground rules

These are the mistakes agents make most with Bazel. Each one breaks caching silently while the build still passes.

1. **Bzlmod only.** `MODULE.bazel`, `.bazelversion` and a committed `MODULE.bazel.lock`. Bazel 9 has no WORKSPACE support; do not write `WORKSPACE`, `http_archive` in WORKSPACE, or `*_dependencies()` macros.
2. **Look up versions; do not recall them.** Ruleset APIs change between majors (for example, rules_ts 3.x uses `typescript.deps(version_from = ...)`, not the older `ext.deps(ts_version_from = ...)`). Before writing `bazel_dep`, read the latest stable, non-yanked version from the registry:
   `curl -fsSL https://bcr.bazel.build/modules/<name>/metadata.json` (skip versions with `-` and entries in `yanked_versions`). Read that release's README for the extension API.
3. **Never buy a green build with hermeticity.** No `tags = ["no-sandbox" | "no-cache" | "local" | "no-remote"]`, no `--spawn_strategy=local`, no `--action_env=PATH`, no network calls inside a `genrule`, no `bazel clean --expunge` as a fix. When an action fails in the sandbox, it has an undeclared input or output: declare it. `scripts/check_bazel_hygiene.py` enforces this; run it in CI.
4. **Know which phase failed** before editing anything: an error during module resolution or repository fetching (`MODULE.bazel`, extensions, lockfile), analysis (`in <rule> rule //pkg:target`, attribute or provider errors), or execution (an action's command exited non-zero). Fix the file that phase reads.
5. **Prove the cache works by counting hits**, not by build time. Read the `INFO: N processes: X disk cache hit, ...` line; a cache is working only when X equals the number of cacheable actions on an unchanged rebuild.

## Setup

Start from `assets/polyglot/`, a Go → Python → TypeScript pipeline with a test, verified on Bazel 9.3.3 (see `references/verified-example.md` for versions and measurements). Copy the files you need, then:

1. `.bazelversion` — pin an exact version (`bazelisk` reads it locally and in CI).
2. `MODULE.bazel` — one `bazel_dep` per ruleset, toolchains through module extensions (`go_sdk.download`, `python.toolchain`, `npm.npm_translate_lock`, `typescript.deps`).
3. `.bazelrc` — shared settings and a `ci` config only. Cache paths are machine-local: developers set them in `~/.bazelrc` or `.bazelrc.user` (gitignored), CI sets them in the workflow.

   ```
   # ~/.bazelrc (developer machine)
   build --disk_cache=~/.cache/bazel-disk
   build --experimental_disk_cache_gc_max_size=20G
   common --repository_cache=~/.cache/bazel-repo
   ```
4. `bazel mod tidy`, then `bazel test //...`, then commit `MODULE.bazel.lock`.
5. Copy `scripts/check_bazel_hygiene.py` to `tools/` and `assets/workflows/bazel.yml` to `.github/workflows/`.

Language-specific traps hit while building the example are in `references/rulesets.md` (pnpm `allowBuilds`, `ts_config`, the required `transpiler`, `"types": ["node"]` on TypeScript 6).

## Cache layers

| Layer | Holds | Local | GitHub Actions |
|---|---|---|---|
| bazelisk | Bazel binaries | automatic | `setup-bazel` `bazelisk-cache: true` |
| repository cache | downloaded archives and fetched repo contents | `--repository_cache` | `setup-bazel` `repository-cache: true` (keyed on MODULE files) |
| disk cache | action results (AC) and outputs (CAS) | `--disk_cache` + GC size cap | `actions/cache` with a per-commit key — see below |
| remote cache | the same, shared across machines | `--remote_cache` | optional; when the 10 GB repository cache budget or cross-workflow sharing is the limit |

The disk cache is the layer that makes builds fast, and the one most often set up wrong on CI. `setup-bazel`'s own `disk-cache` option keys on the hash of `MODULE.bazel` and every `BUILD` file and skips saving on an exact hit, so a change that touches only source files never updates the cache, and misses pile up until a BUILD file changes. The bundled workflow uses `actions/cache/restore` + `actions/cache/save` with `${{ github.sha }}` in the key and prefix `restore-keys` instead, bounds the size with `build:ci --experimental_disk_cache_gc_max_size`, and runs `bazel shutdown` so the GC runs before saving. Details, the remote-cache variant and the trust boundary for pull requests: `references/github-actions.md`.

## When a cache misses

Follow `references/cache-misses.md`. In short: build twice with `--execution_log_compact_file` (or `_json_file`) and compare per-action `digest` values. A differing digest means the action key changed — diff that action's `inputs`, `environmentVariables` and `commandArgs`. An identical digest with a miss means the key is fine and the entry was not available — check the cache path, its size cap, and whether the previous run saved.

## Output

When you set up or change Bazel in a repository, report:

- which of the three conditions hold and which exclusions were checked, or why the repository stays with a task runner
- the pinned Bazel and ruleset versions and where each came from
- the hit count from an unchanged rebuild (`X disk cache hit` of `N`), measured
- hygiene check and `bazel mod tidy` diff results

## Related

- `pkfire` — task runner for repositories where Bazel does not pay for itself
- `actions-ci-tuning` — general GitHub Actions cache and parallelism tuning
- `aws-github-oidc-scoped-role` — credentials for an S3 or GCS backed remote cache
