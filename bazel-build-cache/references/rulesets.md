# Ruleset notes

Versions were the latest stable, non-yanked releases on the Bazel Central Registry on 2026-11-24. Re-check before copying: `curl -fsSL https://bcr.bazel.build/modules/<name>/metadata.json`.

| Module | Version used | Notes |
|---|---|---|
| `rules_go` | 0.65.0 | `go_sdk.download(version = ...)`; no gazelle needed without external Go deps. `gazelle` stable is 0.54.0 (2.0.0 was still beta). |
| `rules_python` | 2.5.1 | `python.toolchain(python_version = "3.13", is_default = True)`; load rules from `@rules_python//python:py_binary.bzl`. |
| `aspect_rules_js` | 3.6.1 | module name is `aspect_rules_js`; a `rules_js` 4.0.0 alpha also exists. |
| `aspect_rules_ts` | 3.10.1 | `typescript.deps(version_from = "//:package.json")`. |
| `rules_shell` | 0.10.0 | `sh_test` / `sh_binary` are loaded from here, not native. |
| `buildifier_prebuilt` | 10.2.0 | dev dependency; `bazel run @buildifier_prebuilt//:buildifier -- -lint=warn -mode=check -r $PWD`. |
| `rules_rust` 0.75.0, `rules_cc` 0.2.28, `rules_oci` 2.3.5, `protobuf` 36.2 | not exercised | listed for orientation only. |

## pnpm + rules_js

- `pnpm-workspace.yaml` must declare which packages may run lifecycle scripts, even when none should: `allowBuilds: {}` (pnpm ≥ 10.26; `onlyBuiltDependencies` before that). Without it, `npm_translate_lock` fails during module extension evaluation.
- `.bazelignore` must list `node_modules`, and `npm_translate_lock(verify_node_modules_ignored = "//:.bazelignore")` checks it.
- Update the lockfile with pnpm (`pnpm install --lockfile-only`), then let Bazel re-read it. Do not hand-edit `pnpm-lock.yaml`.

## TypeScript

- A `tsconfig.json` used from another package must be a target: `ts_config(name = "tsconfig", src = "tsconfig.json", visibility = [...])` at the root, then `tsconfig = "//:tsconfig"`. Passing the file label fails with "Expected to find file tsconfig.json in //web, but instead it is in //".
- `ts_project` requires an explicit transpiler choice: `transpiler = "tsc"` per target (or a repository-wide default as described in the rules_ts transpiler docs).
- TypeScript 6 no longer includes every `@types/*` package by default. With `@types/node` as a dep, also set `"types": ["node"]` in `tsconfig.json`, or `node:fs` and `process` fail with TS2591.
- TypeScript 7 (native compiler) was not tested with rules_ts 3.10.1; the example pins 6.0.3.

## Lockfile guard

`--lockfile_mode=error` fails when a registry file is missing from `MODULE.bazel.lock` (verified by adding `rules_oci`). Adding a module that is already in the resolved graph (`bazel_skylib` here) does not change the lockfile and does not fail. Pair it with `bazel mod tidy && git diff --exit-code -- MODULE.bazel MODULE.bazel.lock` in CI.
