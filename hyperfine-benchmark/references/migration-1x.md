# Migrating from hyperfine 1.x to 2.0

From the v2.0.0 release notes (2026-10-07) and checked against the 2.0.0 binary.

| 1.x | 2.0 | Notes |
|---|---|---|
| commands run through `sh -c` | run directly (`--shell=none`) | Use `-S` (`--shell=default`) for pipes, `&&`, redirection, globs, `~`, `$VAR`. Unquoted `&&` / `>` without `-S` or `-N` is an error that names both options. |
| shell spawn time subtracted | no shell, nothing to subtract | Fast commands (< 5 ms) become more accurate. |
| `--setup` / `--prepare` / `--conclude` / `--cleanup` honoured `-N` | always run in a shell | The shell selected by `--shell`, or `sh` / `cmd.exe` when none. |
| `--reference CMD` | removed | Put the reference command first. Passing `--reference` prints that instruction. |
| `--sort` | removed | Output follows input order. |
| `-u` / `--time-unit ms` | removed | `--metrics time_wall_clock:ms`. |
| wall time + user/system only | `--metrics`: `time_wall_clock`, `time_user`, `time_system`, `time_cpu`, `memory_peak_resident`, `cpu_cycles`, `instructions`, `cache_references`, `cache_misses`, `branch_misses`; presets `default`, `time`, `all` | Default display: wall time and peak memory. Counters need no shell. `cache_*` and `branch_misses` are Linux only; memory and counters are not on Windows. |
| env only through the shell | `--env 'K=V K2="a b"'`, once for all or once per command, may contain `{param}` | Exported JSON records it under `environment`. |
| JSON `results[i].mean`, `.stddev`, `.times`, `.exit_codes` | schema 2: `results[i].summary.<metric>.{mean,stddev,median,min,max,count,unit}` and `results[i].measurements[j].<metric>.value`, plus `schema_version`, `primary_metric`, `metadata` | Times in seconds, memory in bytes; counters have no `unit`; `stddev` is `null` for one run. Parameters are `{"name": {"value": "..."}}`. |
| Markdown export of all times | primary metric only (first in `--metrics`), with `Change` and `Factor` columns | CSV has `<metric>_unit/_mean/_stddev/_median/_min/_max` for every selected metric. |
| `scripts/*.py` run from a checkout | `uvx --from 'git+https://github.com/sharkdp/hyperfine@v2.0.0' <script>` | Scripts read schema 2 and take `--metric`. Pin the tag. |

Code that parses exports must check `schema_version == 2`; `scripts/compare_runs.py` refuses other versions with exit 3.
