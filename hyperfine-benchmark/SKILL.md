---
name: hyperfine-benchmark
description: Use when measuring or comparing how long a command takes — a CLI, a build, a test suite, startup time, a script — with hyperfine 2.x, including before/after comparisons of two branches, parameter scans, cold vs warm cache, peak memory and hardware counters, and regression checks in CI. Covers the 2.0 breaking changes (no shell by default, JSON schema 2, removed --reference / --sort / --time-unit, new --metrics and --env), choosing the metric that can actually show the change, controlling noise, and vetting a number before reporting it. Not for in-process microbenchmarks; use the language's benchmark harness for those.
---

# Benchmarking with hyperfine

hyperfine runs whole commands repeatedly and reports statistics. It fits anything you start from a shell and that takes at least a few milliseconds. For a function inside a process, use the language's harness (`go test -bench`, `cargo bench`, `vitest bench`, `moon bench`); process startup would dominate.

Verified with hyperfine 2.0.0 on macOS arm64 (`references/verified.md`). Check `hyperfine --version` first. If it prints 1.x, update it through whatever already manages it (package manager, Nix profile, release binary) or read `references/migration-1x.md`: commands, flags and the JSON format changed. With Nix, nixpkgs-unstable has 2.0.0 (checked 2026-11-25), but a flake lock older than that still resolves 1.x until `nix flake update nixpkgs`.

## Procedure

1. **State the claim and pick the metric that can show it.** "B is faster than A" for a user means wall-clock time; "B does less work" means `instructions`; "B uses less memory" means `memory_peak_resident`. Measured here: on an idle laptop wall time varied 9% run to run while instructions varied 0.4%; with all cores busy, wall time rose 79% for identical code and instructions rose 0.2%. A change smaller than the metric's noise cannot be seen in it.
2. **Build first, measure the artifact.** Compile both versions before benchmarking (`git worktree add ../base main && (cd ../base && make)`), so compile time is not in the numbers. Benchmark the built binaries, not `cargo run` / `go run` / `npx`.
3. **Run the comparison in one invocation, reference first.** The first command is the reference; every other result shows its change from it.

   ```sh
   hyperfine --warmup 3 --metrics time_wall_clock:ms,instructions,memory_peak_resident:MiB \
     --export-json bench.json -n base '../base/app input.txt' -n head './app input.txt'
   ```
4. **Control state between runs.** `--warmup N` for warm caches; `--prepare CMD` before every run for cold caches or resetting state; `--setup CMD` / `--cleanup CMD` once per command (switching a branch, starting a server); `--conclude CMD` after every run. These four always run in a shell.
5. **Vet the number before reporting it** (next section).
6. **Report** with `references/report.md`: command lines, hyperfine version, machine, metric, mean ± σ, change vs reference, noise, and what limits the result.

## Vet the number

Check each before you trust, report or act on a result:

- **The work happened.** Run each command once with `--show-output` and look at the output. A fast result is often an error exit, an empty input or a cache hit. Failing commands abort the benchmark unless `-i`; never keep `-i` in a reported run without saying why.
- **Noise is below the change.** Coefficient of variation (σ / mean) has to be well under the change you claim. Do not wait for a warning: hyperfine 2.0.0 printed none in a non-interactive run where one run took 20× the rest. Look for outliers yourself — mean far above median, σ larger than the typical spread, `max` far above `min` — and confirm with `advanced_statistics` (percentiles, IQR) or `plot_progression` (drift over time, e.g. thermal throttling). Then rerun on a quieter machine, raise `--runs`, or switch to a counter metric.
- **It is significant.** For two commands: `uvx --from 'git+https://github.com/sharkdp/hyperfine@v2.0.0' welch_ttest bench.json --metric <metric>`. Pin the tag; the README's unpinned form runs whatever is on master.
- **You know what limits it.** CPU bound (`time_cpu` close to wall time × threads), I/O or sleep bound (`time_cpu` far below wall time), startup bound (an empty input takes most of the time). A 2× speedup of a startup-bound command says nothing about large inputs; add a `-P` / `-L` scan over input size.
- **It is end-to-end relevant.** A faster sub-step matters only by its share of the whole task.
- **Scopes differ by platform.** On macOS, `cpu_cycles` and `instructions` exclude child processes; on Linux they include them. `memory_peak_resident` is the largest single process, not the whole tree. Hardware counters are unavailable when a shell is used (`-S`).

## Recipes

- **Branches:** `hyperfine -L branch main,feature --setup 'git switch {branch} && make' './app'` — `--setup` keeps the switch and build out of the timing. Worktrees with prebuilt binaries are safer when the build is slow or dirty state matters.
- **Scans:** `hyperfine -P threads 1 8 --env 'OMP_NUM_THREADS={threads}' './app'`, then `plot_parametrized` from the pinned scripts.
- **Shell syntax:** pipes, redirection, `&&`, globs and `~` need `-S`. Without it hyperfine 2 refuses commands containing unquoted `&&` or `>` and asks you to choose `-S` or `-N`.
- **Cold cache (Linux):** `sudo -v` then `--prepare 'sync; echo 3 | sudo tee /proc/sys/vm/drop_caches'`. macOS: `--prepare 'sudo purge'`.
- **Unique output per run:** `-S 'app > out-${HYPERFINE_ITERATION}.log'`.

## Regression checks

`scripts/compare_runs.py` reads schema-2 exports and exits 0 (no regression), 1 (regression), 2 (inconclusive: noise too large for the threshold) or 3 (bad input). With one file it compares every command with the first; with two files it matches commands by name.

```sh
python3 scripts/compare_runs.py bench.json --metric instructions --threshold 0.03
python3 scripts/compare_runs.py baseline.json candidate.json --metric time_wall_clock --threshold 0.10
```

On the measured exports above, wall time missed a real +6% instruction increase (+4.9%, inside its noise) and flagged a +64% "regression" caused only by machine load; `instructions` got both right. On shared CI runners, measure base and head in the same job, prefer `instructions` when the runner exposes counters, and use a wide wall-clock threshold otherwise. Workflow and caveats: `references/ci.md`.

## Related

- `bazel-build-cache` — measuring build-cache effects uses hit counts, not only time
- `performance-expert` — web performance (bundle size, Core Web Vitals), not command timing
