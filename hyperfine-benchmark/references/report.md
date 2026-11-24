# Reporting a benchmark

A result is reproducible only with its conditions. Report:

```markdown
**Claim:** head is 1.6x faster than base for `<task>` (wall time).

| Command | Mean wall time | Change | Instructions | Peak memory |
|---|---:|---:|---:|---:|
| base `../base/app input.txt` | 2.275 s ± 0.046 | | 9.1 B | 210 MiB |
| head `./app input.txt` | 1.427 s ± 0.026 | -37.3% | 5.8 B | 190 MiB |

- hyperfine 2.0.0, `--warmup 3`, 30 runs each, export: `bench.json`
- Machine: <CPU, cores, RAM, OS>, on AC power, other apps closed
- Noise: σ/mean 2.0% / 1.8%; Welch t-test p < 0.001 (`welch_ttest --metric time_wall_clock`)
- Limit: CPU bound (time_cpu ≈ wall time); input 120 MB; startup is < 1% of the run
- Not measured: cold cache, inputs below 1 MB
```

Rules:

- Lead with the claim and the metric that supports it.
- Give mean ± σ with units and the run count. Do not round a change smaller than its noise into a win.
- Label every number measured, inferred or guessed. A number from another machine or an earlier run is not comparable.
- Say what limits the result and what was not measured.
- Keep the JSON export next to the report, or in the PR, so the numbers can be re-analysed.
