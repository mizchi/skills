# Task layout and experimental protocol

## Task, case, trial and run

| Concept | Meaning | Example |
| --- | --- | --- |
| Target/resource | What the agent is given or allowed to use | Routing guide, browser application, SDK, workflow |
| Task | Stable goal, I/O contract, allowed actions and success definition | Route a support request correctly |
| Case | One input or initial state for that goal | A security report that also resembles an account lockout |
| Trial | One fresh attempt on a case under a condition | New agent with guide revision B |
| Run/round | A scheduled batch of trials | All cases on two resource revisions |

Keep `evals/<task-name>/` centered on the goal. A target can support several tasks;
the same task can compare several targets or resource revisions. Keep condition,
revision, case and trial IDs in records rather than encoding them all in the
task directory name. A task does not need to be one prompt or one test input.

## Directory convention

```text
evals/
  route-support-request/
    task.md                # public goal, output contract and action constraints
    inputs/                # public case data/initial-state fixtures
    fixtures/              # snapshots of the supplied resource/environment
    private/
      rubric.json          # controller/judge only
      verify.mjs           # optional automated goal checker
      holdout/             # reserved cases and expected results
    plan.json              # controller: conditions, case mapping, budget, thresholds
    ledger.json            # controller: attempts, diagnoses and changes
results/
  route-support-request/
    run-001/case-001/trial-001/
      observations.jsonl
      outputs/
      grading.json
```

Create only the files a task needs. A goal checker may be a native framework
scorer, environment assertion, declared judge rubric or human review instead of
`verify.mjs`. `plan.json` is an optional controller record, not a standardized
cross-framework format. Raw results may live in an ignored or external store.
Separate versioned definitions from generated run artifacts.

