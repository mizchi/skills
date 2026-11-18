# Route support requests — document-use coverage check

On 2026-11-18, two fresh subagents received only a staged task, five requests and
an immutable routing guide. They produced decisions with guide rule references.
The task required reading and deciding, not an implementation, API call or external
ticket submission. The controller checked the resulting JSON against private
expected routes and verified that the staged inputs retained their frozen hashes.

| Trial | Correct decisions | Independent rubric | Verified goal |
| --- | --- | --- | --- |
| 01 | 5/5 | 100% | Pass |
| 02 | 5/5 | 100% | Pass |

The cases include a normal request, overlapping rules, an outage, an account
lockout and a workaround. A fresh judge read the generalized skill and applied
three frozen criteria: condition compliance, output fitness and evidence fidelity.
It accepted document-in/decision-out as the actual task modality. It also confirmed
that fully supplied text tasks do not inherently require external tools, while a
claim about a browser action requires observed interaction and state.

This is a coverage smoke, not a measured document improvement or a convergence
result. There is one guide condition, no no-guide baseline, no candidate mutation
and no holdout. Procedural blinding on a shared host and self-recorded observations
do not provide a complete filesystem/action audit. The judge qualified condition
compliance accordingly. Precise usage/timing/model metadata is unavailable.

## Replay

Stage [task.md](task.md), [requests.json](inputs/requests.json) and
[routing-guide.md](fixtures/routing-guide.md) in a new isolated workspace. Give a
fresh executor only those files and the task's permitted actions. Do not supply
this report or [the private rubric](private/rubric.json).

After it writes decisions.json, run:

```sh
node private/verify.mjs /path/to/staged/decisions.json
```

A programmatic result verifies the decisions; the rubric independently evaluates
the observed attempt. The checker also has negative tests for incorrect rule
precedence, missing/duplicate IDs and unsupported rule citations.

[plan.json](plan.json) records the frozen condition, inputs and budget;
[ledger.json](ledger.json) retains outcomes, grades and qualifications. Raw local
artifacts are at `~/.cache/mizchi-skills/task-based-eval-20261118`.
