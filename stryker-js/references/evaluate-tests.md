# Evaluate tests locally

Use Stryker as evidence about which defects the current tests detect. Start from the behavior/specification and inspect the mutant's observable effect; do not infer quality from coverage or the score alone.

## Establish scope and freshness

Select the full module whose tests you are reviewing, or run the configured suite for a baseline. A clean worktree diff has no targets. A test-only improvement requires a full affected-module rerun, because strict CI diff selection cannot evaluate unchanged production code.

```sh
pnpm test:mutation --mutate 'src/fee.ts'
pnpm test:mutation:summary reports/mutation/mutation.json
```

Keep normal and changed reports distinct (`mutation.json` vs `changed.json`). Pair a changed report with `changed-plan.json`. Check timestamps/revision and the current source/config; a report from before the latest test edit is stale. The changed-run helper removes old changed HTML/JSON before each run, including skips. A missing report after a failed run is not a successful measurement.

## Classify the evidence

| Outcome                        | Investigation / action                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Survived`                     | The mutated behavior passes all selected tests. Find an allowed input that distinguishes it; inspect weak assertions, missing boundaries, excessive mocks and missing state transitions. |
| `NoCoverage`                   | No selected test exercises the mutation. Add a reachable behavioral case, or investigate wrong config/related-test discovery.                                                            |
| `Timeout`                      | Inspect the mutant and logs. A mutated loop can be detected by timeout, but scheduling/resource delays are not evidence of assertion strength.                                           |
| `CompileError`, `RuntimeError` | Record separately. Investigate systematic integration failures; these mutants do not contribute to the score.                                                                            |
| `Ignored`                      | Record count and reason. Exclusions shrink the evaluated scope.                                                                                                                          |
| `Pending`                      | The measurement is incomplete; do not claim completion.                                                                                                                                  |
| `Killed`                       | At least one selected test failed. When evaluating one new test, confirm it exposes the intended defect; another test may have caused the kill.                                          |

For a survivor, formulate a concrete witness:

```text
Source: src/fee.ts, total >= 5000 changed to total > 5000
Contract: shipping is free at exactly 5000
Witness: total = 5000, express = false
Original result: 0; mutant result: 500
Gap: current inputs are only below/above the boundary
Action: equality-boundary regression, plus boundary-inclusive generator
```

Distinguish missing coverage from a weak oracle. Calling a function and checking only truthiness, shape, `not.toThrow`, or a snapshot unrelated to the return value can leave real behavior untested. Use expected externally observable results, effects or a separately implemented reference model. Avoid importing the implementation's helpers into its oracle.

If no permitted input distinguishes a survivor, identify the exact constraints and observable API that make it equivalent. Keep this explanation with the result. Do not silently delete tests, add `Stryker disable` comments or exclude mutation operators to improve the number. Any justified exclusion must disclose its reason and the resulting denominator change.

## Strengthen and rerun

Prefer the smallest regression proving the missing behavior, then extend with property-based testing where a domain has many relevant inputs or operation sequences. Show original pass, witness/mutant failure and the subsequent Stryker kill. Use a temporary isolated copy when manually applying a mutant, and preserve the user's worktree. A genuine defect in original code needs the normal Red → Green → Refactoring sequence; a test gap generally needs stronger tests without rewriting correct production logic.

For fast-check:

- Include zero, empty, equality and both sides of each boundary when allowed by the contract. A positive-only arbitrary can miss zero-length operations.
- Assert exact behavior or compare against an independent model. Stateful code needs operation sequences and intermediate-state/output checks, not only the final result.
- Make the mutation experiment reproducible with a fixed `seed` and an explicit `numRuns`; use a broader sample when it reveals unresolved behavior, without pretending random testing exhausts the domain.
- Let fast-check shrink failures (`endOnFailure: true` stops early and skips shrinking). Record seed, replay path, shrink count and minimal counterexample. Replay with `{ seed, path }`, preserve a focused regression, and rerun without pinning the property permanently to a single replay path.

The [shipping example](../assets/examples/shipping.test.ts) uses explicit boundary regressions and two specification cases in addition to randomized totals. Adjust the domain/specification before using it elsewhere. Property assertions detect mutations; shrinking happens when a failing property produces a counterexample. A passing mutation run alone does not show shrink output.

Stryker usually bails on the first failing test. `killedBy` is therefore evidence of a killer, not a ranking of every useful test. Use `--disableBail` only when that additional attribution matters and the runner supports it; do not label a test useless just because it is not listed as a killer in one partial run.

## Report the result

State the source revision/worktree, selected modules/ranges, runner/dependency versions, freshness and exclusions. Include total/valid counts and all statuses, the before/after score using the same scope/operators, and specific gaps fixed with file locations and witnesses. Report unresolved survivors/equivalence reasons, pending/errors/timeouts and next useful work separately. A threshold attained by excluding difficult mutants is not the same improvement as new assertions detecting them.

Use the summary JSON as an index, then open the relevant source, tests and HTML report. The summary includes each unresolved mutant's location, original source span, replacement and covering test names when reported. If the report omits test attribution, do not invent it.
