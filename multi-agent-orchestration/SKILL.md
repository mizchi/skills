---
name: multi-agent-orchestration
description: Use when deciding whether to spawn subagents, choosing sequential vs fan-out vs supervisor vs debate vs dynamic DAG, designing a coding-agent workflow with write-scope isolation, or when extra agents may waste tokens without independent evidence. Trigger on multi-agent, orchestration, fan-out, worktree, blackboard, verifier, AgentTask, or "should I parallelize this".
---

# Multi-Agent Orchestration

Do not add agents. Add independently verifiable work: a dependency graph, parallel only on independent nodes, integrate through shared state and a verifier.

## When to use

- About to spawn 2+ subagents, a research fan-out, a debate/jury, or a "programmer + reviewer" pair
- Designing a coding-agent DAG, worktree split, or long-running parallel implementation
- Tempted to scale agent count because the task "feels hard"

When not to use:

- One tightly sequential transform (read → patch → test) with no independent parts
- Same model, same input, same tools, only the role name changes — run multiple turns on one agent instead

## Gate

Default to a **single agent**. Go multi only if **(1) or (2)** holds **and** (4) is positive.

**3 is not a reason to spawn.** It is how a multi run stops. A unit test the same agent can run is a success criterion, not a second agent. If 3 is weak, stay single or add a rubric/schema so artifacts become checkable — do not add agents to compensate.

1. Independent parts that can run in parallel — including parts that become independent after a short frozen contract artifact (types, HTTP shape, fixture). A call or runtime edge is not an automatic stay-single.
2. Agents would have different information, models, tools, or permissions
3. Intermediate artifacts checkable mechanically (tests, schema, provenance, oracle, lint). For research, schema-valid provenance is enough; do not invent a fake test oracle or switch to debate.
4. Expected gain of another agent beats its token / latency / error-propagation cost

If (1) and (2) are both weak, stay single even when (3) holds. Google's 260-config comparison: decomposable financial reasoning **+80.8%** vs single-agent; sequential planning **−70%**. No central verifier → errors propagate. Topology–task fit dominates agent count.

## Topology

| Pattern | Structure | Use for | Failure mode |
|---|---|---|---|
| Sequential | A → B → C | Clear transform pipeline | Upstream error cascades |
| Fan-out / Fan-in | Parallel workers, then merge | Research, candidates, independent tests | Duplicate work, weak merge |
| Supervisor–Worker | Manager decomposes, assigns, replans | Open-ended research / development | Manager bottleneck |
| Handoff | Ownership moves to the next specialist | Support, interactive routing | Unclear control and blame |
| Blackboard | Shared task board and artifacts | Long-running, async development | Stale state, write races |
| Debate / Jury | Independent answers, critique, vote | Hard-to-grade judgments | Correlated errors, sycophancy |
| Dynamic DAG | Roles, deps, parallelism chosen at run time | Difficulty varies widely | Graph generation itself is unreliable |
| Evolution / Search | Search over workflows | Many repeats of the same task class | Learning and eval cost |

Pick from the table's **Use for** column first. **Supervisor + Dynamic DAG + Blackboard + Verifier** is a kit for open-ended long-running work, not a mandatory stack. A known candidate set is Fan-out / Fan-in. One sequential file stays single.

Scale effort, not headcount. Anthropic Research: 1 agent for a lookup, 2–4 for a comparison, 10+ only for broad investigation (~15× chat tokens). Count **spawned parallel workers** against that band, not the parent integrator. At most one sequential verifier. Do not start five agents on an easy task.

Handoff vs agent-as-tool: handoff **owns the user reply**; agent-as-tool keeps a manager that **integrates**.

## Communication

Do not ship full conversation history. Pass only upstream artifacts, structured results (patch, evidence, tests, open questions), and provenance. Drop low-value memory; prune cheap or redundant agents at run time.

Same model + same input + same tools + different persona is not diversity. Errors correlate. Collect independent evidence, then verify: disjoint search, different tests or model families, static analysis vs execution, implementer vs adversarial verifier, private answers before votes.

## Briefing a worker

A worker sees only its kickoff. Rules that reach the parent through a slash command, an invoked skill or the session's working mode do not reach a subagent unless the kickoff carries them. Every kickoff states:

