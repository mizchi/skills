# Verification

hyperfine 2.0.0 release binary (`hyperfine-v2.0.0-aarch64-apple-darwin.tar.gz`, SHA-256 `590b839c…dea81e`), macOS arm64, 2026-11-25.

| Check | Command | Result |
|---|---|---|
| Unquoted shell operator without `-S` | `hyperfine 'echo a && echo b'` | error naming `-S / --shell=default` and `-N / --shell=none` |
| Removed `--reference` | `hyperfine --reference 'sleep 0.01' ...` | "The --reference option has been removed. Put your reference command first instead." |
| Hardware counters on macOS | `--metrics time_wall_clock:ms,instructions,cpu_cycles,memory_peak_resident:MiB` | all four reported; `sleep 0.01` vs `python3 -c pass`: wall +13.9%, instructions 21.2x |
| JSON schema | `--export-json` | `schema_version: 2`, `primary_metric`, `metadata.{hyperfine_version,start_time,platform}`, `results[].{command,measurements,summary}` |
| `--env` with `-P` | `-P n 1 3 --env 'N={n}' -S 'test "$N" -ge 1'` | three benchmarks; JSON `environment: {"N": "1"}`, `parameters: {"n": {"value": "1"}}` |
| Markdown export | `--export-markdown -` | columns `Command`, `Mean Wall Time [ms]`, `Change`, `Factor` |
| Failing command | `hyperfine false` | stops in the first run and suggests `-i` / `--show-output`; with `-i` prints "Warning: Ignoring non-zero exit code." |
| Outlier warning | 30 runs, run 5 sleeps 0.5 s instead of 0.02 s | no warning printed (non-interactive, `--style basic` and `full`); `advanced_statistics`: mean 0.042 s, median 0.026 s, IQR 0.001 s |
| Duplicate metric | `--metrics time_wall_clock,time_wall_clock` | "Metric 'time_wall_clock' was selected more than once" |
| Counters with a shell | `--metrics instructions -S true` | "Metric 'instructions' is unavailable when a shell is enabled" |
| Pinned analysis scripts | `uvx --from 'git+https://github.com/sharkdp/hyperfine@v2.0.0' welch_ttest two.json [--metric instructions]` | runs on schema 2; wall p = 0.0084, instructions p = 3.4e-23 for the same pair |

## Noise: wall time vs instructions

`python3 -c "sum(range(3_000_000))"`, 20 runs, 3 warmups. "Loaded" ran one `yes > /dev/null` per core during the benchmark.

| Condition | wall mean | wall σ/mean | instructions mean | instructions σ/mean |
|---|---:|---:|---:|---:|
| idle | 31.4 ms | 9.0% | 635.6 M | 0.44% |
| loaded | 56.1 ms | 28.5% | 636.6 M | 0.54% |

`compare_runs.py` on the same exports:

| Comparison | wall time verdict | instructions verdict |
|---|---|---|
| `sum(range(2_000_000))` vs `2_200_000` (more work) | ok, +4.9% (noise 4.3%) — missed | regression, +6.3% (noise 0.2%) |
| idle vs loaded, identical code | regression, +64.3% — false alarm | ok, +0.1% |

Not verified: Linux and Windows hosts, GitHub-hosted runners (counter availability), `cache_*` and `branch_misses` (Linux only).
