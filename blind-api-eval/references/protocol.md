# Experimental protocol

## Information boundaries

| Role | Receives | Produces |
| --- | --- | --- |
| Controller / implementer | Source, tests, private rubric, all development traces | Packaged revisions, fixtures, oracles and targeted fixes |
| Consumer executor | One revision's normal public docs/types, package entrypoints, task and budget | Consumer code, command log, observed outputs and self-report |
| Independent judge | Frozen rubric, public task/materials, anonymized consumer code and trace, controller's oracle result | Anchored scores with evidence locations |

Use separate directories, for example:

```text
evals/target/public/tasks/          # consumer-facing outcomes only
evals/target/private/              # rubric, independent oracles, holdout
evals/target/ledger.json            # controller only
results/target/revision/task/trial/ # preserved artifacts, not consumer input
```

The consumer's staged workspace belongs outside the source checkout. Stage only
the task and public artifacts it needs; do not mount the entire layout above.
Archive the exact rendered public prompt as well as the package checksum. Package
code is executable, but reading its implementation, source maps, private tests or
Git history breaks this experiment's public-surface boundary. Compiled code does
not by itself make a filesystem inaccessible. Record the actual isolation mode,
tools enabled and any exposure.

A prompt-level allowlist in a host with unrestricted filesystem access is a
procedural boundary. For enforced blinding use tool permissions or a container
that mounts only the consumer inputs; the controller runs private checks later.
Inspect the consumer's recorded reads. If access cannot be observed, disclose
that limit instead of asserting that contamination was ruled out. A judge must
also start without the author conversation or claimed winning revision.
Automatic diagnostic excerpts are part of the public runtime feedback; distinguish
them from deliberately opening implementation or private evaluation files. Prefer
opaque workspace IDs so a directory name does not advertise the expected winner.

## Public tasks and private checks

Public outcomes must be sufficient to solve the task fairly. For example: parse
records, retain the selected rows, produce a stated output, then handle an invalid
field with the documented error contract. Do not hint which builder method,
overload or grammar production to use unless it is naturally part of the user
request. Hidden grading may check these outcomes and use of supported interfaces;
it must not reward an undisclosed preferred spelling or design aesthetic.

Use cases differ by surface:

| Surface | Useful task variation | Observable evidence |
| --- | --- | --- |
| Library / SDK | Compose two operations, handle empty input, manage lifecycle | Type-check, executed output, exported imports and actual calls |
| API client | Pagination, documented error, retry boundary | Local service trace, request/response assertions |
| DSL / configuration | Compose constructs, change one parameter, repair invalid syntax | Parser/interpreter result, diagnostic span, semantics after repair |
| CLI | Discover help, combine flags, recover from a bad argument | Exit codes, stdout/stderr, generated output |

The independent oracle checks expected behavior without importing private helpers
into the consumer. For nondeterministic systems freeze fixtures/time/random seeds
where possible, or predefine admissible outcomes. Check actual dependency use:
an unused import followed by a handwritten reimplementation is not API success.
The judge inspects the submitted code and trace; instrumentation or a stub service
can make invocation observable. Keep that requirement in the public task.

Freeze task families, rubric anchors, weights, critical gates and acceptance
thresholds before the first run. Baseline is a comparable current artifact, not
an agent told to solve the task without the package. Maintain equal budgets and
record model/runtime/runner versions. Rotate or randomize candidate labels/order
without telling the judge which is new. If pairwise opinions are needed, reverse
the order in a second judgment; use absolute anchored grades as the main record.
Check inside copied traces for original working-directory paths or headers that
reveal baseline/candidate labels. A neutral enclosing folder does not anonymize
their contents. Redact labels consistently, retain the raw original and a redaction
record, and replace exposed judgments with fresh judges rather than asking a
judge to forget a label it has already read.

## Grading

