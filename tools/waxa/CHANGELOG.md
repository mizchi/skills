# Changelog

All notable changes to `@mizchi/waxa` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-05-09

Initial public release. Skill evaluation CLI with the waza eval / task
YAML schema and the empirical-prompt-tuning iteration / ledger
methodology layered on top.

### Added

- waza-schema-compatible runner. Reads `eval.yaml` + `tasks/*.yaml`,
  executes via `claude -p --system-prompt --disable-slash-commands`
  (bias-suppressed; injects the target SKILL.md into the user prompt).
- Four grader types:
  - `text` — regex match / not-match (Go-style `(?i)` inline flags
    are translated for JS).
  - `code` — JS expression with a narrow Python compat shim
    (`len()`, `'a' in x`, `'a' not in x` only).
  - `self-report` — structural assertions on the executor's appended
    Self-report block (Phase trace, Unclear points, fill-ins,
    Retries).
  - `llm` — LLM-as-Judge with a free-form `rubric`. Returns
    `PASS / SCORE / REASON`.
- `iterate` sub-command. RED/GREEN/REFACTOR loop persisted in
  `evals/<skill>/ledger.yaml`. Convergence detected at 2 consecutive
  zero-unclear iterations (state restored from ledger across
  invocations). Divergence signaled at 3+ iters with non-decreasing
  new-unclear count.
- `compare` sub-command. Runs the eval suite under N models, prints
  a table on objective axes only — no LLM A-vs-B judge (per
  empirical's pairwise-comparison caveat).
- `variant` sub-command. Skill A/B exploration ranked by
  accuracy → unclear → duration.
- `config.parallel: true` + `config.workers: <N>` for concurrent
  task execution within an eval (default workers: 2).
- `config.trials_per_task: <N>` to average over LLM non-determinism.
  Per-task pass rate is the mean across trials, the ledger collects
  unclear points from **all** trials so a rule must surface in
  multiple trials to count as a stable signal.
- `.waxa.yaml` as the primary repo-root config; `.waza.yaml` is
  accepted as fallback so waza can coexist.

### Requirements

- Node.js 20+ for the published npm CLI (ESM-only package).
- `claude` CLI on PATH and authenticated (OAuth login or
  `ANTHROPIC_API_KEY`) — waxa shells out to `claude -p` for the
  bias-suppressed executor.

### Known limitations

- Single sub-task within a multi-task eval cannot be picked when
  using `compare` — `--task` filter is shared across models. Tracked
  for 0.2.x.
- The dnt-built ESM package skips the dnt-side type check (the shim's
  `Deno.errors` surface still trips ts-morph). Source-side checking
  remains authoritative via `deno task check`.

[0.1.0]: https://github.com/mizchi/skills/releases/tag/waxa-v0.1.0
