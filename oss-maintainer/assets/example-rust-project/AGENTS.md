# Working in this repository

Run `just init` from the repository root to install the external skills pinned in apm.yml and apm.lock.yaml. Follow the Release section of CONTRIBUTING.md when preparing a release.

Rust is pinned in rust-toolchain.toml, and Node.js 24+ and pnpm 12+ for the repository tooling in mise.toml; run `mise install` before anything else. Change a tool version only in those files (and pnpm also in `packageManager` in package.json), never in workflows.

Keep workspace crates under `crates/`. Run `just check` after changes. Use `just mutants` when changing tested behavior. Develop behavior changes with a failing test first. Keep local secrets in an ignored `.env` file.

## KPIs

Define this project's KPIs before building features, and replace this paragraph with them: the few numbers that decide whether a change is an improvement (for example throughput from `just bench`, binary size, peak memory, or the pass rate against an external test suite). For each, give the command that measures it, which direction is better, and the noise between two runs of the same commit. Prefer instruction counts or sizes over wall time where the machine varies. After a change that could move a KPI, measure it and append a row to `bench/kpi_log.tsv` (date, commit, change, one column per KPI). Explain any regression in the change that causes it.
