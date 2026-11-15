---
name: pi-coding-agent
description: Embed Pi in a Node script, configure its tools and sessions, write Pi extensions, or integrate through print/JSON/RPC modes. Covers the current @earendil-works/pi-coding-agent SDK, model runtime, resource loading and package distribution. Use for Pi SDK/extension work; ordinary interactive use needs no SDK integration.
---

# Pi coding agent

Use Node 24+. Checked 2026-11-16 against
`@earendil-works/pi-coding-agent@1.5.2` and the
[upstream SDK guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md).
The historical `@mariozechner/pi-coding-agent` package is a different, older
published generation (0.73.1). Keep an existing consumer pinned until its API
migration is tested; changing only the import scope does not migrate it.

## Install and create a session

```sh
pnpm add @earendil-works/pi-coding-agent
```

```ts
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent';

const { session } = await createAgentSession({
  cwd: process.cwd(),
  tools: ['read', 'grep', 'find', 'ls'],
  sessionManager: SessionManager.inMemory(),
});
const unsubscribe = session.subscribe((event) => {
  if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});
try {
  await session.prompt('Explain the files in this workspace');
} finally {
  unsubscribe();
  session.dispose();
}
```

Without overrides, the SDK discovers resources, settings and credentials and
creates persistent sessions. Pass `SessionManager.inMemory()` when disk history
is unwanted. Use a temporary `agentDir` and explicit resource loader for isolated
tests; do not let tests discover the user's installed extensions.

`tools` is a name/pattern selection in this SDK, not an array of tool instances.
The SDK binds built-ins to `cwd`. Older instructions passing `readOnlyTools` or
`createCodingTools(cwd)` into `tools` belong to the older API. Use
`customTools` or an extension for additional definitions. Inspect
`noTools`, `excludeTools` and the resolved declaration file before broadening an
existing allowlist.

## Model and credential runtime

```ts
import { ModelRuntime, createAgentSession } from '@earendil-works/pi-coding-agent';

const modelRuntime = await ModelRuntime.create();
// Optional override when the host explicitly supplies a credential:
// await modelRuntime.setRuntimeApiKey('anthropic', key);
const { session } = await createAgentSession({ modelRuntime });
```

`ModelRuntime` owns the current model/auth boundary. The old `AuthStorage.create`,
`ModelRegistry.create` and `authStorage` session option do not carry over by
renaming the package. Custom `authPath` and `modelsPath` can isolate a host's
configuration. Keep keys in the host's credential configuration or environment;
never print them in session logs. Check the selected provider's current settings.

## Extensions and resources

```ts
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'greet', label: 'Greet', description: 'Return a greeting',
    parameters: Type.Object({ name: Type.String() }),
    async execute(_id, params) {
      return { content: [{ type: 'text', text: `Hello ${params.name}` }], details: {} };
    },
  });
}
```

Load a one-off extension with `pi -e ./extension.ts`. Use the project's existing
`.pi/` configuration for persistent discovery, and `/reload` where the interactive
runtime supports it. Extensions execute host code; tool selection and lifecycle
hooks do not substitute for the host's authorization boundary.

SDK resources are configured through `DefaultResourceLoader`. Its current options
include `cwd`, `agentDir`, `systemPromptOverride`, `additionalExtensionPaths` and
`extensionFactories`; call `reload()` before supplying the loader. The
[isolated smoke test](assets/smoke/smoke.test.ts) shows a typed inline extension,
read-only built-in selection and session disposal without prompting a model.

For publishing and installation, read the current
[packages guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md).
Use `pi install -l` for project scope and `pi install` for user scope only when
that scope is intended. Pin npm/git sources for reproducibility. Put packages
Pi supplies at runtime in peerDependencies as documented by the resolved release;
ordinary runtime dependencies must be available after its production install.
Do not mechanically retain the old namespace in peer dependencies.

## Streaming, steering and completion

`session.prompt()` resolves when its run finishes. While streaming, choose
`session.steer(text)`, `session.followUp(text)`, or the explicit
`streamingBehavior` prompt option. Subscribe before starting work. The final
`message_end` is authoritative; deltas are incremental pieces. `agent_end` may
be followed by recovery or queued work, while `agent_settled` marks the end of
automatic work.

A runtime session replacement creates a different `AgentSession`; rebind
subscriptions after new/fork/resume operations. Dispose sessions when finished.
Do not assume assigning to internal agent state rewrites persisted conversation
history; use the session manager's supported operations.

## CLI and non-Node hosts

```sh
pi --print 'Summarize this repository'
pi --mode json 'Review this repository'
pi --mode rpc --no-session
```

Print mode returns final text. JSON mode streams JSONL events; it is not one JSON
result or a guarantee that the model reply has a particular schema. Inspect its
terminal events for model failure rather than relying only on process exit.
RPC is a long-lived JSONL command/response/event protocol, not a generic JSON-RPC
2.0 endpoint. A successful prompt response acknowledges acceptance, not run
completion; wait through `agent_settled`. Node hosts can use `RpcClient` and
`promptAndWait()` to avoid listener races. See
[CLI integration](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/cli-integration.md).

## Verify the consumer contract

```sh
pnpm --dir assets/smoke install --frozen-lockfile --ignore-scripts
pnpm --dir assets/smoke check
pnpm --dir assets/smoke test
```

The fixture tests current imports, a custom extension, explicit tool names, an
isolated model runtime and session disposal. It makes no model request. Consumer
types are checked with `skipLibCheck`: this does not certify every published
provider declaration (the current package has NodeNext JSON-import declaration
issues). Real provider authentication, prompt streaming and RPC behavior require
separate integration tests with the chosen model/runtime.
