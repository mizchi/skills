---
name: blast-radius
description: Use before shipping or approving a change whose diff looks small but whose effects may reach past it — "what could this break", "blast radius of X", "is this safe to merge", or a reviewer who does not trust a short diff. Finds breakage that grep does not show (library internals, timing, wire formats, DB columns, flags, other languages reading the same data) and proves the single fact the change is safe because of by running real code. Not for listing callers or for full code review.
---

# Blast radius

Find what a change breaks outside its diff, and prove why it is safe instead of arguing it.

Listing callers is not the job; grep does that in a second. A writeup that sounds right reads the same whether or not it is true, so the deliverable is a proof, not prose.

## Evidence levels

For each fact the change's safety depends on, push it as far down this list as is cheap and report where it stopped:

| Level | Evidence |
|---|---|
| 0 | Asserted. Worth nothing alone. |
| 1 | Pointed at: a real `file:line` in this repo or in the dependency's pinned source. |
| 2 | Argued: the failure walked step by step, and it does not reach. |
| 3 | Run: a script or test that calls the real code and fails loudly if the fact is false. |
| 4 | Reproduced in the running application. |

Level 3 is usually one small script that imports the same library version the app ships and calls the function in question.

## Steps

1. **Read the change.** The diff, the symbols it adds, changes and deletes, and what now behaves differently, including what the diff does not spell out (a default that moved, an ordering that changed, an error that is now swallowed). Read the PR and its commits.
2. **Find the one fact it is safe because of.** Most risky-looking changes are safe because of a single fact — "this call only evicts entries that are already dead", "this field is never read by the client". If the fact holds, most risks clear at once. Spend the time here, not on a long list of maybes.
3. **Look where grep stops.**
   - Dependency source at the pinned version, plus any local patch (`patches/`, `pnpm.patchedDependencies`, vendored copies).
   - Timing: microtasks, teardown and unmount order, retries, concurrent writers.
   - Data that leaves the process: JSON responses, DB columns, queue messages, files, caches, another language reading the same bytes.
   - Configuration: feature flags, environment-specific settings, generated code.
   - Consumers several hops downstream.
4. **Rate each risk honestly.** How likely and how costly. Keep confirmed risks; list checked-and-cleared ones separately. Cite a real `file:line`. A search that finds nothing is an answer — say what you searched. Never invent a caller or an API.
5. **Prove the one fact.** Write the level-3 script or test, run it, and paste the command and its output. Keep it so the reviewer can rerun it.
6. **For a wide change**, get an independent pass (a different model or a fresh subagent given the diff, not your conclusion) and merge only findings that it backs with a run. See `multi-agent-orchestration` for briefing.

## Output

- **What it does** — including the non-obvious part.
- **Safe because** — the one fact, its evidence level, and the proof (command + output). Write `unproven` if it stopped below level 3.
- **Risks** — each with how it breaks, `file:line`, likelihood and cost, and the cheapest check.
- **Cleared** — what was checked and why it is fine.
- **Before merge** — the cheapest test or repro that would catch the real bug, including the script from step 5.

Strip private paths, hostnames and credentials before the writeup goes anywhere public.

## Common mistakes

| Mistake | Instead |
|---|---|
| Returning a list of every caller | Find the one fact; callers are context, not findings |
| "The library handles this" without reading it | Read the pinned version's source and cite the line |
| Ten speculative risks of equal weight | Rate likelihood and cost; most belong under Cleared |
| Proof that mocks the code in question | Call the real function; a mock proves the mock |
| Stopping at level 2 because the argument is convincing | Convincing is the failure mode; run it |

## Related

- `oss-maintainer-review` — CI, dependency and execution-risk review of incoming PRs
- `formal-methods-reconciler` — when the fact is a state-space property tests cannot reach

Adapted from pstack `blast-radius` ([cursor/plugins](https://github.com/cursor/plugins/tree/main/pstack), MIT).
