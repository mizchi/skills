# Oracle, sensitivity, fidelity

Source: Kuniwak, "バイブ形式手法のハマりどころ2選" (2026-11-23), https://blog.kuniwak.com/entry/vibe-fm, and its experiment harness https://github.com/Kuniwak/vibe-fm-expt. This file restates the procedure for agents; read the article for the argument and the data.

## Why the three checks exist

Formal methods check every input, so the oracle (what counts as correct) must judge every possible behaviour, not a list of examples. People rarely write such an oracle, and an agent left to infer one from the code and tests produces one that is far too permissive. On top of that, a model can leave out behaviour the real system has, an environment assumption can be false, a contradictory premise proves anything, and an agent may close a proof with an axiom. Each of these widens the gap between the coverage the user believes in and the coverage the check gives.

## Bug-class checklist (step 1)

Use these as prompts; pick the classes that matter for the target, then confirm them with the user.

- **Quality characteristics** (ISO/IEC 25010 / JIS X 25010:2013): functional suitability, performance efficiency, compatibility, usability, reliability, security, maintainability, portability.
- **Safety and liveness**: safety — something bad never happens (no two processes in the critical section, no cross-tenant read); liveness — something good eventually happens (every request is answered, the queue drains). Any property of infinite behaviours is the intersection of a safety and a liveness property (Alpern and Schneider, "Defining liveness", IPL 21(4), 1985).
- **CWE-1000 pillars**: CWE-284 improper access control; CWE-435 improper interaction between correctly behaving entities; CWE-664 improper control of a resource through its lifetime; CWE-682 incorrect calculation; CWE-691 insufficient control flow management; CWE-693 protection mechanism failure; CWE-697 incorrect comparison; CWE-703 improper check or handling of exceptional conditions; CWE-707 improper neutralization; CWE-710 improper adherence to coding standards.
- **OWASP Top 10:2025**: broken access control; security misconfiguration; software supply chain failures; cryptographic failures; injection; insecure design; authentication failures; software or data integrity failures; security logging and alerting failures; mishandling of exceptional conditions.

How an inferred oracle misses classes (examples from the article):

| Inferred oracle | Misses |
|---|---|
| "no runtime type errors" | boundary inversions (`>` vs `<=`) |
| "no exceptions" | deadlock, livelock |
| "unauthenticated requests get 401" | forged or guessable tokens accepted |

## Confirming the oracle (step 3)

- Concrete cases: give inputs and ask whether each is a bug; compare with what the check says.
- Derived properties: ask the tool for counterexamples to properties the oracle should imply. A counterexample means the oracle is wrong or the property was not intended.

## Mutants (step 8)

- One bug per variant, of a named class. Reject variants that do not match their class.
- Detection: a counterexample, failed proof or failing reproduction on the variant that the original does not have.
- Time-box each repair. Report the class as unverified when the box runs out; do not keep extending.
- Mutants that someone other than the agent wrote are a stronger check than the agent's own.

## Fidelity (steps 6 and 9)

- A model or assumption narrower than reality hides bugs; wider only adds false alarms. Fairness and small scopes narrow.
- Strong fairness: a transition enabled infinitely often is taken infinitely often. Weak fairness: a transition enabled continuously from some point on is taken infinitely often. Results that need either hold only where the real scheduler provides it.
- Trace validation: log the implementation, then check that the model accepts the recorded traces.

## Vacuity and escapes (step 7)

- A contradiction in the premises, or a premise that is always false, makes every conclusion provable.
- Proof assistants can assume a statement: Lean `sorry` / `axiom` (see `#print axioms`), Isabelle `sorry` / `axiomatization`, Rocq `Admitted` / `Axiom`, Dafny `assume` / `{:axiom}`, Verus `assume` / `external_body`. `scripts/check_proof_escapes.py` flags them. In the article's port of CSP Prover from Isabelle to Lean, the agent added axioms the original did not have; the core became axiom-free only after an outside review (Kuniwak/lean-csp-prover PR #1). On the commit before that PR, the script reports 1,797 `axiom` declarations; on the current head it reports none, and the one raw `grep` hit there is inside a comment.

## What the experiment found

Claude Code (Opus 5.5) was asked to verify a JSDoc type-expression parser with almost no written oracle; 3 runs per condition, one repository, one model.

- Asked to "verify this repository has no bugs", every run eventually said it could not claim that. Sentence by sentence, though, claims rested on inferred oracles or on finite checks phrased as "for every input", and some asserted things nothing had checked. Of 200 audited "holds" claims, several were of these kinds.
- Following the procedure above (human-named bug classes, agent-built mutants, repair or "unverified") made claims more specific, and detection of the operator-precedence class rose from 0–3 of 6 groups to 3–6 of 6 in most runs. The final "detected" per class still read as broader than reality if the qualifier next to it was skipped.
- Condition B pasted mizchi's earlier formal-methods playbook gist (the predecessor of this skill), which has the agent infer the specification from the implementation. Those runs stated their limits before the final question, but 2 of 3 had more unsupported claims than any plain run. This comparison was made after the results were seen, so it is weak evidence; it is still the reason this skill now starts from named bug classes instead of claims extracted from code.
- Naming Lean as the tool coincided with narrower coverage than naming only "formal methods"; tools installed also differed, and n = 3.

Limit: classes nobody thought of stay unchecked whatever the method.
