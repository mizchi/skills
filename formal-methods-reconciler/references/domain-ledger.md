# Domain Ledger Templates

Use these templates to make formal-methods output reviewable by non-specialists.

## Full Ledger

```text
source:
  docs / code / tests / config / logs / incident:

expected claim:
  Domain wording of what should be true.

implementation observation:
  What the implementation or data actually does.

model question:
  Predicate, relation, invariant, reachability, liveness, or theorem question.

tool:
  Z3 / Alloy / TLA+ / P / Dafny / MoonBit prove / Lean / Rocq / ...

machine result:
  SAT / UNSAT / trace / proof failure / proved obligation.

witness:
  Smallest input, relation instance, action trace, event schedule, or failed obligation.

domain wording:
  Who can do what, what state is reachable, or which sequence loses data.

domain question:
  Is this intended?

decision:
  bug / spec update / model bug / accepted exception / unresolved.

lock:
  CI command, regression guard, test, or spec update to keep.
```

## Counterexample Wording

Prefer:

```text
Viewer in Org A can read Project in Org B when BillingAdmin override is enabled.
Is BillingAdmin intended to bypass project tenant boundaries, or only invoice access?
```

Avoid:

```text
Alloy found SAT for CrossTenantRead.
```

## Proof Success Wording

Prefer:

```text
Within the modeled scope, a digital checkout with empty email cannot be valid.
The model also has a positive sanity case: email length 1 and total 1 can be valid.
This supports locking "digital checkout requires non-empty email" as an API contract.
```

Avoid:

```text
Z3 returned unsat.
```

## Ambiguity Wording

```text
The implementation treats timeout as fail-open for preview access, while the docs do not mention timeout behavior.
Should timeout deny access, allow access, or preserve the last known decision?
```

## Fix Recommendation Wording

```text
If intended:
  Update docs to include the exception and add a regression check for that behavior.

If unintended:
  Fix the implementation and keep this model as a CI guard.

If unclear:
  Keep the witness and ask the domain owner before changing behavior.
```
