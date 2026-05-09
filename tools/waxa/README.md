# @mizchi/waxa

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
# from npm (after publish)
npm i -g @mizchi/waxa

# or run from source via Deno
git clone https://github.com/mizchi/skills.git
cd skills/tools/waxa
deno task run -- ../path/to/eval.yaml
```

Requirements:

- Node.js 20+ (for the published npm CLI)
- `claude` CLI on `PATH` and authenticated (OAuth login or
  `ANTHROPIC_API_KEY`) — waxa shells out to `claude -p` for the
  bias-suppressed executor

## Quick start

```bash
# single run
waxa <path/to/eval.yaml> [--task <task-id>]

# iteration loop with cumulative ledger
waxa iterate <path/to/eval.yaml> [--max 5] [--task <task-id>]
```

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
deno task check       # type-check
deno task build:npm   # dnt → ./npm  (see Known issues)
cd npm && npm publish --access public
```

### Known issues

- `deno task build:npm` panics on `@deno/dnt@0.41.3` with `RuntimeError: unreachable` on Deno 2.6.x. Tracking; pin a working dnt version once one is identified. Until fixed, ship the package by running waxa from source (`deno task run`) or by manually invoking `tsc` against `src/cli.ts`.

## License

MIT.
