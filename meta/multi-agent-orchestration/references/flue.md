# Flue mapping (optional)

Read this file **only** when the user asked for Flue code, or the repo already has `'use agent'` modules / `@flue/runtime`. Otherwise stop at the orchestration plan in `SKILL.md`.

Flue 2.0 (see [flueframework.com](https://flueframework.com/) and [Workflows](https://flueframework.com/docs/guide/workflows/)): a workflow is a **TypeScript program that drives agents**. There is no `defineWorkflow`. Do not import it.

The parent script owns the DAG. `useSubagent` is model-driven delegation — use it only when the parent is an open-ended conversational supervisor. For a known candidate set, write `start` / `init` / `dispatch` / `read` / `Promise.all`.

## Topology → Flue

| Skill topology | Flue shape |
|---|---|
| single | One `'use agent'` module. `flue run src/agents/<name>.ts --message "..."` or one `init().dispatch()` + `read()`. Multiple turns, same `--id`. |
| Sequential | Script: `await read(dispatch(A))` then `dispatch(B, { artifacts from A })`. Not three `useSubagent` personas. |
| Fan-out / Fan-in | Script freezes the contract in **code**, `Promise.all` of `init(Worker).dispatch()`, mechanical merge if write-sets are disjoint, then `init(Verifier)`. |
| Supervisor–Worker | Conversational parent with `useSubagent({ name, description, agent })`. Child prompts must be self-contained. Cap declared delegates; do not mount `GeneralSubagent` as a way to spawn 10. |
| Handoff | `dispatch(Specialist, { id })` and **stop talking on the previous agent**. Specialist owns the user reply. |
| Blackboard | Shared `useSandbox` files (parent and `useSubagent` children already share the sandbox). Script-driven workers: same workspace path, disjoint writeScopes in the prompt. `usePersistentState` is instance-scoped — not a cross-worker board. |
| Debate / Jury | Usually refuse. If you must: private `dispatch` per worker, then a verifier agent that never sees other votes until after its own `dispatch`. |
| Dynamic DAG | Script replans (new `dispatch` set) after a verifier fail. Do not let the model invent the graph via `task`. |
| Verifier | Separate **exported** agent, `useModel` different from workers, fresh `id`. Sequential after merge. |
| Integrator | TypeScript in the parent script when merge is mechanical (disjoint patches). An LLM integrator only when merge needs judgment. |

## Hard rules

- Never generate `defineWorkflow`, `defineAgent`, `createAgent`, or `defineAgentProfile`. Those are gone in 2.0.
- Register agents with `'use agent'` at the top of the file and an **exported capitalized** function. Unexported functions are subagent delegates only.
- `useModel` exactly once per exported agent. Delegates inherit the parent model unless `defineSubagent({ model })` overrides.
- Coding workers: `useSandbox(local())` from `@flue/runtime/node`. No sandbox ⇒ no bash/read/write.
- Enforce `writeScope` in the **prompt** (Flue has no native write-set). The script rejects a reply that touches files outside it.
- Pass artifacts in the dispatch body (JSON), not conversation history. Bare string `dispatch('...')` is a user message; prefer `{ message: { kind: 'user', body } }` when the body is structured.
- `dispatch()` is enqueue-only. Await `read(receipt)`. Checkpoint `receipt` if the host is Cloudflare Workflows / Inngest / Temporal.
- Count spawned parallel **worker agents**, not the parent script. At most one sequential verifier agent.

## Generate this, in order

1. Gate + topology from `SKILL.md` (if single → one agent module + `flue run`, stop).
2. Frozen contract as a TypeScript value in the driver (not an extra agent).
3. One worker module per disjoint writeScope.
4. Driver script: `start({ agents })` → fan-out → merge → verifier.
5. Optional: Cloudflare Workflow / Inngest wrapper that `step.do`s dispatch and read separately.

## Example: fan-out after a frozen contract

Three disjoint files, call/runtime edges only. Parent script is router + integrator.

`src/agents/csv-serializer.ts`:

```ts
'use agent';
import { useModel, useSandbox } from '@flue/runtime';
import { local } from '@flue/runtime/node';

export function CsvSerializer() {
  useModel('anthropic/claude-sonnet-4-6');
  useSandbox(local());
  return [
    'Implement only src/export/csv.ts.',
    'The user message is JSON: { contract, writeScope, outputSchema }.',
    'Stay inside writeScope. Return JSON: { patch, evidence, testResults, unresolved }.',
    'Do not write other files. Do not return a transcript.',
  ].join('\n');
}
```

`src/agents/export-verifier.ts` — same shape, **different** `useModel`, instruction: run lint + tests + Playwright; return `{ pass, commands, blockingFailures }`; do not patch.

`scripts/csv-export.ts`:

```ts
import { init } from '@flue/runtime';
import { start } from '@flue/runtime/node';
import { CsvSerializer } from '../src/agents/csv-serializer.ts';
import { HttpHandler } from '../src/agents/http-handler.ts';
import { E2eSpec } from '../src/agents/e2e-spec.ts';
import { ExportVerifier } from '../src/agents/export-verifier.ts';

const contract = {
  serializer: { module: 'src/export/csv.ts', export: 'toCsv', input: 'Row[]', output: 'string' },
  http: { method: 'GET', path: '/export.csv', contentType: 'text/csv' },
};

async function runWorker(
  agent: typeof CsvSerializer,
  id: string,
  writeScope: string[],
) {
  const handle = init(agent, { id });
  const receipt = await handle.dispatch({
    message: {
      kind: 'user',
      body: JSON.stringify({ contract, writeScope, outputSchema: 'WorkerResult' }),
    },
    idempotencyKey: id,
  });
  const reply = await handle.read(receipt);
  return { id, text: reply.text, receipt };
}

await using _flue = await start({
  agents: [CsvSerializer, HttpHandler, E2eSpec, ExportVerifier],
});

const workers = await Promise.all([
  runWorker(CsvSerializer, 'csv', ['src/export/csv.ts']),
  runWorker(HttpHandler, 'handler', ['src/routes/export.ts']),
  runWorker(E2eSpec, 'e2e', ['e2e/export.spec.ts']),
]);

// Integrator = this script. Apply patches iff files ⊆ writeScope and do not overlap.
// Then:
const verifier = init(ExportVerifier, { id: 'verify' });
const vReceipt = await verifier.dispatch({
  message: {
    kind: 'user',
    body: JSON.stringify({ contract, workerIds: workers.map((w) => w.id) }),
  },
});
const verified = await verifier.read(vReceipt);
if (!verified.text.includes('"pass":true')) throw new Error('verifier failed');
```

Single-agent stop: do not write this fan-out. One module + `flue run src/agents/fix.ts --message "..."`.

## Durable host (optional)

On Cloudflare Workflows, split send and wait so a crash does not double-prompt:

```ts
const receipt = await step.do('dispatch-csv', () =>
  init(CsvSerializer, { id: 'csv' }).dispatch({ message: { kind: 'user', body } }),
);
const reply = await step.do('read-csv', () =>
  init(CsvSerializer, { id: 'csv' }).read(receipt),
);
```

Same split for Inngest `step.run` and Temporal activities.

## Common Flue mistakes

| Excuse | Reality |
|---|---|
| `defineWorkflow` / `src/workflows/` | Removed in 2.0. The driver script is the workflow. |
| Parent `useSubagent` for a known 3-file fan-out | The model owns the graph. Put the graph in `Promise.all`. |
| Three delegates, same sandbox, same prompt, names programmer/reviewer/tester | Homogeneous role-play. |
| Integrator agent that re-reads all transcripts | Merge disjoint patches in TypeScript. |
| `usePersistentState` as a cross-worker blackboard | Instance-scoped. Use sandbox files or the driver. |
