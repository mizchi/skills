# @mizchi/waxa

[![npm version](https://img.shields.io/npm/v/@mizchi/waxa.svg)](https://www.npmjs.com/package/@mizchi/waxa)
[![license](https://img.shields.io/npm/l/@mizchi/waxa.svg)](./LICENSE)

Skill evaluation CLI. **waza-schema-compatible** runner with the
**empirical-prompt-tuning** iteration loop, structured self-report grader, and
LLM-as-Judge layered on top.

> Status: 0.x — API subject to change. Used in [mizchi/skills](https://github.com/mizchi/skills) to evaluate the agent skills published from that repo.

## Why waxa

[microsoft/waza](https://github.com/microsoft/waza) provides a clean
declarative YAML schema (`eval.yaml` + `tasks/*.yaml`) and a `text` / `code`
grader system for benchmarking agent skills. waza alone leaves the
**judgment policy layer** (how to iterate, how to recognize convergence /
divergence, how to capture the executor's *own* report on what was
ambiguous) up to the operator.

waxa keeps the same eval / task YAML schema and adds the policy layer:

- `type: self-report` grader — forces a structured tail block (`Phase trace`,
  `Unclear points` (Issue / Cause / General Fix Rule), `Discretionary
  fill-ins`, `Retries`) at the executor's output and grades it
- `type: llm` grader — LLM-as-Judge with a per-task rubric, so semantic
  equivalents (e.g. `apm view` implies `apm-usage` knowledge) aren't missed
  by surface-literal regex / code graders
- `waxa iterate` sub-command — RED/GREEN/REFACTOR loop with cumulative
  `ledger.yaml` tracking new vs reseen General Fix Rules per iteration
- Convergence detection (2 consecutive zero-unclear → stop)
- Divergence signal (3+ iterations with non-decreasing new-unclear count →
  rewrite the prompt structure rather than patch)

## Install

```bash
# run with npx (no install needed; npx caches after first call)
npx @mizchi/waxa <path/to/eval.yaml>

# pin a version when reproducibility matters
# (do NOT pin 0.1.0 — broken shebang, use 0.1.1+)
npx @mizchi/waxa@0.1.1 <path/to/eval.yaml>

# install globally if you call waxa frequently and startup latency matters
npm i -g @mizchi/waxa

# or run from source via Deno
git clone https://github.com/mizchi/skills.git
cd skills/tools/waxa
deno task run -- ../path/to/eval.yaml
```

Requirements:

- Node.js 20+ (for the published npm CLI; verified on 20+, ESM-only, built with dnt 0.42.3)
- `claude` CLI on `PATH` and authenticated (OAuth login or
  `ANTHROPIC_API_KEY`) — waxa shells out to `claude -p` for the
  bias-suppressed executor

## Quick start

```bash
# single run
npx @mizchi/waxa <path/to/eval.yaml> [--task <task-id>]

# iteration loop with cumulative ledger
npx @mizchi/waxa iterate <path/to/eval.yaml> [--max 5] [--task <task-id>]

# multi-model comparison (objective axes only — no LLM A-vs-B judge)
npx @mizchi/waxa compare <path/to/eval.yaml> --models claude-sonnet-4-6,claude-opus-4-7

# skill A/B variant exploration (e.g. current vs experimental rewrite)
npx @mizchi/waxa variant <path/to/eval.yaml> --base skill-current --candidate skill-rewritten
```

Once `npm i -g @mizchi/waxa` is done, the same commands work without the `npx @mizchi/waxa` prefix (`waxa <eval.yaml>` etc.).

To run tasks within an eval in parallel, set `config.parallel: true` and
optionally `config.workers: <N>` (default 2) in the eval file. claude
processes run concurrently — adjust `workers` to match cost / rate-limit
budget.

To average over LLM non-determinism, set `config.trials_per_task: <N>`
(default 1). Each task is invoked N times; the per-task pass rate is the
mean across trials, and the iterate ledger collects unclear points from
**all** trials — so the same `General Fix Rule` must surface in multiple
runs to count as a stable signal. N=2 is the recommended baseline; higher
N raises cost linearly.

Project layout (a working example lives in
[`mizchi/skills:evals/skill-selector/`](https://github.com/mizchi/skills/tree/main/evals/skill-selector)):

```
your-repo/
├── .waxa.yaml                       # config (.waza.yaml is also accepted)
└── evals/
    └── <skill>/
        ├── eval.yaml
        └── tasks/
            └── *.yaml
```

`.waxa.yaml` minimum:

```yaml
paths:
  skills: .          # or "skills/" if you keep skills under a sub-directory
  evals: evals/
  results: results/
defaults:
  model: claude-sonnet-4-6
  timeout: 300
```

## Tutorial: your first waxa eval

A complete walk-through that produces a working evaluation in a minute,
using a deliberately trivial skill so you can see waxa's machinery
without it being drowned out by skill content. A larger real-world
example (the `skill-selector` eval) lives in
[mizchi/skills:evals/skill-selector/](https://github.com/mizchi/skills/tree/main/evals/skill-selector).

A ready-made copy of all the files below is in
[`tools/waxa/examples/echo-skill/`](./examples/echo-skill/).

### 1. Project layout

```bash
mkdir my-eval && cd my-eval
git init
mkdir -p skills/echo-skill evals/echo-skill/tasks
```

### 2. `.waxa.yaml` (project root)

```yaml
paths:
  skills: skills/
  evals: evals/
  results: results/
defaults:
  model: claude-sonnet-4-6
  timeout: 60
```

### 3. The skill under test (`skills/echo-skill/SKILL.md`)

```markdown
---
name: echo-skill
description: Use when the user provides an arbitrary line of text and you must echo it back verbatim, prefixed with "ECHO:".
---

# echo-skill

When invoked, return the user's input verbatim with the literal prefix
`ECHO: ` and nothing else. Do not add commentary, formatting, or
clarification.
```

### 4. Eval suite (`evals/echo-skill/eval.yaml`)

```yaml
name: echo-skill-eval
skill: echo-skill
config:
  trials_per_task: 2     # average over LLM non-determinism
  timeout_seconds: 60
  parallel: false

graders:
  - name: prefix_present
    type: text
    config:
      regex_match: ["^ECHO: "]

  - name: no_extra_prose
    type: code
    config:
      assertions:
        # The reply should be a single line. Tolerate the appended
        # Self-report block by counting lines before "## Self-report".
        - "len(output.split('## Self-report')[0].trim().split('\\n')) == 1"

tasks:
  - "tasks/*.yaml"
```

### 5. A task (`evals/echo-skill/tasks/hello.yaml`)

```yaml
id: echo-hello
name: Echo a single greeting
inputs:
  prompt: |
    hello world
expected:
  output_contains: ["ECHO: hello world"]
  require_self_report: true

graders:
  - name: self_report_complete
    type: self-report
    config:
      require_all_phases_ok: true
      max_unclear: 0
```

### 6. Run

```bash
# single run (2 trials, both displayed + aggregate)
waxa evals/echo-skill/eval.yaml
```

You should see something like:

```
[1/1] Echo a single greeting
  -- trial 1/2 --
    ✓ _output_contains   ✓ prefix_present   ✓ no_extra_prose   ✓ self_report_complete
    self-report: phases=all OK, unclear=0, retries=0
    trial pass_rate=100% (3.4s)
  -- trial 2/2 --
    ...
  AGGREGATE: mean_pass_rate=100% across 2 trials, total_unclear=0
```

### 7. When the skill is wrong: iterate

Edit `SKILL.md` to make it ambiguous (e.g., remove the "no commentary"
clause), then run:

```bash
waxa iterate evals/echo-skill/eval.yaml --max 3
```

waxa will:

1. Run all trials of all tasks each iteration.
2. Aggregate executor self-reports across trials → `evals/echo-skill/ledger.yaml`.
3. Stop with `[CONVERGED]` when 2 consecutive iters have zero new
   unclear points, or `[DIVERGENCE-SIGNAL]` after 3 iters with
   non-decreasing unclear counts (= "stop patching, rewrite the
   structure").

### 8. Other workflows

- **Compare models** (objective axes only — no LLM A-vs-B):

  ```bash
  waxa compare evals/echo-skill/eval.yaml --models claude-sonnet-4-6,claude-haiku-4-5-20251001
  ```

- **A/B a candidate skill rewrite**:

  ```bash
  cp -r skills/echo-skill skills/echo-skill-v2
  # edit echo-skill-v2/SKILL.md ...
  waxa variant evals/echo-skill/eval.yaml \
    --base echo-skill --candidate echo-skill-v2
  ```

  ranks by accuracy → unclear → duration and prints a recommendation.

- **Pick one task** (any subcommand):

  ```bash
  waxa evals/echo-skill/eval.yaml --task echo-hello
  ```

## Grader types

| Type | Description |
|---|---|
| `text` | Regex match / not-match against the output. `(?i)`-style inline flags supported. |
| `code` | JS expression evaluated against `output` (string). Python-style `len(x)` and `'a' in x` are auto-translated for waza-config compatibility. |
| `self-report` | Structural assertions on the executor's appended Self-report block. Knobs: `require_present`, `require_all_phases_ok`, `max_unclear`, `max_retries`. |
| `llm` | LLM-as-Judge against a free-form `rubric`. Returns `PASS / SCORE / REASON`. Honors `model` (default: eval-level model) and optional `pass_threshold`. |

## Example

```yaml
# evals/skill-selector/eval.yaml
name: skill-selector-eval
skill: skill-selector

graders:
  - name: has_proposal
    type: code
    config:
      assertions:
        - "len(output) > 200"

tasks: ["tasks/*.yaml"]
```

```yaml
# evals/skill-selector/tasks/scenario-a.yaml
id: scenario-a
name: TS+Playwright project skill init
inputs:
  prompt: |
    pnpm + Vite + React + Playwright + GitHub Actions + Cloudflare Pages.
    What should go into apm.yml?
expected:
  output_contains: ["playwright-test", "cloudflare-deploy"]
  require_self_report: true   # default true; the executor must append a Self-report

graders:
  - name: critical_skills_semantic
    type: llm
    config:
      rubric: |
        Does the deliverable propose, by name or implication, the catalog
        rows for Playwright, Cloudflare, GitHub Actions debugging, and
        APM manifest manipulation?
  - name: self_report_complete
    type: self-report
    config:
      require_all_phases_ok: true
      max_unclear: 0
      max_retries: 2
```

```bash
waxa iterate evals/skill-selector/eval.yaml --max 3 --task scenario-a
```

The runner appends a `## Self-report` request to the prompt, captures the
executor's response, parses the structured tail, and writes
`results/<eval>-iter-N-<timestamp>.jsonl` per iteration plus
`evals/skill-selector/ledger.yaml` for cumulative pattern tracking.

## Build / publish

```bash
deno task check       # type-check the source
deno task build:npm   # dnt → ./npm (ESM-only)
cd npm && npm publish --access public
```

The npm package is ESM-only (top-level `await` in `cli.ts`). dnt's compile-time
type-check is skipped via `typeCheck: false` because the dnt shim's
`Deno.errors.NotSupported` surface still trips ts-morph; type validation is
performed by `deno task check` against the source instead.

## License

MIT.
