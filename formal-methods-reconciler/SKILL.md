---
name: formal-methods-reconciler
description: Use when reconciling software specs, docs, tests, configs, code, logs, or incidents with formal methods. Helps Codex extract claims, decide whether docs or implementation are the source of truth, choose an appropriate tool such as Z3, Alloy, TLA+, P, Dafny, MoonBit prove, Lean, Rocq, Why3, Verus, CBMC, Tamarin, or ProVerif, build the smallest useful model, run or plan verifier checks, and translate SAT/UNSAT, traces, proof failures, or proof obligations into domain-language questions and regression guards.
---

# Formal Methods Reconciler

Use this skill to turn a vague correctness concern into a small formal-methods check and a domain-readable decision record.

The core stance: the LLM proposes and repairs candidate models; the solver, model checker, verifier, or proof assistant decides; the final result is translated back into domain language for a human decision.

This is the first-modeling and reconciliation skill. If a useful formal model,
CI verifier, expected result, or locked domain decision already exists and the
task is to keep it aligned with later spec/code/log changes, switch to
`formal-methods-drift-guard`.

## Workflow

1. **Choose the source of truth.**
   - If trusted specs/docs/ADRs/API contracts exist, treat them as the expected contract and compare code against them.
   - If specs are missing or unreliable, treat code/tests/config/logs as de-facto behavior, not as automatically correct.
   - If both disagree, do not decide alone. Produce a domain question.

2. **Extract claims before choosing a tool.**
   - Separate declared intent from implicit behavior.
   - Extract claims as: allowed, forbidden, eventually happens, never happens, equivalent, reachable, unreachable, preserves invariant.
   - Note empty/missing/error/timeout/retry/crash behavior explicitly.

3. **Classify the shape of the question.**
   - Pure predicate: input -> Bool.
   - Relation: user/role/resource/tenant/ownership/graph.
   - State transition: lifecycle, retry, crash, queue, eventual.
   - Message protocol: actors, typed events, request/response schedules.
   - Sequential code contract: pre/postconditions, loop invariants, representation invariants.
   - Universal theorem: unbounded inductive property or durable mathematical law.
   - Security protocol: adversarial message system, secrecy, authentication.

4. **Select the smallest appropriate tool.**
   - Read `references/tool-selection.md` when tool choice is non-trivial.
   - Prefer the smallest model that can produce a useful counterexample.
   - Do not use Lean/Rocq for fast config bug hunting. Do not use Z3 for temporal interleavings. Do not use TLA+ for simple predicate consistency.

5. **Build the minimum model.**
   - Strip I/O, frameworks, databases, and UI unless they define the property.
   - Model only observable values, state variables, actions, relations, and invariants needed for the claim.
   - Include positive sanity cases so a too-strong model is caught.
   - Include a broken variant when possible to prove the check is load-bearing.

6. **Run verifier feedback loops.**
   - Use compiler/verifier/model-checker output as the repair oracle.
   - Repair syntax and modeling mistakes first.
   - Never make a property weaker just to get green unless the domain decision changed.
   - Preserve counterexamples as witnesses for domain review.

7. **Reproduce the witness against the implementation.**
   - A counterexample from the model is a claim about the model, not yet about the code.
   - Write an implementation test that forces the witness: the same input, the same relation instance, or the same interleaving driven by barriers, injected crashes, or a stopped clock.
   - If the test fails the same way, the witness is a real bug and the test becomes the regression guard.
   - Run the fixed variant against the implementation too; a green model is also only a claim about the model.
   - If the implementation disagrees in either direction, treat it as a model bug first. Revisit the assumption that differs from the runtime (isolation level, lock semantics, retry policy, provider guarantee), fix the model, and rerun both.
   - When the model is small and trusted, keep it as a test oracle: replay model witnesses or model-checker traces as implementation test cases, or diff the implementation against an executable model.

8. **Translate results to domain language.**
   - Do not stop at `sat`, `unsat`, trace, or proof failure.
   - Say who can do what, which order is accepted, which config is dead, or which crash sequence loses data.
   - Use `references/domain-ledger.md` for output templates.

9. **Lock decisions.**
   - If the counterexample is intended, update docs/specs and add a regression guard for the clarified behavior.
   - If unintended, file/fix a bug and keep the model/check in CI.
   - If unclear, produce the minimal witness and a domain-owner question.

## Reporting Discipline

Keep domain uncertainty separate from execution uncertainty:

- Domain questions are part of the deliverable: undocumented empty values, missing fail-mode definitions, product-policy choices, or spec/code disagreements that need an owner decision.
- Self-report unclear points are only for things that prevented you from applying this skill correctly, such as missing repository access, an unavailable referenced file, ambiguous user scope, or a verifier you could not run.
- Do not mark an intentionally preserved domain question as a self-report unclear point. Put it in the ledger/domain-question section instead.
- If the user asked for a model/check plan and did not provide a runnable repo or verifier runtime, planning the exact check is sufficient. Label traces or SAT/UNSAT expectations as planned/hand-derived, not machine-confirmed, and do not count the absence of an actual run as an unclear point.
- If the user explicitly asked you to run the verifier and it is unavailable, then record that as a self-report unclear point or task blocker.

## LLM Role Boundary

Use the LLM for:

- claim extraction
- tool selection
- first-pass formalization
- counterexample explanation
- repair proposals
- domain-language wording

Do not use the LLM as:

- the source of truth for correctness
- the final judge of a proof
- a replacement for solver/model-checker/prover output
- a substitute for domain-owner decisions

## Research-Informed Patterns

Read `references/research-patterns.md` when designing or improving an automated workflow. Prefer:

- structured planning before formal code generation
- verifier-guided repair loops
- retrieval over repo context for repository-level work
- test/log/trace oracles for generated annotations
- subgoal decomposition for theorem proving
- explicit epistemic status for every claim

## Reference Implementations

Read `references/reference-implementations.md` for worked, runnable examples of
this workflow: one per eval scenario plus the playground use cases that show a
broken variant, a sanity case, an implementation reproduction, and a corrected
model assumption.

## Output Contract

Always aim to leave one of these artifacts:

- a formal check in the repo and a passing/failing command
- a counterexample witness translated into domain terms
- a regression guard candidate
- an implementation test that reproduces the witness, or a note that it did not reproduce and which model assumption was wrong
- a concise ledger entry: source, implementation observation, model question, machine result, witness, reproduction, domain question, decision, lock

If no formal model is worth building, say why and propose the cheaper check.
