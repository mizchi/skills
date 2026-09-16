# Research-Informed Patterns

Last reviewed: 2026-07-03.

The practical trend is not "LLM writes the final formal spec." The trend is "LLM proposes structured candidates; formal tools verify; counterexamples repair; humans decide domain intent."

## Patterns to Prefer

### Structured Planning Before Formal Code

Before generating a model, extract:

- entities
- variables
- states
- actions
- invariants
- fairness assumptions
- error/retry/crash cases

PAT-Agent follows this style: planning LLM, code-generation LLM, model checker, and counterexample repair loop.

Source: https://arxiv.org/html/2509.23675v1

### Verification-Guided Repair

Use the verifier as the oracle. Feed back:

- syntax errors
- type errors
- failed proof obligations
- model-checker traces
- SAT witnesses

Repair the model/check. Do not silently weaken the property.

Useful examples:

- SpecGen combines LLM generation with verifier feedback and mutation/selection.
- APOLLO repairs Lean proofs using compiler/solver-guided refinement.

Sources:

- https://arxiv.org/html/2401.08807v5
- https://arxiv.org/html/2505.05758v5

### Specification Mining From Examples

When no trustworthy spec exists, mine candidate temporal properties from:

- desired traces
- undesired traces
- logs
- tests
- incident reproductions

Treat mined specs as hypotheses. Confirm them with domain owners.

Source: https://arxiv.org/abs/2501.16274

### Tests as Oracles for Generated Contracts

When generating pre/postconditions or invariants, use existing tests and assertions to reject bad generated specs. Tests are not the proof, but they can catch mistranslations and vacuous contracts.

Source: https://arxiv.org/html/2601.12845v1

### Invariant Synthesis as Assistance

LLMs can propose loop invariants, but useful invariants must be both true and strong enough to prove the final assertion. A weak invariant that verifies itself but proves nothing is not useful.

Source: https://arxiv.org/html/2509.21629v2

### Repository-Level Retrieval

For repo-scale proof work, retrieve local definitions, specs, lemmas, APIs, tests, and module dependencies. Function-level prompting alone misses global context.

Source: https://arxiv.org/html/2509.25197v1

### Subgoal Decomposition for Proof Assistants

For Lean/Rocq/TLAPS, prefer subgoal decomposition and library search over whole-proof generation. Have the prover check every step.

Sources:

- https://arxiv.org/abs/2504.21801
- https://arxiv.org/html/2501.03073v1
- https://arxiv.org/html/2512.09758v1

### Epistemic Status Tracking

Track whether each claim is:

- documented requirement
- implementation observation
- inferred behavior
- generated hypothesis
- machine-checked contract
- domain-approved decision

Do not collapse these categories.

Source: https://arxiv.org/html/2601.21116

## Anti-Patterns

- Natural-language requirement directly to final formal model.
- Green proof without positive sanity checks.
- No broken variant or load-bearing check.
- LLM-generated spec treated as authoritative.
- Counterexample explained only in tool syntax.
- Domain owner asked to review SAT/UNSAT instead of business meaning.
- Repository-level proof attempted without retrieving local context.
