# Changelog

All notable changes to `@mizchi/waxa` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-11

Layout shift to align with [agentskills.io's eval-driven iteration](https://agentskills.io/skill-creation/evaluating-skills) (skill-local evals, baseline comparison, iteration-N workspace).

### Breaking

- **eval files now live inside the skill directory** (`<skill>/evals/eval.yaml`)
  instead of at the repo root (`<repo-root>/evals/<skill>/eval.yaml`).
  The runner auto-detects skill-local layout when the eval.yaml's parent
  directory is named `evals` and `../SKILL.md` exists. Monorepo legacy
  layout (`<repo-root>/evals/<skill>/`) still resolves via
  `.waxa.yaml` / `.waza.yaml` lookup, but new evals should use
  skill-local.
- **`waxa init` now scaffolds into `<cwd>/evals/`** (skill-local) instead
  of `<repo-root>/evals/<skill>/`. Run it from inside the skill's
  directory; the skill name is inferred from the basename of cwd.
- **`results/` layout completely changed** from one JSONL file per run to
  a `results/<skill>/iteration-N/<task-id>/<config>/` directory tree.
  Old `<repo-root>/results/*.jsonl` files are no longer produced and
  should be deleted manually. Per-run artifacts:
  - `output-trial-<n>.txt` — raw executor output, one file per trial
  - `timing.json` — per-trial and aggregate duration
  - `grading.json` — assertion-style results with evidence

### Added

- **`waxa <eval.yaml> --baseline`**: runs each scenario twice per trial —
  once with the skill body injected (`with_skill/`), once without
  (`without_skill/`). Reports a Delta line at the end of the run so
  you can see how much pass-rate the skill actually buys. Adapted from
  agentskills.io's with-skill / without-skill comparison.
- **`iteration-N/benchmark.json`**: aggregated statistics per iteration
  (mean + stddev for pass rate and duration_ms, plus delta vs baseline
  when `--baseline` was used).
- **Layout detection**: `resolveLayout()` picks skill-local or
  monorepo-legacy based on file system state, so existing evals continue
  to run during the migration period.

### Notes

- `--baseline` forces serial execution; parallel + baseline is a future
  optimization.
- Token capture is still best-effort (claude CLI's plain-text output
  doesn't expose it); only `duration_ms` is reliable in `timing.json`.

## [0.1.2] - 2026-05-11

### Added

- `waxa init [--skill <name>] [--force]` sub-command: scaffolds
  `evals/<skill>/eval.yaml` plus `tasks/scenario-typical.yaml` and
  `tasks/scenario-edge.yaml` with TODO-marked templates. Skill name
  defaults to the basename of the current directory; pass `--skill` to
  override. Existing files are skipped unless `--force` is given.
  Resolves the repo root via `.waxa.yaml` / `.waza.yaml` (same
  lookup as the run sub-commands).
- npm package now bundles `references/empirical-prompt-tuning.md` (the
  full methodology SKILL.md), so `npx @mizchi/waxa` users get the
  iter / convergence / Self-report semantics on disk alongside the CLI
  without needing to clone mizchi/skills separately.

## [0.1.1] - 2026-05-10

### Fixed

- Broken shebang in the published npm bundle: dnt's bin-entry pass
  injects `#!/usr/bin/env node` at line 1, but the source file's own
  Deno shebang (`#!/usr/bin/env -S deno run -A`) survived TypeScript
  transformation and reappeared at line 4 as malformed JavaScript
  (`!/usr/bin / env - S; deno; run - A;`), causing `npx @mizchi/waxa`
  to crash before parsing argv. Removed the source-side shebang;
  `deno task run` and `deno run -A src/cli.ts` continue to work.

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
