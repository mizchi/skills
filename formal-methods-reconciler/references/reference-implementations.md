# Reference Implementations

Runnable examples of this workflow live in
[mizchi/formal-methods-playground](https://github.com/mizchi/formal-methods-playground)
under `usecases/`. Each one has a model, the commands and expected verdicts, a
reproduction against a small implementation where one exists, and a domain
ledger in the format of `domain-ledger.md`.

Use them as the expected shape of a finished result: read the one that matches
the question shape before building a new model, and compare the ledger you
produce against theirs.

## Eval Scenarios

| Eval task | Use case | Tool | Commands |
| --- | --- | --- | --- |
| `formal-reconciler-config-z3-001` (A) | [`campaign-targeting/`](https://github.com/mizchi/formal-methods-playground/tree/main/usecases/campaign-targeting) | Z3 (SMT-LIB) | `usecases/campaign-targeting/check.sh`; `node --test usecases/campaign-targeting/repro/targeting.test.ts` |
| `formal-reconciler-authz-alloy-001` (B) | [`tenant-authz/`](https://github.com/mizchi/formal-methods-playground/tree/main/usecases/tenant-authz) | Alloy 6 | `just check-alloy`; `node --test usecases/tenant-authz/repro/authz.test.ts` |
| `formal-reconciler-async-tla-p-001` (C) | [`idempotency-key/`](https://github.com/mizchi/formal-methods-playground/tree/main/usecases/idempotency-key) | TLA+ (TLC) | `just check-tla`; `IdempotentRetry_late.cfg` is scenario C's "record the key after the provider call" design |

The eval tasks are plan-only; the use cases run the check. When a plan-only
output predicts a verdict, it can be compared against these.

## Workflow Steps, Shown

| Step | Where it is shown | What to look at |
| --- | --- | --- |
| 1. Source of truth | `campaign-targeting/`, `tenant-authz/` | a "Docs (trusted) / observed" table before any model |
| 3-4. Question shape and tool | every use case | the "Split the question" table, including why the other tools add nothing |
| 5. Positive sanity case | `tenant-authz/` (`Sanity*` runs), `campaign-targeting/` (check 4) | a `SAT` run next to every `UNSAT` check |
| 5. Broken variant | `idempotency-key/` (`_late`, `_blocking`) | two broken variants that break *different* properties: one safety, one liveness |
| 5. Negative control on the fix | `tenant-authz/` | deleting the org check from the fix flips exactly the checks that rest on it |
| 5. Fix not copied from the property | `tenant-authz/` | `FixedCanRead` is written in the shape of the code, so `FixedMatchesDocs` compares two formulas |
| 7. Witness reproduced | `idempotency-key/repro/`, `tenant-authz/repro/`, `campaign-targeting/repro/` | one test per witness, failing on the observed code and passing on the fix |
| 7. Vacuous check found by reproducing | `campaign-targeting/` (check 9) | a fail-close test that passed with the guard deleted; the model gained a check |
| 7. Model corrected by the implementation | `write-skew-seat-limit/` (`RR_LOCK`) | a green model for REPEATABLE READ + `FOR UPDATE`; PostgreSQL still admitted two members; the model's snapshot timing was wrong |
| 7. Model as test oracle | `test-oracle/` | Z3 as the oracle for a resolver, TLC traces replayed as tests, a proven Lean function diffed against Rust |
| 8. Domain wording | every ledger | the `domain wording` and `domain question` rows |
| 9. Lock | every ledger | the `lock` row names a CI command |

## Other Question Shapes

| Shape | Use case |
| --- | --- |
| privilege escalation through a chain of relations | `iam-assume-role/` (Terraform plan JSON extracted into Alloy facts) |
| network reachability from infrastructure config | `terraform-reachability/`, `cloud-config-verification/` |
| a spoofable attribute in a priority chain | `trust-boundary/` (Z3) |
| two sides disagreeing on a wire encoding | `wire-contract/` (Z3) |
| payload compatibility in both deploy directions | `schema-evolution/` |
| convergence of replicas after offline edits | `offline-sync-convergence/` |
| one limit, two failure modes (racing workers, meaningless config) | `rate-limiting/` (TLA+ and Z3) |
| isolation-level write skew | `write-skew-seat-limit/` |
| a protocol run by untrusted peers | `p2p-game-cheat-detection/` |
| publish targets synthesized by a control plane | `route-snapshot-placement/` (Alloy) |
