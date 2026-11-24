# Benchmark regressions in CI

Shared CI runners are noisy, and two jobs may land on different hardware. Rules:

1. **Measure base and head in the same job**, one hyperfine invocation, base first. Never compare against a number stored from an earlier run on another machine.
2. **Judge on a counter metric when available.** `instructions` changed by 0.2% under a load that moved wall time by 79% on the verification machine. Hardware counters depend on the runner exposing performance events (Linux `perf_event_open`); virtual machines often do not. Probe first and fall back.
3. **Use a wide threshold for wall time** (10% or more on hosted runners) and treat exit code 2 (inconclusive) as "measure again on a quieter machine", not as a pass.
4. **Report, do not only gate.** Post the Markdown export to the job summary so a reviewer sees the numbers.

## Workflow sketch

Not run on GitHub Actions yet; whether hosted runners expose `instructions` is unverified. The hyperfine tarball has no published checksum, so the SHA-256 below was computed from the v2.0.0 release asset on 2026-11-25.

```yaml
name: bench
on: pull_request
permissions:
  contents: read
jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
      - name: Install hyperfine 2.0.0
        run: |
          curl -fsSLo hf.tgz https://github.com/sharkdp/hyperfine/releases/download/v2.0.0/hyperfine-v2.0.0-x86_64-unknown-linux-gnu.tar.gz
          echo "ae2beda2ac99c098427e4f755244552daf20e514422889cca6d44421e2d93c87  hf.tgz" | sha256sum -c -
          tar xzf hf.tgz
          echo "$PWD/hyperfine-v2.0.0-x86_64-unknown-linux-gnu" >> "$GITHUB_PATH"
      - name: Build base and head
        run: |
          git worktree add ../base "${{ github.event.pull_request.base.sha }}"
          (cd ../base && make build)   # replace with the project's build
          make build
      - name: Pick metric
        id: metric
        run: |
          # Counters need a direct command (no -S); with a shell hyperfine reports them unavailable.
          if hyperfine --runs 2 --metrics instructions --style none true >/dev/null 2>&1; then
            echo "name=instructions" >> "$GITHUB_OUTPUT"; echo "threshold=0.03" >> "$GITHUB_OUTPUT"
            echo "metrics=time_wall_clock,instructions" >> "$GITHUB_OUTPUT"
          else
            echo "name=time_wall_clock" >> "$GITHUB_OUTPUT"; echo "threshold=0.15" >> "$GITHUB_OUTPUT"
            echo "metrics=time_wall_clock" >> "$GITHUB_OUTPUT"
          fi
      - name: Benchmark
        run: |
          # A metric may appear only once in --metrics; hyperfine rejects duplicates.
          hyperfine --warmup 3 --runs 20 --metrics ${{ steps.metric.outputs.metrics }} \
            --export-json bench.json --export-markdown bench.md \
            -n base '../base/bin/app fixtures/input' -n head './bin/app fixtures/input'
          cat bench.md >> "$GITHUB_STEP_SUMMARY"
      - name: Compare
        run: python3 tools/compare_runs.py bench.json --metric ${{ steps.metric.outputs.name }} --threshold ${{ steps.metric.outputs.threshold }}
```

Copy `scripts/compare_runs.py` to `tools/` in the project. Exit 2 fails the step too; if inconclusive results should not block merges, add `|| [ $? -eq 2 ]` and say so in the job summary.

Before checking a probe in, verify that the probe's failure mode is "metric unavailable" and not a typo: run it once locally where counters work and confirm it succeeds.
