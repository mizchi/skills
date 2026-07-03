# Tool Selection

Use the question shape, not the tool name, as the primary selector.

## Quick Map

| Question shape | Use first | Good for | Avoid when |
| --- | --- | --- | --- |
| Pure predicate | Z3 | validators, feature flags, config, eligibility, equivalence | event order matters |
| Relation / graph | Alloy | RBAC, tenant isolation, ownership, workflow reachability, network reachability | fairness or long traces matter |
| State transition | TLA+ | retry, crash, queue, outbox, liveness, all interleavings | it is only a static relation |
| Message protocol | P | actor systems, typed events, request/response schedules, monitor assertions | pure math or config consistency |
| Sequential code contract | Dafny | pre/postconditions, loop invariants, ghost state | distributed protocol |
| MoonBit code contract | MoonBit prove | MoonBit validators, libraries, representation invariants | model witnesses or temporal traces are needed |
| Universal theorem | Lean 4 | inductive types, permission lattices, durable math lemmas | quick bug hunting |
| Mature proof ecosystem | Rocq | CompCert, Iris, mechanized semantics, low-level concurrency | fast domain counterexamples |
| Shared VC backend | Why3 | WhyML, multiple SMT backends, generated proof obligations | user-facing trace explanations |
| Rust code proof | Verus | Rust-shaped modules and ownership-sensitive invariants | non-Rust systems |
| C bounded checking | CBMC | C assertions, memory safety under unwind bounds | unbounded proofs |
| Symbolic security protocol | Tamarin / ProVerif | secrecy, authentication, key exchange, token protocols | ordinary app config or UI rules |

## Common Splits

| If torn between | Choose |
| --- | --- |
| Z3 vs Alloy | Z3 for input predicates; Alloy for entity/relation worlds |
| Alloy vs TLA+ | Alloy for structural holes; TLA+ when order/retry/crash creates the bug |
| TLA+ vs P | TLA+ for abstract protocol design; P for actor/event implementation models |
| Dafny vs MoonBit prove | Dafny for standalone verifier-oriented code; MoonBit prove for MoonBit packages |
| MoonBit prove vs Z3 | MoonBit prove for implementation contracts; Z3 for witness-producing spec checks |
| Lean vs Rocq | Lean for general math/type theorems; Rocq for ecosystem-specific proof work |

## Minimal Model Prompts

Use these prompts internally before coding:

```text
What are the observable inputs?
What result or state is observable?
What bad state should be unreachable?
What good state should be reachable?
What empty/missing/error/retry/crash case changes the answer?
What witness would convince a domain owner?
What command can run this check in CI?
```

## Tool-Specific Output Expectations

| Tool | Expected useful output |
| --- | --- |
| Z3 | SAT/UNSAT plus model witness for SAT |
| Alloy | small concrete instance or no instance within scope |
| TLA+ | named action trace or complete state-space success |
| P | event schedule and monitor assertion location |
| Dafny | verified obligations or source-level failed obligation |
| MoonBit prove | proved goals or proof obligation failure |
| Lean/Rocq | checked theorem or proof state/failure |
| Tamarin/ProVerif | attack trace or secrecy/authentication proof |