Choose a few dimensions that would change a design decision. Adapt the example
anchors to the task: discoverability, composition, diagnostics/recovery and
supported API use. Each 0/1/2 anchor names visible behavior, not "poor/good/great".
Specify whether an anchor judges the full journey or the final artifact:
discoverability/recovery normally includes abandoned attempts, whereas final
functional correctness belongs to the oracle. Planned TDD failures are not evidence
of interface confusion. Freeze these interpretations with the rubric.
The correctness oracle is an independent hard gate. A reasonable default is:

```text
task_success = oracle_passed AND every critical criterion has score 2
rubric_percent = 100 * sum(weight * score / 2) / sum(weight)
promotion = all task gates AND the preregistered quality thresholds
```

The bundled scorer implements the first two formulas for one completed trial.
It intentionally has no global promotion rule: a library may require, for example,
no recovery score below 1 and a chosen per-task success rate. Record those rules
in the experiment plan rather than inferring them from the mean afterward.

An attempt ending in a compiler/runtime error or timeout is still a measured
failure when the environment was working and the budget was exhausted. Use
`blocked` for an external prerequisite or harness outage preventing a fair trial,
and `contaminated` for private-material exposure. Both are unassessed, not evidence
of quality. A private checker failure itself is a harness issue; a failing checker
assertion is a consumer/product outcome. Preserve the distinction in the trace.

Do not feed the consumer the judge rubric. Return only normal API/environment
feedback during execution. Afterward request a short report:

- First point of confusion and the public text/error that caused it.
- Assumptions and discretionary decisions, including any missing contract.
- Repeated decisions or retries, with command references.
- Issue / suspected cause / general fix rule for each observed obstacle.

These are external observations and brief explanations, not a request for hidden
reasoning. The controller may reject a proposed cause when the artifacts disagree.
Missing observable evidence means unverified, not an automatic full score.

## Improve and replicate

Keep a ledger entry per attempted trial, including invalid ones. Tie every design
change to a failure class and criterion; consult prior entries before adding a
similar workaround. Separate changes to exports/types, docs/examples, diagnostic
messages and package setup so the experiment can distinguish their effects.
If a scenario or oracle was wrong, version it, explain the correction and rerun
both baseline and candidate; do not rewrite the old result as if it had passed.

Use ordinary TDD for code defects: reproduce the behavior in a failing test, make
the minimal change, then refactor. Consumer usability evidence complements unit,
type, integration and compatibility tests. It does not replace them.

Repeat full valid rounds under the frozen criteria; compare per-task distributions
and keep denominators visible (`successes / valid attempts`, plus excluded counts).
The default two-round stability rule is a budgeted heuristic, not a significance
test. If uncertainty matters, increase fresh repetitions and report intervals
under an explicit sampling model. Do not invent tool counts, token counts or
precise timing when the host does not expose them.
Fresh sessions reduce author-context leakage, but do not eliminate pretrained API
knowledge or correlated biases from using the same model for consumers and judges.
Treat a different model or human participants as a separate validation population.

Run the held-out family only after selecting a candidate. Keep held-out results
out of selection. Failure rejects the candidate; diagnosis turns that family into
development data and requires a new holdout. A practical budget stop is a valid
outcome, but is reported as incomplete rather than converged.

## Adapters

In Codex the blank-slate dispatch is `spawn_agent` with `fork_turns: "none"`;
in a host that exposes an Agent/Task tool, select its clean-context option.
Task names are not isolation. Do not emulate independence by rereading your own
instructions. If dispatch or actual tool execution is unavailable, prepare the
plan and explicitly mark empirical execution skipped.

`waxa` scenario YAML and its ledger can inspire organization, but the JSON scorer
and prompt templates here are this skill's own contract, not a new supported
`waxa` schema. Inspect the selected executor's capabilities. The repository's
`tools/waxa/src/cli.ts` was checked on 2026-11-18 and forbids external tool calls
in its executor prompt. Narrated commands from that runner do not count as runs.
