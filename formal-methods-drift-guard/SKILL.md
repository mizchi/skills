---
name: formal-methods-drift-guard
description: Use after a formal model or verifier check already exists and the user wants to maintain it over time. Helps Codex compare specs/docs, implementation code/tests/config/logs, and formal models or CI checks for drift; classify whether the drift is in the spec, code, model abstraction, harness, or unresolved domain decision; run or plan verifier checks; and translate SAT/UNSAT changes, counterexample traces, proof failures, stale models, and CI results into domain-language review questions and ledger entries.
---

# Formal Methods Drift Guard

Use this skill when a team already has a model/check and now needs to keep
`spec -> code -> model` aligned as the product changes.

This is not the first-modeling skill. If no useful model exists yet, use
`formal-methods-reconciler` first. This skill starts after at least one of
these exists: a Z3/Alloy/TLA+/P/Dafny/MoonBit/Lean/Rocq check, a CI verifier
job, a model ledger, or a domain decision that was previously locked.
Use `formal-methods-reconciler` for first extraction, tool selection, and
initial model design; use this skill for ongoing drift maintenance.

## Core Rule

Do not make the model green by silently changing the property.

Treat every red check, stale claim, missing source mapping, or changed witness
as a drift signal. Translate it into domain language before proposing a fix.

## Workflow

1. **Build the triplet inventory.**
   - Spec side: docs, ADRs, API contracts, product rules, threat model,
     support runbooks, incident decisions.
   - Code side: implementation, tests, config, schema, migrations, logs,
     telemetry, traces.
   - Model side: formal files, harness scripts, expected SAT/UNSAT assertions,
     CI workflows, pinned tool versions, previous ledger decisions.
   - Assign stable claim IDs when missing, such as `AUTHZ-SETTINGS-001`.

2. **Map each claim across the three surfaces.**
   - Expected domain claim: what the business rule says.
   - Implementation observation: what code/config/logs currently do.
   - Model property: predicate, invariant, reachability, liveness, theorem, or
     proof obligation that represents the claim.
   - Check command: exact command or CI job that decides the model result.
   - If the domain rule became more granular than the model, do not treat that
     as executor uncertainty. Record the abstraction choice explicitly as a
     model/domain question: for example, split `Reachable(Settings)` into
     `settings:read` and `settings:write`, or keep one state plus a capability
     relation. Classify the old coarse property as `model-drift` or
     `coverage-gap` until the owner accepts the new abstraction.

3. **Run the cheapest drift checks first.**
   - Text/code diff: did docs, code, model, fixtures, or expected-result files
     change under relevant paths?
   - Harness check: do all model checks still run in CI with pinned tools?
   - Result check: did expected `SAT`, `UNSAT`, trace shape, proof success, or
     proof obligation count change?
   - Coverage check: is there a spec claim with no model, or a model property
     with no living domain claim?
   - Trace/log replay: if logs are available, check whether real event traces
     still refine the model.

4. **Classify drift before fixing.**

   | Drift class | Meaning | Typical next action |
   | --- | --- | --- |
   | `spec-drift` | Docs/domain rule changed but model or code did not | Ask whether to update model, code, or both |
   | `code-drift` | Code/config behavior changed while the locked model stayed the same | Treat as likely regression until domain owner accepts it |
   | `model-drift` | Model no longer represents the accepted domain rule or implementation boundary | Update model abstraction with review |
   | `harness-drift` | Tool version, CI, fixtures, expected-output parser, or path filter broke | Fix harness without changing the property |
   | `decision-drift` | Previous domain decision is now ambiguous or contradicted | Re-open domain question |
   | `coverage-gap` | A claim exists on one surface but not the others | Add model, docs, tests, or explicit non-goal |

   Choose one primary drift class. Base it on which surface currently diverges
   from the accepted domain rule, not on which surface changed first. If docs
   and code both intentionally moved to a new accepted rule while the model
   still encodes the old rule, classify the primary drift as `model-drift` and
   note the spec/code change as the driver. If code moved but docs and model
   still encode the accepted rule, classify it as `code-drift`. Use secondary
   notes for contributing factors, but do not leave the fix target ambiguous by
   listing multiple primary classes.

5. **Translate machine output to domain wording.**
   - Say who can do what, which order is accepted, which config is dead, which
     state becomes reachable, or which crash/retry sequence loses data.
   - Include the changed condition that caused drift: new doc rule, changed
     route guard, changed enum, changed config default, new event type, new
     tool version, or new trace.
   - Never show only `SAT`, `UNSAT`, `proof failed`, or `CI red`.

6. **Decide the fix target with the owner.**
   - If spec is correct and code drifted: fix code and keep the model check.
   - If code is intentional and spec is stale: update spec and adjust model.
   - If model abstraction is stale: update model and preserve the domain claim.
   - If harness drifted: fix CI/scripts/pins and do not change domain text.
   - If unresolved: keep the witness and ask a domain-owner question.

7. **Lock the maintenance loop.**
   - Keep model checks in CI with machine-readable exit codes.
   - Add path filters so PRs touching relevant specs/code/models run the right
     checks.
   - Keep a ledger entry per claim and update it when a domain decision changes.
   - Prefer explicit expected-result files for SAT/UNSAT or trace shapes so
     changes are reviewable.

## Output Contract

For each changed or suspicious claim, produce a ledger entry:

```text
claim_id:
source_of_truth:
spec_delta:
code_delta:
model_delta:
check_command:
previous_machine_result:
current_machine_result:
drift_class:
witness:
domain_wording:
domain_question:
recommended_fix_target:
lock_update:
epistemic_status:
```

Use `references/drift-ledger.md` for templates and examples.

## Reporting Discipline

- Separate confirmed machine results from inferred drift. Label them
  `machine-confirmed`, `log-confirmed`, `diff-inferred`, or `not-run`.
- Preserve the exact failing command or CI URL when available.
- Do not collapse domain uncertainty into self-report uncertainty. A missing
  domain decision is an output, not a failure to use the skill.
- Do not put model-granularity choices in self-report unclear points when the
  deliverable can express them as domain questions. Use self-report only when
  the skill cannot be applied; use the ledger when the model needs a reviewed
  abstraction change.
- Do not put an explicitly unrun verifier/check in self-report unclear points
  when the task is to produce a drift ledger. Record it as
  `current_machine_result: not-run`, add `diff-inferred` or `log-confirmed`
  evidence where available, and propose the exact check as `lock_update`.
  Only use self-report when the user explicitly asked you to run the verifier
  and the run failed or was impossible.
- Do not mark a model obsolete only because it is red. First ask what behavior
  changed and whether that change is intended.
- Do not claim the implementation refines the model unless the verifier,
  trace-checker, tests, or explicit replay actually checked that relation.

## Common Cases

- **Authz docs changed:** A role gains an exception in docs. Check whether
  Alloy/Z3/P route model and code guards agree; translate any witness as
  "role X can/cannot reach screen Y under flag Z."
- **Config default changed:** Empty allowlist was clarified from "all users" to
  "no users." Check Z3 config validator and live config; translate dead or
  newly-open config in campaign language.
- **Protocol event added:** A new retry or timeout event is added. Check TLA+/P
  model for stale state transitions; translate traces as user-visible duplicate
  charge, lost ack, stuck job, or stale read.
- **CI pin changed:** A new solver/prover version changes output formatting or
  proof obligations. Classify as harness drift unless the semantic result
  changed.
- **Incident found a real trace:** Replay the incident trace against the model.
  If accepted, the model permits the incident and needs a stronger contract. If
  rejected, the model/code gap needs investigation.