This is compatible with task-oriented organization, but does not replace a
runner's required schema/discovery paths. For example, the
[Agent Skills evaluation guide](https://agentskills.io/skill-creation/evaluating-skills)
uses skill-local `evals/evals.json` and a separate results workspace, while
[Inspect](https://inspect.aisi.org.uk/tasks.html) defines a task through its data,
solver and scorer. The repository's `waxa` uses skill-local `evals/eval.yaml`;
its older repo-root form infers a skill from `evals/<skill>/eval.yaml`.
Do not assume it will interpret `<task-name>` as intended. Keep its native suite
entrypoint or add an explicit adapter rather than claiming automatic compatibility.

## Information boundaries

| Role | Receives | Produces |
| --- | --- | --- |
| Controller / improver | Resource versions, plan, verifier, private rubric and traces | Staged conditions, checked results, targeted changes |
| Executor | One case, permitted resource, actions/observations and budget | Interaction trace, output/state and short self-report |
| Independent judge | Frozen rubric, anonymized public materials and observed evidence | Anchored scores with locations |

Stage the selected task, inputs and resource outside the source/evaluation tree.
Do not mount the whole task directory, including `private/`, into the executor's
workspace. Record exactly what was supplied and hash or snapshot it.

Blinding excludes author rationale, reference answers, private criteria, past
attempts and the preferred winner. It does not exclude legitimate task inputs:
source is allowed for code comprehension when declared, and documentation is
allowed for a guide-reading task. In a public-API trial, source inspection may be
excluded. Make that boundary explicit instead of treating every resource as an
opaque package.

Fresh context does not isolate filesystem or shared state. Use host permissions
or a container for enforcement where available. Otherwise declare procedural
blinding with an allowlist and the limits of trace inspection. Automatic runtime
stack excerpts are ordinary feedback, distinct from opening private source/tests.
Reset the environment between trials; separate the immutable experimental target
from allowed state mutations, such as completing a form or generating a report.

Use opaque workspace IDs. Check inside logs, headers and screenshots for condition
labels, not just the enclosing directory name. Preserve original evidence and a
redaction record. If a judge sees private condition labels, sanitize and dispatch
a new judge; asking it to forget does not restore blinding.

## Inputs, interaction and success

Make the public goal and output contract sufficient for a fair attempt. Hidden
verification may check the stated goal and constraints, not an undisclosed
preferred phrase or exact action sequence. Fix acceptable alternatives before
running. If target use is required, say so publicly and verify actual use rather
than an unused import, a claimed click or an unobserved read.

| Target | Possible task | Evidence |
| --- | --- | --- |
| Guide/document | Decide what to do for a new case | Supplied text, answer, cited rule and decision consistency |
| Application/UI | Complete an operation and reach a required state | Real actions, screenshots/state observations, resulting record |
| Tool/service | Produce a valid result under constraints | Calls/arguments, responses, output and state assertions |
| Skill/workflow | Produce the requested deliverable | Given instruction, actions, final artifact and its checks |
| Library/DSL | Compose operations or repair input | Executed consumer, diagnostics, outputs and actual dependency use |

A document-in/answer-out trial is real task execution even without a shell.
For an external-action task, narrated commands or clicks are not execution.
Require evidence appropriate to the claimed operation. A hypothetical plan can
itself be a valid output only when planning is the task being evaluated.

The goal verifier can be programmatic, environment-based, rubric-based or human.
Record `verification_method` and the evidence. A judge-based pass is not an
automated correctness proof. Use deterministic checks for mechanical facts where
available. If a verifier cannot run or evidence is insufficient, do not turn that
absence into a pass. Distinguish checker crashes from failed assertions.

## Comparison and grading

Freeze cases, resource conditions, allowed actions, anchors, critical flags,
weights, quality thresholds and budgets. Version changes to those definitions.
After a faulty case/verifier is corrected, rerun both conditions on that definition;
do not relabel an old failure as a success. Keep model/harness/settings fixed when
isolating a resource change. A no-resource condition is valid for measuring added
value if the goal is still meaningful; condition-compliance criteria must allow
the intentional absence of that resource.

Choose a few task-relevant dimensions. Anchor each score in observable behavior.
Specify whether it judges the full journey or only the final result. Deliberate
TDD Red failures differ from resource-driven confusion or failed decisions.
Critical partial credit fails the trial; weights cannot hide it.

```text
trial_success = verified_goal_pass AND every critical criterion has score 2
rubric_percent = 100 * sum(weight * score / 2) / sum(weight)
promotion = task gates AND preregistered quality/stability thresholds
```

The helper retains the schema-1 field name `oracle_passed` for verified goal pass.
It validates that boolean and the score record, not the verifier's authenticity
or method. It applies no aggregate promotion policy.

A fair attempt that exhausts its budget or produces the wrong result is a measured
failure. `blocked` means an external prerequisite/harness prevented a fair trial;
`contaminated` means exposure invalidated it. Preserve all records, show excluded
counts separately, and obtain replacement valid trials. Missing evidence is not
an automatic full score. Self-report helps diagnose obstacles but is not the grade.

## Improvement and stopping

Record Issue / suspected cause / general fix rule, along with the exact failed
anchor and observed I/O/state. Scan prior failure patterns before adding a new
workaround. Change one cause at a time: resource content, interaction design,
workflow step, diagnostics or setup. Do not alter success conditions to fit the
candidate. Retest with fresh executors and keep ordinary product tests separate.

The default two full valid rounds plus final holdout is a budgeted stability
heuristic, not statistical significance. Use more repetitions and an explicit
sampling model when uncertainty matters. Metadata unavailable from the host stays
null. Fresh sessions do not remove pretraining knowledge or same-model bias.

Select the candidate on development cases before running the holdout. Feedback
used for optimization turns a holdout into development data; reserve a new family
for final assessment. Budget exhaustion can end the work, but does not establish
convergence. Report per-case goal success and quality before averages, and state
which population/environment was actually evaluated.

## Runners

In Codex dispatch a fresh executor with `fork_turns: "none"`; other hosts need
equivalent history-free sessions. The directory name alone provides no isolation.
Do not substitute a self-reread for an independent attempt. If dispatch is absent,
prepare the task and mark new empirical execution skipped.

The checked `waxa` executor (`tools/waxa/src/cli.ts`, 2026-11-18) forbids external
tool calls. It can still perform fully supplied text tasks. It cannot establish
that a shell command, browser operation or service call actually occurred from
prose alone. If the runner puts documents into the prompt and captures the answer,
that can satisfy a text-only task. Required file materialization must be done by
the runner explicitly; merely naming unreadable paths is insufficient input.
Choose the runner from the task's action/observation requirements;
do not change the goal into a narration task just to accommodate the runner.
