# Install and validate

Inspect `package.json`, the lockfile, test commands, runner config, workspace boundaries and existing CI. Run the current suite first. Choose a small module with stable, meaningful assertions for the first mutation run.

## Dependencies

Use the existing Vitest when compatible:

```sh
pnpm view @stryker-mutator/core version engines
pnpm view @stryker-mutator/vitest-runner version peerDependencies engines
pnpm add -D --save-exact @stryker-mutator/core@10.0.0 @stryker-mutator/vitest-runner@10.0.0
```

These version pins describe the checked Stryker 10 baseline, not an automatic upgrade policy. Recheck on adoption. The runner brings no Vitest; preserve an installed compatible version. For an isolated example, Vitest `4.1.10`, TypeScript `6.0.3`, and optional fast-check `4.10.2` form the baseline used to verify these assets. Stryker 10's peer range accepting a newer Vitest does not prove its changed internal APIs work.

## Copy assets

Copy `assets/stryker.config.json` to the root and all three `assets/scripts/*.mjs` files to `scripts/`. Merge `assets/package.scripts.json` into `package.json`, append the justfile recipes and gitignore snippet, then commit the lockfile with the dependency/config change.

Adapt `mutate` to production source. Use separate negative patterns for tests, declarations and generated files; the selector requires at least one positive pattern. Root-relative globs are required; keep line ranges out of this JSON config and use `--mutate 'src/file.ts:5-9'` for manual Stryker runs. In a monorepo, add workspace prefixes and select the actual test project/config. The supplied workflow assumes a root pnpm project with `packageManager` declared and a committed `pnpm-lock.yaml`.

Point `vitest.configFile` to the actual config. With Vite Plus this is usually `vite.config.ts`, importing `defineConfig` from `vite-plus`, rather than a standalone `vitest.config.ts`. Tests using API calls/dynamic loading may need `vitest.related: false`; a "no related tests" dry-run failure is a configuration problem, not a good score. Do not hide it with `allowEmpty`.

Keep `reports/mutation/` and `.stryker-tmp/` ignored. If sandbox copying is slow, exclude only directories the tests do not use; ignoring built code or assets required by tests can invalidate the run.

## Prove the integration works

```sh
pnpm test --run
pnpm test:mutation --mutate 'src/fee.ts' --dryRunOnly
pnpm test:mutation --mutate 'src/fee.ts'
pnpm test:mutation:summary
pnpm test:mutation:changed --diff-only --list
```

Adapt the normal test command to the repository (`vp test`, `vitest run`, etc.). A dry run checks integration but does not evaluate mutations. The real run should include a nonzero number of mutants and at least one demonstrated kill. Inspect unexpected `NoCoverage`, errors or unexplained timeouts before adopting the score. The optional `assets/examples/` shipping module/spec can be copied into an isolated temporary fixture for this check; install fast-check there and import the module from the correct path.

Verify CI selection with a source edit, a test-only edit and a docs-only edit. Source edits select new-side lines; test/doc-only edits return `none` with `--diff-only`. Confirm `--list` leaves the worktree unchanged. If enforcing `thresholds.break`, use a weak test fixture to verify a below-threshold run actually exits nonzero.

## CI snippet

Copy `assets/mutation-diff.yml`. It checks out the PR head, fetches full history, compares with the PR base SHA using `git merge-base`, and plans mutations **before dependency installation**. No targets means no install or Stryker run. It uses frozen pnpm installation, a pnpm store cache, concurrency cancellation, a job timeout and report upload even after failure. No dashboard token is needed.

Use the selection artifact to distinguish skipped runs from measured runs. Added/renamed files and files with line-count reductions are whole-file targets. Deletion-only PRs may have no targets; tests/config changes never cause a CI full-source fallback. Do not claim unchanged callers or dependencies were verified by a changed-line result.

For manual dispatch, provide an existing ancestor/ref; the default `HEAD~1` requires a previous commit. Invalid/missing refs fail and should be fixed by fetching history or selecting the correct base. Do not convert that error into a skip.

## Vite Plus / Vitest 5 compatibility

The working template uses Vite Plus `1.0.0`, Vitest `5.0.1`, Stryker core/runner `10.0.0` and TypeScript `6.0.3`. In that combination, Vitest 5 joins nested test names with `>` while Stryker 10 reconstructs them with a space. The observed failure was `Cannot read properties of undefined (reading 'timeout')` while mapping a covered test to a task; the version-specific patch fixes both reconstruction sites.

Only if that exact combination and failure reproduce, copy [the patch](../assets/patches/vitest-runner-10-vitest-5.patch) to `patches/vitest-runner-10-vitest-5.patch` and merge this into `pnpm-workspace.yaml`:

```yaml
patchedDependencies:
  "@stryker-mutator/vitest-runner@10.0.0": patches/vitest-runner-10-vitest-5.patch
```

Run `pnpm install`, commit its lockfile, and repeat a dry run and a real mutation run with nested `describe` tests. Preserve Vite Plus catalog/overrides and existing patches. Do not apply this patch to Vitest 4 or assume it fits newer Stryker releases. Prefer an upstream fix once the nested-test smoke passes without it.

Stryker 10 also uses TypeScript's JS compiler/config API (`parseConfigFileTextToJson`); substituting an API-incompatible native compiler package breaks startup. Keep a compatible JS `typescript` dependency for Stryker even when the project uses a separate native type-check command.

## Checked behavior

Verified on 2026-10-02 with Node.js `24.21.0`, pnpm `10.28.2`, Stryker core/runner `10.0.0`, Vitest `4.1.10`, TypeScript `6.0.3` and fast-check `4.10.2` in an isolated fixture copied from these assets:

- One weak shipping test killed 4 of 7 mutants (57.14%); the supplied boundary/PBT suite killed 7 of 7 (100%).
- A one-line source edit selected `src/shipping.ts:3-3` and killed its 4 mutants; an unchanged module was excluded and the worktree preserved.
- A weak-test diff with `thresholds.break: 100` reported 50% and exited 1, retaining a fresh plan/report. The shipped config uses a measurement-only break threshold of 0.

Helper tests cover merge-base selection, staged/unstaged/untracked source, exclusions, additions/renames/deletions, skip/failure freshness, read-only preview and score/report interpretation. These checks validate the snippets; repeat the small integration check with the target project's own configuration and versions.
