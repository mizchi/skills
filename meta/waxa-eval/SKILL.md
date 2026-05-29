---
name: waxa-eval
description: 'Use when iterating on a skill''s prompt with the waxa CLI (https://github.com/mizchi/skills/tree/main/tools/waxa) — authoring scenarios, choosing graders, interpreting unclear-points, advancing a ledger, and judging convergence. Encodes the four-stage iteration pattern observed in real iter loops (structural fix → grader breadth → surface-form coverage → residual unclear) and the scenario-design pitfalls (blank-slate executor''s network limit, prompt expectation explicitness, regex coverage of Japanese/English surface forms). Meta-skill: do NOT auto-invoke for routine skill edits; fires only when the user explicitly runs waxa or asks for a skill-quality eval.'
---

# waxa-eval

Empirical evaluation loop for skill prompts, codified from real iter runs.
This skill is the operating manual for `waxa`; the CLI itself lives in
`tools/waxa/` (see its README for argument-level reference).

`waxa` extends [microsoft/waza](https://github.com/microsoft/waza) with
`empirical-prompt-tuning` semantics on top: forced Self-report, ledger
across iterations, four grader types, and convergence detection.

## When to invoke

Explicit user request only:

- "evaluate this skill with waxa"
- "iterate on `<skill>` until it converges"
- "add a waxa scenario for `<scenario>`"
- "interpret these unclear-points / Self-report"

When NOT to use:

- One-off skill edits (typo fix, tightening one sentence) — direct edit, no eval cycle.
- A skill is brand-new and has no scenarios yet — author the SKILL.md first; only run eval once you have a stable target to measure.
- The user did not ask for evaluation — meta-skill, no auto-invoke.

## The four-stage iteration pattern

Repeated across the `skill-selector`, `nix-setup`, and `skill-finder` evals. Treat it as the default trajectory; it converges in 3-4 iterations when the skill is structurally sound.

| Stage | What you fix | Typical Iter | Symptom of being on this stage |
|---|---|---|---|
| 1. Structural fix | A whole behavior is missing — the skill never tells the executor to do X. | 1 → 2 | LLM grader and surface graders **both** fail; pass rate jumps after one edit. |
| 2. Grader breadth | Skill is correct; surface graders are too narrow (regex only matches one phrasing). | 2 → 3 | LLM grader passes; surface grader fails on the same axis. Widen the regex; do not "force" the LLM to use one phrasing. |
| 3. Surface-form coverage | LLM uses Japanese / synonym / abbreviation that the regex didn't anticipate. | 3 → 4 | One trial passes, the other fails on the same grader. The miss is a surface form, not a content gap. |
| 4. Residual unclear | What's left is structural to the eval setup (blank-slate executor cannot run real tools), not the skill body. | terminal | Self-report flags "Execution stuck — cannot run web fetch / external command". Mark in the ledger; do not chase. |

A skill that needs more than 4 iterations probably has a deeper design issue. Re-read the skill body before adding more graders.

## Authoring scenarios (`tasks/*.yaml`)

Two roles, both mandatory:

- **Typical (median)** — the most common shape of the user request. Should pass at convergence; the gating cost is "did the skill engage at all?"
- **Edge** — a known failure mode the skill is supposed to handle. Examples: an out-of-scope request the skill should refuse, a sibling skill's territory the skill should defer to.

### Pitfall: blank-slate executor cannot run external tools

`waxa` invokes the executor with `claude -p --no-session-persistence --disable-slash-commands` and a system prompt that explicitly forbids external tools. The executor cannot run `apm view`, fetch a web URL, or list files. **State this constraint in the scenario prompt** when the workflow would otherwise require it:

```yaml
inputs:
  prompt: |
    <task description>
    Real network fetches and `apm view` calls are not available;
    narrate the workflow you would run and the candidates you would
    expect, with rubric application and waxa eval / pinning notes.
```

Without this clarification, the executor will mark the unrunnable phase as "Execution: stuck" in Self-report. That is a false signal; the skill is not the problem.

### Pitfall: prompts that don't bind expected output shape

If the prompt says "give me a list of skills" but the grader regex needs the literal token `playwright-test`, the executor may produce a synonym that satisfies the user but fails the regex. Either:

- Make the prompt enumerate what the answer must contain (less natural), or
- Pair every surface grader with a semantic LLM grader (preferred — see below).

## Grader selection

Four types. Use them in pairs.

| Type | Use for | Cost | Failure mode |
|---|---|---|---|
| `text` (regex) | Surface-literal token presence | ~free | Too narrow; misses synonyms / Japanese / abbreviation. **Default to broad alternation.** |
| `code` (JS expr) | Structural assertions on the output (line count, JSON shape) | ~free | Brittle to formatting drift; reserve for shape, not content. |
| `self-report` | Phase trace / unclear-points discipline | ~free | LLM may always self-report "OK"; pair with another grader. |
| `llm` (LLM-as-Judge) | Semantic equivalence and rubric checks | costly | Non-deterministic; check pass rate across `trials_per_task ≥ 2`. |

### Standard pair pattern

For each behavioral axis, write **two graders**:

1. A surface `text` grader with deliberately broad alternation. Goal: deterministic, fast, catches obvious misses.
2. An `llm` grader with a multi-clause rubric. Goal: catches semantic equivalents and judges nuance.

When the LLM grader passes but the surface grader fails on the same axis, **widen the surface regex** (Stage 2). Do not make the prompt force a specific phrasing — that distorts the skill's natural output.

### Regex coverage that bites in practice

- Japanese vs English: `スクレイプ` vs `scrape`, `非互換` vs `incompatible`, `信頼` vs `trust`. Always include both.
- Pinning vocabulary: `pin to a tag`, `pinned via SHA`, `resolved with apm view`, `tag-pinned`. Use a single broad alternation.
- Synonyms for "stop": `stop`, `do not adopt`, `refuse`, `reject`, `defer`, `redirect`.

A useful template:

```yaml
- name: pinning_vocab
  type: text
  config:
    regex_match:
      - "(?i)(pin(ned|ning)?\\s*(to|via|with)?\\s*(a\\s+)?(tag|sha|ref|version))|(apm\\s+view)|(adopt.*after.*eval)"
```

## Self-report — what to read for

Each trial appends a structured Self-report block. Read these fields:

- **Phase trace** — `Understanding / Planning / Execution / Formatting`. A "stuck" entry is a triage signal: was the prompt unclear, or is the skill missing instruction for that phase?
- **Unclear points** — most useful diagnostic. Each has `Issue / Cause / General Fix Rule`. The Rule is what you commit to the ledger.
- **Discretionary fill-ins** — places the executor improvised. Each one is a candidate for "the skill should specify this".
- **Retries** — should be 0 in a healthy run. > 0 = the skill required clarification mid-task.

A clean run has all phases OK, unclear=0, fill-ins=(none), retries=0. The next reasonable goal after unclear=0 is unclear=0 again — convergence is two consecutive runs at this state.

## Ledger pattern (`evals/<skill>/ledger.yaml`)

One entry per iteration. Schema (working fields only):

```yaml
iterations:
  - id: iter-N
    date: YYYY-MM-DD
    scope: <full or per-task>
    overall_pass_rate: <number>
    per_task: [...]
    unclear_points:
      - issue: ...
        cause: ...
        general_fix_rule: ...        # this is the durable artifact
    actions:
      - <one-line summary of the change made>

convergence:
  status: <converging | near_convergence | converged>
  rationale: |
    <why you stopped — be specific about what residuals remain>
```

### Extracting a General Fix Rule

When you see an unclear-point, ask: *what class of mistake produced this?* Not "this exact thing went wrong" — *what shape of error would always produce this kind of failure?* The class-level rule is what generalizes; the trace is just the example.

```
Issue:    "skill never told executor to stop when catalog has a fit"
Cause:    "When NOT to use" stated alternative but didn't enforce halt
General Fix Rule:
  Meta-skills that delegate to a sibling must add a mandatory
  pre-flight check that explicitly halts the workflow (not merely
  advises an alternative).
```

The rule is reusable across skills. Future evals that hit a similar shape should refer back to existing rules instead of re-discovering.

## Convergence

`empirical-prompt-tuning` defines convergence as **two consecutive runs with zero unclear-points**. In practice:

- A residual unclear-point that is structural to the eval setup (e.g., "cannot fetch URLs") does not block convergence. Note it in the ledger and exclude from the convergence count.
- A residual that is non-deterministic (one trial flags it, the next does not) is a soft signal. If the skill is otherwise stable and the unclear is below the action threshold, declare convergence.
- A residual that is **deterministic and content-related** must be addressed before declaring convergence — this is Stage 1 work, not closure.

Mark the ledger:

```yaml
convergence:
  status: converged
  rationale: |
    Iter 1 (X%) → Iter 2 (Y%) → ... → Iter N (Z%).
    Residual <name> is <reason it does not block adoption>.
```

## Test layout convention

From waxa 0.2.0, eval files live **inside the skill directory**, mirroring [agentskills.io's evaluating-skills layout](https://agentskills.io/skill-creation/evaluating-skills). This lets a single skill repo carry its own eval suite and ship as a self-contained unit:

```
<skill>/                                # the target skill (distribution unit)
├── SKILL.md
└── evals/
    ├── eval.yaml                       # config + top-level graders + task glob
    ├── ledger.yaml                     # iter history (created on first `iterate` run)
    └── tasks/
        ├── scenario-typical.yaml       # median — passes at convergence
        └── scenario-edge.yaml          # known failure mode — exercises the rule
```

Workspace (per-iteration runs) lands outside the skill at `<workspace-root>/results/<skill>/iteration-N/<task-id>/<with_skill|without_skill>/{output-trial-*.txt, timing.json, grading.json}` plus `benchmark.json`. `<workspace-root>` is the `.waxa.yaml` / `.waza.yaml` directory when present, otherwise the skill directory's parent. Add `results/` to `.gitignore`.

`waxa init` scaffolds eval.yaml and the two task templates with TODO markers; ledger.yaml is generated when iteration starts.

The pre-0.2.0 monorepo layout (`<repo-root>/evals/<skill>/eval.yaml` + `<repo-root>/<skill>/SKILL.md`) is still auto-detected, so old evals keep working; new ones should use skill-local.

## Running the loop

Bare minimum:

```bash
# Scaffold the eval skeleton (run inside the skill's own dir).
npx @mizchi/waxa init [--skill <name>] [--force]

# Single eval pass.
npx @mizchi/waxa <skill>/evals/eval.yaml

# Single task.
npx @mizchi/waxa <skill>/evals/eval.yaml --task <task-id>

# Single eval with baseline (with_skill vs without_skill, reports Delta).
npx @mizchi/waxa <skill>/evals/eval.yaml --baseline

# Iteration loop (auto re-runs while pass rate improves; writes ledger.yaml).
npx @mizchi/waxa iterate <skill>/evals/eval.yaml --max 4

# Audit a skill directory (apm audit hidden-Unicode scan + waxa native
# quality checks: frontmatter, body length, When-NOT-to-use, suspicious
# scripts, LICENSE).
npx @mizchi/waxa audit <skill>/ [--no-apm] [--json]
```

The npm package bundles `references/empirical-prompt-tuning.md` so the methodology is on disk wherever waxa is installed. After `npx @mizchi/waxa` first runs, the file lives at `<node_modules>/@mizchi/waxa/references/empirical-prompt-tuning.md`.

### `--baseline` — is the skill earning its keep?

`--baseline` runs every task twice per trial (with_skill and without_skill), then prints a Delta line and writes both configs into `iteration-N/<task-id>/`. This is the agentskills.io-style "does the skill body actually improve over a blank-slate model?" check. Skills that add tokens / latency without moving pass rate are visible here in a way they aren't in single-config runs.

Per-iteration cost (claude-opus-4-8, 3 scenarios × 2 trials): ~3-5 minutes wall time. Run iterations sequentially; do not launch parallel `waxa` processes against the same eval (they fight for the API and the lockfile). Single-task runs (`--task <id>`) are useful for confirming a small change without re-running the whole suite.

`trials_per_task: 2` is the floor — a single trial cannot distinguish "the skill is unstable" from "the LLM had a bad sample." Bump to 3 only if you suspect non-determinism on a critical axis.

## Common pitfalls

| Mistake | Fix |
|---|---|
| Re-running iterations without editing the skill | If the skill body did not change, the result is just a different LLM sample. Edit before re-running. |
| Using only LLM graders | They are non-deterministic and slow. Pair with surface graders. |
| Adding graders after every failure | Graders are not the safety net; the skill is. Add a grader only when an unmeasured behavior matters. |
| Treating `executor: mock` as real | The current `tools/waxa/src/cli.ts` ignores the field; all runs go through `claude -p`. Plan budget accordingly. |
| Iterating past 4 without re-reading the skill | If you're past iter 4 and still chasing failures, the skill body has a structural gap. Stop iterating; rewrite the section. |
| Not committing the ledger | The ledger is the durable artifact. Future evals build on past General Fix Rules. Lose it and you lose the institutional memory. |

## Scope vs `empirical-prompt-tuning`

This skill is the **implementation guide**; `empirical-prompt-tuning` is the **methodology**. They are complementary — neither subsumes the other, because the dispatch mechanisms differ (Task-tool subagent vs external CLI process).

| Concern | waxa-eval | empirical-prompt-tuning |
|---|---|---|
| Methodology / first principles (bias-free executor, Self-report rationale) | (referenced) | **owns** |
| CLI operation (`waxa run` / `iterate` / `variant` / `compare`) | **owns** | n/a |
| Scenario YAML authoring | **owns** | n/a |
| Grader selection (text / code / self-report / llm) | **owns** | n/a |
| Iter pattern derived from real iter loops (4-stage signature) | **owns** | n/a |
| Ledger schema (`ledger.yaml`) and General Fix Rule extraction | **owns** | shared |
| Convergence definition (2 consecutive zero-unclear) | shared | **owns the canonical version** |
| Iter 0 description / body consistency check (static, no dispatch) | n/a | **owns** |
| `tool_uses` relative-value analysis (only possible via Task-tool subagent) | n/a | **owns** |
| `[critical]` tag in the requirements checklist | n/a | **owns** |
| Fix-propagation patterns (conservative / overshoot / zero-shoot) | n/a | **owns** |
| Pairwise-comparison caveats (counterbalance ordering) | (referenced) | **owns** |
| Structural review mode (text consistency only, not execution) | n/a | **owns** |
| Environment constraints (Task tool unavailable in current session) | n/a | **owns** |
| Red-flag table (self-reread rationalization, etc.) | n/a | **owns** |

**Use `empirical-prompt-tuning` when:** evaluating inside a Claude Code session via Task-tool subagent dispatch; needing `tool_uses` measurement of the executor; running the Iter 0 static consistency check; writing the `[critical]`-tagged requirements checklist.

**Use `waxa-eval` (this skill) when:** running the eval as an external CLI process; persisting iteration history as YAML for repeatability or CI; encoding scenarios that re-run after every skill edit; gating an external skill candidate before adoption (cf. `skill-finder`).

A real flow often uses both: `empirical` for the in-session Iter 0 + first dispatch to confirm direction, then `waxa-eval` for the iter loop and durable ledger.

## Related

- `empirical-prompt-tuning` — methodology this skill operationalizes; see scope table above for responsibility split
- `superpowers:writing-skills` — TDD framing for skills; pairs with this skill (write skill → eval → iterate)
- `skill-finder` — uses waxa-eval as the adoption gate for cross-source candidates
- `tools/waxa/README.md` — CLI argument reference
- `tools/waxa/RFC-waza.md` — upstream waza compatibility notes
