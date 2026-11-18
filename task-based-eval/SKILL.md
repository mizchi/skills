---
name: task-based-eval
description: Evaluate whether fresh agents achieve a stated goal using a tool, document, interface, skill or workflow. Organize definitions by task under evals/, specify inputs, permitted actions, outputs and success criteria, then improve the supplied resource from independent outcome checks and rubric grading.
---

# Task-based evaluation

Measure whether an agent can achieve a goal using something supplied to it.
The target may be a tool, document, application, interface, skill or workflow.
Observe actual inputs, actions, feedback, outputs and resulting state, then grade
goal achievement. API usability is one application of this method.

```text
goal + input + supplied resource + permitted actions
  → fresh executor → observed interaction + output/state
  → goal verification + rubric → targeted change → fresh trial
```

Improve the supplied resource or environment while keeping the task distribution,
executor model, budgets and other conditions fixed during a comparison. This is
task-based evaluation; measuring a resource's usefulness through downstream task
outcomes is also called extrinsic evaluation. Read
[research and terminology](references/research.md) for the distinction from
behavioral testing, API usability and reflective optimization.

For a grading-only or planning-only request, perform that phase using the supplied
evidence and budget. Label the narrower result; do not silently start a full experiment.

## Define a task, then cases and trials

Use `evals/<task-name>/` for a stable goal, such as `route-support-request` or
`repair-invalid-config`. The directory names the goal, not the tool, model,
revision or execution. A **case** is a particular input/initial state for that
goal. A **trial** is one fresh attempt on a case. See
[task layout and protocol](references/protocol.md) for file ownership and adapters.

Freeze before the first run:

- Goal and observable success conditions: required output, final environment
  state, constraints and acceptable alternatives.
- Supplied target/resource, input cases and initial state; record content hashes
  or reproducible snapshots. Select ordinary and edge cases relevant to the goal.
- Permitted actions and observations: reading, execution, UI interaction, writing
  files, or other state changes. Identify what must remain immutable and what
  the executor is expected to change. Reset mutable state between trials.
- Goal verifier and its evidence. Use programmatic checks where possible;
  otherwise declare environment inspection, rubric judgment or human review.
  Do not report a judgment as an automated test.
- Private rubric, anchored 0/1/2 scores, positive weights, at least one critical
  criterion, promotion thresholds, trials, holdout and total budget.

Choose the baseline to match the question. An older resource version measures a
change; a no-resource condition can measure added usefulness when the same goal
is meaningful without it. Freeze which resource-use constraints apply to each
condition. Do not fail the no-resource baseline merely for not using a withheld
resource. Change one experimental variable at a time.

Start with two fresh trials per case and a bounded iteration budget unless the
user specifies otherwise. Scale to cost/importance and disclose reduced coverage.
These defaults are engineering heuristics, not statistical confidence guarantees.

## Execute with a fresh, bounded view

Spawn a new executor for each case, trial and condition. In Codex use
`fork_turns: "none"`; a fresh name with inherited history is not blank-slate.
Give it only the public task, selected inputs, supplied resource, permitted
actions/observations, budget and output location. Fill the
[executor prompt](assets/executor-prompt.md).

Do not pass this evaluation skill, the private rubric, author reasoning, suspected
defects, reference answers, other attempts, the ledger or the preferred condition.
Blinding concerns that private information, not the resource the task requires:
source code may be legitimate input for a source-reading task. For a public-API
task, implementation inspection is normally outside the declared boundary.

Stage the selected materials outside the source/evaluation checkout. An immutable
package, document snapshot, test service or resettable UI environment can each
serve as the target. Do not give access to the entire evaluation directory.
Enforce the boundary with tool permissions or a sandbox when available. On a shared
unrestricted host, declare **procedural blinding**, give a read allowlist and inspect
available traces; do not claim filesystem enforcement or complete auditing.

Capture actions and observations in the modality the task needs: command I/O,
document reads and answers, tool calls/responses, UI observations and resulting
state, or generated artifacts. A text-only task can be a real execution without
shell commands. Narrating a command, click or deployment is not evidence that
the corresponding external action occurred.

