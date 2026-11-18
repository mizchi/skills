# Filter and project records — historical API/DSL smoke

Run on 2026-11-18 under the previous skill name `blind-api-eval`; the historical
results below are preserved, not new trials of every generalized task modality.

A small controlled API-plus-DSL experiment exercised the workflow. Seven fresh
consumer subagents used staged package copies, with no parent conversation,
private rubric, reference solution or prior attempt provided. Separate judges
applied the fixed rubric; the controller ran three independent assertions per
consumer and checked that package artifacts were unchanged.

| Condition | Ordinary task | Literal-key task | Held-out task |
| --- | --- | --- | --- |
| Baseline | Oracle pass; 100% rubric | Oracle pass; 75% rubric; 7 uncertainty retries | Not used |
| Candidate round 1 | Oracle pass; 100% | Oracle pass; 100%; 0 uncertainty retries | Not used |
| Candidate round 2 | Oracle pass; 100% | Oracle pass; 100%; 0 uncertainty retries | Not used |
| Final candidate | — | — | Oracle pass; 100%; 0 uncertainty retries |

The baseline literal-key consumer eventually succeeded by copying the key to an
alias after trying unsupported syntax. This remained a functional success: the
consumer still used the library for filtering and projection. The discovery
rubric captured the workaround and exploration cost. The candidate documented
literal flat-key syntax and added an actionable syntax diagnostic, preserving
query semantics. Both following rounds used that syntax directly.

These are bounded smoke results, not an effect-size estimate. There was only one
fresh consumer per task per round, rather than the skill's default of two. The
model/harness was inherited; exact model identity, usage counts and durations
were unavailable and are null in the ledger. Consumer workspace names exposed
condition labels. Public-surface access used a procedural allowlist on a shared
host, not enforced filesystem isolation, and a complete read audit was unavailable.
No claim of statistically independent samples or human usability follows.

## Findings that changed the skill

- Copied command logs exposed original version labels even inside neutral judge
  folders. Three initial judgment batches were superseded. The controller
  sanitized internal paths, randomized opaque sample IDs and had a new judge
  regrade all six development attempts against the unchanged rubric. The table
  uses those replacement grades. The final judge reported no condition-label leak.
- Normal runtime stack snippets needed to be distinguished from deliberate source
  inspection. Public diagnostics remain part of the interface being evaluated.
- Planned TDD Red runs needed to be distinguished from retries caused by API
  confusion. They did not reduce discovery scores.
- The first controller oracle used incorrect Node argv positions and self-imported.
  It failed before grading. The checker was corrected and rerun on unchanged
  artifacts and expected cases; no consumer result was silently rewritten.

An additional fresh agent used the skill for a grading/planning-only request on
synthetic review fixtures. It rejected a partial-critical trial despite 87.5%
weighted achievement, rejected narrated commands from a tool-disabled executor
as execution evidence, retired a reused holdout, and respected a zero-new-trial
budget. This checks those instruction branches; it is not another API consumer
trial or a full evaluation of every possible skill workflow.

## Replay and evidence

[ledger.json](ledger.json) records hashes, scores, observations, events and limits.
[plan.json](plan.json), [private/rubric.json](private/rubric.json)
and [private/cases.json](private/cases.json) preserve the frozen small experiment.
The package revisions are in [fixtures/baseline](fixtures/baseline/README.md) and
[fixtures/candidate](fixtures/candidate/README.md).

For replay, stage only one package under a new consumer workspace's
`node_modules/record-query`, its public README, and one task's prompt. Do not give
the consumer this report, the rubric, fixture source tree or task answer cases.
Have a fresh tool-enabled agent create `consumer.mjs` exporting `solve(rows)`.
The controller can then run `node private/verify.mjs <consumer-path>
<JSON-encoded-cases>` against that task's cases. Use the skill's judge template and
scorer on the preserved artifact/trace. No package manager or network is required
for this tiny fixture; Node.js 24+ is sufficient.

The published historical holdout is now regression/replay data. A future adaptive
comparison must reserve a new unseen task or family for final assessment.
Raw local attempts, command logs and judge packs are retained under
`~/.cache/mizchi-skills/blind-api-eval-20261118`; they are not required runtime
resources of the installed skill.

The deterministic scorer was developed Red → Green and passes nine tests,
including partial-critical rejection, oracle precedence, excluded trials,
malformed records, CLI exit codes and numeric weighting boundaries.
