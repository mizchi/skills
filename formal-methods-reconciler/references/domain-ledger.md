# Domain Ledger Templates

Use these templates to make formal-methods output reviewable by non-specialists.

## Full Ledger

```text
bug class:
  The class from the confirmed list (e.g. CWE-284 cross-tenant read, liveness: queue drains).

oracle source:
  user-confirmed / named document / inferred from code (say which code).

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

assumptions:
  Bounds, small scope, fairness, constants, behaviour of other systems. Vacuity check result.
  Proof escapes: output of scripts/check_proof_escapes.py, and `#print axioms` for Lean theorems.

machine result:
  SAT / UNSAT / trace / proof failure / proved obligation.

scope and method:
  Unbounded or the exact bound; machine-checked (command) / bounded search / hand argument.

sensitivity:
  Mutants of this class and whether each was detected. detected / unverified.

witness:
  Smallest input, relation instance, action trace, event schedule, or failed obligation.

reproduction:
  Implementation test that forces the witness, and whether it failed the same way.
  A mismatch in either direction means the model is suspect first: name the assumption that differed.

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

## Coverage Report

One row per confirmed bug class. Put the scope in the row, not in a footnote.

```text
| Bug class | Status | Mutants | Oracle | Scope | Method |
|---|---|---|---|---|---|
| precedence mismatch vs table | detected | 6/6 | table from docs/precedence.md | expressions ≤ 3 operators | Z3, `make check-precedence` |
| non-SyntaxError exception | detected | 3/3 | user-confirmed | all inputs ≤ 40 chars | bounded search |
| non-termination | unverified | 0/2 | user-confirmed | — | time box (60 min) ran out |
```

Avoid:

```text
The parser has no bugs. (Only for inputs up to length 3.)
```

## Ambiguity Wording

```text
The implementation treats timeout as fail-open for preview access, while the docs do not mention timeout behavior.
Should timeout deny access, allow access, or preserve the last known decision?
```

## Model/Implementation Mismatch Wording

A mismatch can go either way: the model reports a witness the implementation
does not show, or the model is green for a fix the implementation still fails.

Prefer:

```text
The model was green for "lock the org row with SELECT ... FOR UPDATE, then count".
The PostgreSQL test still admitted two members under REPEATABLE READ.
The model took the snapshot after the lock; PostgreSQL takes it when the
locking statement starts, before it waits. The model was corrected (RR_LOCK),
reproduces the same trace, and the fix is READ COMMITTED + FOR UPDATE or SERIALIZABLE.
```

Avoid:

```text
TLC passed, so the fix is correct.
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
