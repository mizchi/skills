# Drift Ledger Templates

Use these templates after a formal model already exists and a change may have
introduced drift between spec, code, and model.

## Full Entry

```text
claim_id:
  Stable ID, for example AUTHZ-SETTINGS-001.

source_of_truth:
  docs / ADR / API contract / code-as-de-facto / incident decision / unresolved.

spec_delta:
  What changed in docs or domain language. Use file paths and lines when known.

code_delta:
  What changed in implementation, tests, config, schema, logs, or traces.

model_delta:
  What changed in the formal file, harness, expected-result file, or CI path.

check_command:
  Exact command or CI URL.

previous_machine_result:
  Previous SAT/UNSAT/trace/proof status, or "unknown".

current_machine_result:
  Current SAT/UNSAT/trace/proof status, or "not-run".

drift_class:
  spec-drift / code-drift / model-drift / harness-drift / decision-drift /
  coverage-gap.

primary_drift_reason:
  Why this one class is primary when multiple surfaces changed. Say which
  surface diverges from the accepted domain rule and which changes are only
  drivers or secondary notes.

witness:
  Smallest input, relation instance, event trace, log trace, or proof failure.

domain_wording:
  Domain-language statement of what changed.

domain_question:
  Question for the owner. Phrase as a decision, not a theorem.

recommended_fix_target:
  spec / code / model / harness / domain decision / multiple.

lock_update:
  CI guard, expected-result update, path filter, docs update, or trace replay.

epistemic_status:
  machine-confirmed / log-confirmed / diff-inferred / not-run.
```

## Domain Translation Patterns

Prefer:

```text
After the docs added "Support can open read-only settings", the model still
asserts that every non-admin settings reachability is impossible.
Should Support be a documented exception, or should the docs avoid calling this
screen "settings"?
```

Avoid:

```text
NonAdminNeverAtSettings changed from UNSAT to SAT.
```

Prefer:

```text
The implementation now treats a missing policy document as allow, while the
model and docs still say missing policy denies access.
Can a user access billing when the policy store times out, or must that fail
closed?
```

Avoid:

```text
Authz model is stale.
```

## Drift Class Examples

```text
spec-drift:
  Docs add a new role exception, but the model still forbids every non-admin.

code-drift:
  A route guard starts accepting preview users, but docs/model still say admin
  only.

model-drift:
  Product accepted preview users last month and docs/code changed, but the model
  still encodes the old rule.

model-drift with spec/code driver:
  Docs and code both now accept Support read-only Settings access, but the model
  still says every non-admin Settings reachability is impossible. Primary class
  is model-drift; the docs/code change is the driver, not a second primary class.

harness-drift:
  The solver version changes output formatting and the parser marks a passing
  check as failed.

decision-drift:
  An incident reveals that a prior exception was narrower than the team thought.

coverage-gap:
  Docs define timeout behavior, but no model or test mentions timeout.

granularity drift:
  Docs refine "can open Settings" into "can read Settings but cannot write",
  while the model still has only `Reachable(Settings)`. Record whether the
  model should split read/write states or keep one state plus a capability
  relation as a domain question; do not hide the choice in self-report.
```

## Fix Target Wording

```text
If the new behavior is intended:
  Update the docs and model, keep a regression guard for the accepted exception.

If unintended:
  Fix the implementation and keep the existing model result as the contract.

If the machine result is only harness drift:
  Fix parser/tool pins/CI without changing the domain claim.

If unclear:
  Preserve the witness and ask the domain owner before changing behavior.
```
