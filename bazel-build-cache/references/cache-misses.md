# Diagnosing cache misses

## 1. Count, do not guess

Run the same target twice with no changes in between, after `bazel clean` (or `--expunge` to simulate a fresh CI runner):

```
bazel test //... --disk_cache=<dir>
# INFO: 88 processes: 25 disk cache hit, 64 internal.
```

`internal` processes are Bazel bookkeeping and are never cached. Every other process should be a hit on an unchanged rebuild. Anything counted as `darwin-sandbox`, `linux-sandbox`, `processwrapper-sandbox` or `local` ran for real.

## 2. Compare action keys between two runs

```
bazel test //... --execution_log_json_file=/tmp/a.json   # run A
bazel clean --expunge
bazel test //... --execution_log_json_file=/tmp/b.json   # run B (the one that missed)
```

The JSON log is a stream of concatenated objects, one per spawn. Key each by `(mnemonic, targetLabel, listedOutputs)` and compare the `digest` field.

- **Digest differs** — the action key changed. Diff that action's `inputs` (path → `digest.hash`), `environmentVariables` and `commandArgs`. Usual causes: a tool or file that embeds a timestamp, absolute path or random value; host environment reaching the action (`--action_env`, `--incompatible_strict_action_env` turned off); a toolchain resolved differently on another OS or CPU; an undeclared input picked up because the action ran unsandboxed.
- **Digest identical, still a miss** — the key is fine; the entry was not there. Check that the run used the same `--disk_cache` directory, that the previous run actually saved (on CI: was the save step skipped by an exact key hit or a PR condition?), and that the GC size cap is not below the working set.

Observed while building the example (Bazel 9.3.3, macOS): in 3 of 13 clean rebuilds every action missed although all 25 action digests matched the runs that hit. Changing how the `--disk_cache` path was written and emptying the repository cache did not reproduce it, and the cause was not found. Treat one cold run after a setup change as possible; treat repeated misses as a bug to diagnose with step 2.

## 3. Early cutoff is the goal

A good pipeline reruns only what changed and stops when an output is byte-identical. In the example, appending a comment to `report/summarize.py` reran only the Python genrule; its output did not change, so the TypeScript stage and the test were cache hits (`4 processes: 2 action cache hit`). If a cosmetic change reruns everything downstream, an intermediate output is not deterministic — find it with step 2.

## 4. Useful queries

- `bazel aquery 'mnemonic("Genrule", //...)'` — what an action actually runs and reads
- `bazel cquery 'deps(//web:report)' --output=label_kind` — what a target pulls in under the current configuration
- `bazel mod graph` / `bazel mod explain <module>` — why a module version was selected
