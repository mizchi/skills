---
name: formal-methods-reconciler
description: Use when reconciling software specs, docs, tests, configs, code, logs, or incidents with formal methods, or when asked to "verify there are no bugs" with Lean, TLA+, Alloy, Z3 or similar. Starts from user-confirmed bug classes instead of an oracle inferred from the code, decides whether docs or implementation are the source of truth, chooses a tool such as Z3, Alloy, TLA+, P, Dafny, MoonBit prove, Lean, Rocq, Why3, Verus, CBMC, Tamarin, or ProVerif, builds the smallest useful model with its assumptions written down, rules out vacuous proofs and sorry/axiom escapes, measures which bug classes the check detects with mutants, tests model fidelity, and reports each claim with its oracle, scope and method in domain language.
---

# Formal Methods Reconciler

Use this skill to turn a vague correctness concern into a small formal-methods check and a domain-readable decision record.

The core stance: the LLM proposes and repairs candidate models; the solver, model checker, verifier, or proof assistant decides; the final result is translated back into domain language for a human decision.

The main failure is a gap between the coverage the user believes they got and the coverage the check actually gives. A tool's verdict is only as strong as three things around it, and each has its own step below:

- **The oracle** — what counts as a bug. If nobody states it, the agent infers one from the code and tests, and an inferred oracle is usually far too permissive (it accepts the implementation's own bugs). Steps 1 and 3.
- **Sensitivity** — which bugs the check would actually catch. Measure it with mutants. Step 8.
- **Fidelity** — whether the model and its environment assumptions (fairness, constants, other systems) include every behaviour the real system has. A model narrower than reality misses bugs; a wider one only adds false alarms. Steps 6 and 9.

Background and the experiment behind this: `references/oracle-sensitivity-fidelity.md`.

This is the first-modeling and reconciliation skill. If a useful formal model,
CI verifier, expected result, or locked domain decision already exists and the
task is to keep it aligned with later spec/code/log changes, switch to
`formal-methods-drift-guard`.

## Workflow

1. **Name the bug classes first (verbalize the oracle).**
   - Before modeling, list the kinds of bugs and vulnerabilities the check must catch. Ask the user for them, or propose a list from `references/oracle-sensitivity-fidelity.md` (quality characteristics, safety vs liveness, CWE pillars, OWASP Top 10) and get it confirmed. A request like "prove this repo has no bugs" names no oracle; do not silently invent one.
   - When the request already names a concrete concern ("can a viewer read another tenant's project", "is the retry idempotent"), that concern is the bug class: record it and continue. When nobody can confirm (an eval, a subagent, an unattended run), write the proposed classes down, mark them **proposed, not confirmed**, and continue; do not stop to wait.
   - Record a quality target: which classes may stay unverified. Expect to lower it later; say so when you do.
   - Classes you could not think of are not covered by anything. Say that in the final report.

2. **Choose the source of truth.**
   - If trusted specs/docs/ADRs/API contracts exist, treat them as the expected contract and compare code against them.
   - If specs are missing or unreliable, treat code/tests/config/logs as de-facto behavior, not as automatically correct. An oracle derived from them is **inferred**: label it so everywhere it is used.
   - If both disagree, do not decide alone. Produce a domain question.

3. **Extract claims, then confirm what the check counts as a bug.**
   - Separate declared intent from implicit behavior.
   - Extract claims as: allowed, forbidden, eventually happens, never happens, equivalent, reachable, unreachable, preserves invariant. Sort them into safety (something bad never happens) and liveness (something good eventually happens); between them they describe any property of infinite behaviours.
   - Note empty/missing/error/timeout/retry/crash behavior explicitly.
   - For each bug class from step 1, explain in domain words what the check will treat as a bug, and confirm it two ways: concrete inputs the user agrees are bugs / not bugs, and a counterexample search for properties that should follow from the oracle (for an `add`: commutative, `x + 0 = x`, associative). A too-strict oracle rejects intended behaviour; a too-loose one accepts bugs.

4. **Classify the shape of the question.**
   - Pure predicate: input -> Bool.
   - Relation: user/role/resource/tenant/ownership/graph.
   - State transition: lifecycle, retry, crash, queue, eventual.
   - Message protocol: actors, typed events, request/response schedules.
   - Sequential code contract: pre/postconditions, loop invariants, representation invariants.
   - Universal theorem: unbounded inductive property or durable mathematical law.
   - Security protocol: adversarial message system, secrecy, authentication.

5. **Select the smallest appropriate tool.**
   - Read `references/tool-selection.md` when tool choice is non-trivial.
   - Prefer the smallest model that can produce a useful counterexample.
   - Do not use Lean/Rocq for fast config bug hunting. Do not use Z3 for temporal interleavings. Do not use TLA+ for simple predicate consistency.
   - A tool the user names is a preference, not a fit check. If the question's shape needs another tool, say so; in the experiment cited in the reference, runs told to use Lean covered fewer bug classes than runs told only "formal methods" (3 runs each, not separated from the tools installed).

6. **Build the minimum model, and write down what it assumes.**
   - Strip I/O, frameworks, databases, and UI unless they define the property.
   - Model only observable values, state variables, actions, relations, and invariants needed for the claim.
   - Include positive sanity cases so a too-strong model is caught.
   - List every environment assumption: constants, bounds (small-scope limits in Alloy, finite input lengths), fairness, the behaviour of other systems. Fairness and bounds narrow the behaviours checked; a liveness result proved under fairness holds only where the real scheduler is fair.

7. **Run verifier feedback loops, and rule out vacuous success.**
   - Use compiler/verifier/model-checker output as the repair oracle.
   - Repair syntax and modeling mistakes first.
   - Never make a property weaker just to get green unless the domain decision changed.
   - Preserve counterexamples as witnesses for domain review.
   - A contradictory or always-false premise proves anything. Check that assumptions are satisfiable on their own (Z3: `check-sat` on the assumptions alone; Alloy: `run` the facts with no property and get an instance; TLA+: confirm the spec has behaviours that reach the states the invariant talks about).
   - Run `scripts/check_proof_escapes.py <root>`: it fails on `sorry`, `admit`, `axiom`, `Admitted`, `axiomatization`, Dafny `assume` / `{:axiom}`, Verus `assume(` / `external_body`, F* `admit`, Agda `postulate`. Agents do add axioms to get a proof through, not only `sorry`. In Lean also run `#print axioms <theorem>` for every theorem you report.

8. **Measure sensitivity with mutants.**
   - For each bug class from step 1, make variants of the implementation (or of the design, when the code does not exist yet) that each contain one bug of that class. Check that each variant is really a bug of that class before using it.
   - Run the same check on every variant. A class is **detected** only if each of its variants yields a counterexample, a failed proof, or a failing reproduction that the original does not.
   - If a class is not detected, fix the check or the oracle within a time box, then rerun. A proof can stay open indefinitely without telling you whether it is false, unprovable or just unfinished, so the time box is what ends the attempt. When it runs out, mark the class **unverified**, look for another way to catch it, or lower the quality target.

9. **Reproduce the witness against the implementation.**
   - A counterexample from the model is a claim about the model, not yet about the code.
   - Write an implementation test that forces the witness: the same input, the same relation instance, or the same interleaving driven by barriers, injected crashes, or a stopped clock.
   - If the test fails the same way, the witness is a real bug and the test becomes the regression guard.
   - Run the fixed variant against the implementation too; a green model is also only a claim about the model.
   - If the implementation disagrees in either direction, treat it as a model bug first. Revisit the assumption that differs from the runtime (isolation level, lock semantics, retry policy, provider guarantee), fix the model, and rerun both.
   - When the model is small and trusted, keep it as a test oracle: replay model witnesses or model-checker traces as implementation test cases, or diff the implementation against an executable model.
   - Test fidelity in the other direction too: record traces from the real system (logs, E2E runs) and check that the model accepts them (trace validation). A real trace the model rejects is a behaviour the model left out.

10. **Translate results to domain language.**
    - Do not stop at `sat`, `unsat`, trace, or proof failure.
    - Say who can do what, which order is accepted, which config is dead, or which crash sequence loses data.
    - Use `references/domain-ledger.md` for output templates.

11. **Lock decisions.**
   - If the counterexample is intended, update docs/specs and add a regression guard for the clarified behavior.
   - If unintended, file/fix a bug and keep the model/check in CI.
   - If unclear, produce the minimal witness and a domain-owner question.

## Reporting Discipline

**Every claim carries its own scope, in the same sentence.** A reader who stops after the claim must not come away believing more than was checked. In the experiment cited in the reference, agents usually stated the real limits somewhere in the message, yet individual sentences said "holds for every input" about a check of short inputs from a small alphabet, or asserted "the function is pure" and "the Lean model mirrors the code" without testing either. For each "holds", "proved", "is a bug" or "detected", state:

- **oracle**: given by the user / taken from a named document / inferred from the code
- **scope**: unbounded, or the exact bound (input length ≤ 3, 4 processes, Alloy scope 5)
- **method**: machine-checked (tool and command) / bounded search / hand argument / not checked

Report per bug class from step 1 as **detected** (with the mutants that showed it) or **unverified**, never as a blanket "no bugs". Do not state properties of the code or the model that nothing checked; either check them or list them as assumptions.

Keep domain uncertainty separate from execution uncertainty:

- Domain questions are part of the deliverable: undocumented empty values, missing fail-mode definitions, product-policy choices, or spec/code disagreements that need an owner decision.
- Self-report unclear points are only for things that prevented you from applying this skill correctly, such as missing repository access, an unavailable referenced file, ambiguous user scope, or a verifier you could not run.
- Do not mark an intentionally preserved domain question as a self-report unclear point. Put it in the ledger/domain-question section instead.
- If the user asked for a model/check plan and did not provide a runnable repo or verifier runtime, planning the exact check is sufficient. Label traces or SAT/UNSAT expectations as planned/hand-derived, not machine-confirmed, and do not count the absence of an actual run as an unclear point.
- If the user explicitly asked you to run the verifier and it is unavailable, then record that as a self-report unclear point or task blocker.

## LLM Role Boundary

Use the LLM for:

- proposing bug classes and quality targets for the user to confirm
- claim extraction
- writing mutants and explaining what each one breaks
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
- the author of the oracle, unless the user confirmed it

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
- a concise ledger entry: bug class, oracle source, source, implementation observation, model question, assumptions, machine result, scope, sensitivity, witness, reproduction, domain question, decision, lock
- a per-class table: bug class, detected / unverified, mutants used, scope, method

If no formal model is worth building, say why and propose the cheaper check.

When no repository was given, write runnable artifacts to a temporary directory, list their paths, and say where they would go in a repository.

## Designing for verification

When the spec, design or code does not exist yet, the cost of a check can be chosen instead of paid. Ask which oracle would rule out the bug classes from step 1, and prefer representations whose behaviour is easy to state: composed state machines, a single store with pure reducers, pre/postcondition pairs, small bounded domains instead of unbounded arithmetic. Then write the oracle, confirm it with examples and counterexample searches (step 3), and measure it with mutants (step 8) before the implementation grows around it. Existing natural-language specs and ad-hoc state usually make checks weaker or more expensive; say which applies.
