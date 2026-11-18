---
name: blind-api-eval
description: Evaluate and improve API, library, CLI or DSL usability through fresh subagents performing real consumer tasks, independent rubric grading and repeated improvement trials. Use when validating an interface design or investigating why consumers misuse it; ordinary implementation correctness remains covered by project tests.
---

# Blind API evaluation

Improve the interface that a consumer encounters: exported API, types, documentation,
examples, diagnostics and packaging. Have a fresh agent actually use it, preserve
the attempt, grade observable results, then change the interface and repeat.
The optimization target is the library and its public surface; the consumer model
and task instructions stay fixed during a comparison.

This combines API usability evaluation, agent-computer interface design,
LLM-as-a-Judge and reflective optimization. It is an engineering protocol, not
a claim to implement GEPA, TextGrad or reinforcement learning. Read
[research and terminology](references/research.md) when naming the method or
explaining its limits.

For a grading-only or planning-only request, perform that phase using the supplied
evidence and respect its budget; do not silently start a full experiment. Label
the narrower result so it cannot be mistaken for new empirical execution.

## Freeze the experiment before running it

Inspect the public exports, package artifact, docs, supported runtime and existing
tests. Reconcile the claimed public contract with what actually ships. Freeze:

- A current-version baseline and a candidate revision, with artifact hashes.
- Two or three realistic tasks: an ordinary use, composition, and recovery from a
  documented invalid input. Describe outcomes rather than the intended call sequence.
- A private rubric with concrete 0/1/2 anchors, positive weights and at least one
  critical criterion. Critical partial credit is a failure. Freeze acceptance
  thresholds and the number of fresh trials before seeing outputs.
- Executable correctness checks, including an independent expected result and
  evidence that the submitted program actually uses the target package.
- A separate holdout task or family, budgets and permitted changes. Holdout answers,
  checks and results stay outside consumer access and outside the optimization loop.

Start with two fresh trials per task and a bounded iteration budget when the user
has not specified one. Scale to the cost and importance; record reduced coverage.
These defaults are operational choices, not statistical confidence guarantees.

Use [the protocol](references/protocol.md) for isolation, grading and stopping
details. The [rubric example](assets/rubric.example.json) can be adapted before the
first trial. Keep the public task and private rubric in separate files.

## Keep the consumer blind

Spawn a new executor for every task, trial and revision. In Codex, use
`fork_turns: "none"`; a fresh name with inherited history is not blank-slate.
In other hosts, use the equivalent clean session with no conversation history.

Give it only a staged consumer workspace, normal public docs/types, an installed
package, the task outcome and allowed tools/budget. Use the
[executor prompt](assets/executor-prompt.md), filling its variables. Do not pass
this skill, the private rubric, author reasoning, suspected defects, reference
solutions, previous attempts, the ledger or which candidate should win.

Use an immutable packaged artifact rather than a workspace link into the source
checkout. Keep generated consumer code in its own writable directory. Tests,
oracle, build sources and implementation edits belong to the controller.
For a service, use a local fixture or test endpoint with the same public contract.

Fresh context does not isolate a shared filesystem. Enforce the file boundary
with a sandbox/container when available; otherwise declare **procedural blinding**,
provide an explicit read allowlist and audit the trace. Do not claim enforcement
that the tools do not provide. Exposure to private material invalidates a trial.
Normal compiler/runtime diagnostics, including automatic stack snippets, are
permitted interface feedback; do not open implementation files to investigate them.

The executor writes and runs a consumer, records commands and diagnostics, and
returns artifacts plus a short report of unclear points, assumptions and retries.
Separate deliberate Red/Green test runs from retries caused by interface uncertainty.
It may revise its consumer inside the trial budget. Do not coach it mid-trial or
let it patch the library. A clarification changes the intervention: log it and
start a new trial if it supplies information absent from the original public surface.

## Judge evidence, then fix one cause

Run the private checks yourself against the preserved consumer. Grade functional
correctness from their actual exit status/output, not an agent's claim of success.
Ask a separate fresh judge to apply the frozen rubric to anonymized public
materials, artifact and command trace; use the
[judge prompt](assets/judge-prompt.md). Keep executor self-report as diagnostic
evidence, not the final grade. Require evidence locations for every score.
Remove version labels from copied trace paths and report headers as well as the
judge workspace name. Preserve unredacted originals; if labels leak, replace the
judgment with one from a fresh judge using sanitized evidence.

For deterministic scoring, adapt the
[trial example](assets/trial.example.json), then run:

```sh
node /path/to/blind-api-eval/scripts/score-trial.mjs rubric.json trial.json
```

Node.js 24+; no dependencies. Exit 0 means all critical criteria and the oracle
pass, 1 means a measured failure, and 2 means an unassessed or malformed trial.
The helper checks arithmetic and the record contract; it does not authenticate
evidence, run the oracle or apply project-specific quality thresholds. Check
those thresholds before promoting a candidate.

Record each attempt in `evals/<target>/ledger.json` with task/trial IDs, revision
and artifact hash, model/harness/settings, exposure status, oracle results, rubric
scores and evidence paths. Record unavailable time/token/tool metadata as null.
Store raw traces in ignored `results/` or an external artifact directory.

Classify a failure before changing anything: package/setup defect, API/type
design, discoverability/docs, error recovery, executor capability, or harness
failure. Tooling restrictions are harness failures; broken installation in the
supported consumer environment is a product failure. Keep failures in the
denominator. Report blocked/contaminated counts separately and replace them with
valid trials rather than treating exclusions as successes.

For each proposed fix, state the failed rubric anchor, observed evidence, the
causal hypothesis and the smallest change that should help. Add a regression
test that fails first for an implementation bug, or a new consumer attempt for
a usability defect. Change one theme at a time and rerun with new agents.
Keep compatibility and ordinary project tests as separate gates.

## Stop with a bounded claim

Require two consecutive full valid rounds meeting the frozen critical and quality
thresholds, no unresolved recurring usability failure, and a final held-out check
before reporting stable improvement. Compare baseline and candidate under the
same task distribution, model, settings and budgets; keep both successes and
failures. A passing rerun without a change measures repeatability, not improvement.

If the holdout fails, reject promotion. Once its feedback informs a fix, it is
development data; create a new held-out family for final assessment. If the
budget ends first, report the best supported candidate and unmet criteria as
incomplete. Do not claim convergence from a single successful sample, unexecuted
plans, or zero self-reported confusion.

Report per-task counts and rubric dimensions before aggregate scores. A high
average cannot hide a critical failure. State the revisions, actual change,
evidence, contamination/blocked counts, compatibility checks and remaining limits.
Agent consumer results measure the tested model/harness; human developer usability
needs human participants.

## Relationship to the existing prompt workflow

Reuse the fresh executors, two-sided evidence and failure ledger from
`empirical-prompt-tuning`, and scenario organization/repeated grading from
`waxa-eval`. This skill is self-contained; those skills are not installation dependencies.

Check the actual executor before using a CLI adapter. The inspected `waxa`
executor in `mizchi/skills` instructs its model not to invoke external tools.
Such a run can evaluate a proposed workflow or grade captured text, but cannot
establish real package use. Use a tool-enabled isolated consumer runner for these
trials; keep the same tasks, rubric and evidence records across adapters.