The executor may revise its own attempt within budget, but may not change the
condition, verifier or immutable target. Normal runtime diagnostics are permitted
observations. Do not coach it mid-trial; new information or rescue assistance
changes the intervention and must be recorded. Request brief confusion/assumptions
and retry reports, distinguishing planned TDD Red runs from interface uncertainty.

## Verify the goal, then grade the attempt

Independently inspect the preserved output and state. Set the goal-verification
result from observed evidence, not the executor's assertion of success. Record
`verification_method` and evidence: programmatic, environment, rubric or human.
If verification is unavailable, leave the outcome unassessed.

Ask a separate fresh judge to apply the frozen rubric to anonymized task materials,
observations and results; use the [judge prompt](assets/judge-prompt.md).
Require evidence locations for every score. Treat executor self-report as a
diagnostic, not the final grade. Remove condition labels inside trace paths and
headers as well as directory names; preserve originals. Replace exposed judgments
with fresh judges after sanitizing the evidence.

Adapt [the rubric](assets/rubric.example.json) to the task. The
[trial example](assets/trial.example.json) uses the existing `oracle_passed` field
for the controller-verified goal result; this field does not imply a code oracle.
For deterministic record validation and arithmetic, run:

```sh
node /path/to/task-based-eval/scripts/score-trial.mjs rubric.json trial.json
```

Node.js 24+, no dependencies. Exit 0 means the goal check and every critical
criterion pass; 1 means a measured failure; 2 means unassessed/malformed. The
helper does not verify evidence or project-specific quality thresholds. Apply
those thresholds separately before promoting a condition.

Record attempts in `evals/<task-name>/ledger.json`: case/trial/condition IDs,
resource/input hashes, model/harness/settings, observations, outputs/state,
verification method/result, rubric/evidence and exposure status. Unavailable
metadata is null. Keep raw runs in `results/<task-name>/<run-id>/<case-id>/<trial-id>/`
or an external ignored artifact store, separate from task definitions.

## Improve the cause and replicate

Classify failures: resource content, interaction contract, discoverability,
environment/setup, executor capability or harness. A broken supported workflow
is a product failure; a harness outage preventing a fair attempt is `blocked`.
Private-answer exposure is `contaminated`. Preserve these attempts, show excluded
counts separately and replace them with valid trials; exclusions are not successes.

Tie each change to the failed anchor, observed I/O/state, causal hypothesis and
smallest useful fix. Consult the failure ledger. For code defects, add a failing
regression test before the fix; for a document or workflow defect, retest the
revised resource with a new executor. Keep ordinary product tests as separate gates.

Before claiming stable improvement, require two consecutive full valid rounds
meeting the frozen goal/critical/quality thresholds and a final held-out check.
A passing repeat without a change measures repeatability, not improvement. Do
not change the goal or make cases easier to obtain a better score.

If holdout feedback informs a fix, that case is development data; reserve a new
held-out case/family. If budget ends first, report incomplete coverage and unmet
criteria. Present per-case counts before averages, including failed and excluded
attempts. Zero self-reported confusion is not proof of goal achievement.

Agent results measure the tested model/harness, not human performance. The
[API/DSL study](evals/filter-and-project/report.md) is a historical worked example;
the [document-use study](evals/route-support-request/report.md) exercises non-code
resource use. Neither limits the method to those task types.

## Existing evaluation tools

Reuse fresh executors, two-sided evidence and a failure ledger from
`empirical-prompt-tuning`, and repeated scenario grading from `waxa-eval`.
Neither is an installation dependency. Preserve native harness entrypoints and
map them to the task directory; this layout is a repository convention, not a
universal framework schema.

Inspect the runner's actual capabilities. The checked `waxa` executor forbids
external tools: it can execute a fully supplied text-in/text-out task, but a
textual plan cannot verify an action requiring a shell, browser or service.
The runner must actually supply the text and capture required output files;
listing an inaccessible file path does not supply its contents.
Use a tool-enabled runner when the task's evidence requires those actions.