1. **The operator's goal**, then the task. A worker that knows only its slice optimizes the slice.
2. **The bar.** The success criteria in the kickoff are the whole bar: the worker adds no check, gate or review round above them. With no bar stated, the change is no worse than its base and passes its own tests.
3. **The working mode**, when the session runs in one (for example `mizchi-mode`: TDD required for every behavior change). Name the mode and the rules it changes; do not assume the worker can load the skill.
4. **Stop rules.** A worker cannot ask the user. It makes any choice it can undo and reports the choice and the reason. It stops only before a deploy, data deletion, a force-push to a shared branch or a message outside the run. In a mode that forbids guessing, an unclear point becomes an unresolved item in the report instead of a choice.
5. **Pointers, not payloads.** File paths and artifact refs, not pasted file bodies.

Give a retry, a fix round or a follow-up to a **fresh** agent with the original brief, every later directive and the previous agent's report. Resume an existing agent only when the work needs state that lives in it and is costly to move: its checkout, its uncommitted changes, or a process it still runs.

You own every worker's output. Read the diff and write your own summary; do not forward a worker's self-report as the result.

## Coding harness

Each task is a contract, not a chat turn:

```ts
type AgentTask = {
  id: string;
  objective: string;
  dependencies: string[];
  inputArtifacts: ArtifactRef[];
  allowedTools: string[];
  writeScope: string[];
  budget: { tokens: number; toolCalls: number; retries: number };
  successCriteria: Check[];
  outputSchema: Schema;
};
```

1. Router estimates the dependency DAG and write-sets
2. If write-sets are disjoint but a call/runtime edge remains, publish a frozen contract artifact so remaining deps are on that artifact, not on another worker's code. Then parallelize only nodes with no remaining **code** dep **and** disjoint write-sets. Stay single when the next edit needs the previous edit's actual code, or when both would write the same file.
3. Workers return patch + evidence + test results + unresolved items — not a transcript
4. Only an integrator writes the shared trunk
5. Verifier runs in a separate context, preferably a different model
6. Cap replans, agent count, tokens, and wall time
7. Stop on **verified success** or when expected value of another run ≤ cost
8. Store template, generated DAG, and execution trace as three separate artifacts

A worktree per agent postpones merge conflicts. Mediate writes, or keep write-sets disjoint and let the integrator apply. Tests and CI are the task queue; Git locks plus a progress file re-orient workers. If a stage has no independent observations, do not force parallelism.

Evaluate quality / cost / latency, not agent count. Under a **fixed token budget**, compare single-agent vs static DAG vs dynamic DAG before keeping a topology. Paper numbers are author-reported, not a substitute for that comparison.

## Common mistakes

| Excuse | Reality |
|---|---|
| "Name them programmer and reviewer" | Homogeneous role-play is often a single agent with extra KV-cache cost (OneFlow) |
| "Debate will fix the answer" | Closed debate adds no new evidence; correlated errors persist |
| "Always start a team of 5" | Easy tasks lose money; scale after a cheap router estimate |
| "Give everyone the full thread" | Context pollution, stale decisions, unclear who knew what |
| "There is a function call, so it cannot be parallel" | Freeze the callee's signature as an artifact; disjoint write-sets can still run together |
| "Worktrees mean we can ignore write-sets" | Conflicts are deferred, not removed |
| "More agents = more quality" | Sequential and tool-heavy tasks often get worse |
| "The worker has the same CLAUDE.md, it knows the rules" | Mode and slash-loaded skills are session state; put them in the kickoff |
| "Ask the worker to be thorough" | Without a stated bar it adds its own gates and review rounds; state the bar |
| "Resume the last worker for the fix, it has context" | Its context includes the wrong turn; start fresh unless it holds a checkout or a running process |

## Optional: Flue

Default deliverable is the orchestration plan above. Do **not** emit Flue code unless the user asked for it, or the repo already runs Flue (`'use agent'`, `@flue/runtime`). Mapping: [references/flue.md](references/flue.md)

## Related

- `superpowers:dispatching-parallel-agents` — how to dispatch once independence is established
- Grok `create-workflow` — executable DAG runtime when the graph should be a script, not a chat

Paper links and author-reported numbers: [references/sources.md](references/sources.md)
