---
name: pi-coding-agent
description: Use when embedding the @mariozechner/pi-coding-agent npm package as a coding-agent runtime in your own Node.js scripts, CLIs, or services — or when writing pi extensions (plugins), bundling them as pi packages, or installing third-party packages with `pi install`. Covers minimal session setup, the cwd × tools factory trap, custom-tool registration with TypeBox, the extension factory shape (`pi.registerTool` / `pi.registerCommand` / `pi.on`), where pi auto-discovers extensions, packaging via the `pi` field in `package.json`, installing from npm/git/local, the `peerDependencies` rule for shared core packages, one-shot "print mode" pipelines, and SDK vs `pi --mode rpc` for non-Node hosts.
---

# pi-coding-agent

`@mariozechner/pi-coding-agent` ([upstream](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)) ships both the `pi` interactive TUI and a first-class SDK. With the SDK you can spawn an agent session from any Node 20.6+ script, stream its output, scope its tools, and bolt on your own tools — without forking the CLI.

## When to use

- Building a single-purpose agent CLI in TypeScript / Node (not a chat product)
- Wrapping pi inside a larger Node service or job runner
- Embedding agent reasoning into a script pipeline (one-shot, exit on done)
- You need read-only or domain-restricted tool sets
- You want to add custom tools (`deploy`, `query_db`, …) the agent can call

Skip this skill if:

- You just want to use pi interactively → run `pi` from the CLI, no SDK needed
- Your host is not Node — use `pi --mode rpc` (JSON-RPC over subprocess) instead
- You want Anthropic's official SDK semantics → that is `@anthropic-ai/claude-agent-sdk`, a different package

## Pitfalls (read first)

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_PACKAGE_PATH_NOT_EXPORTED` from `require()` | Package is ESM-only (`"type": "module"`, `exports` map without CJS) | Use ESM (`import`) or run with `tsx` / `--experimental-strip-types` |
| Tools resolve paths against the wrong directory | Pre-built `readTool` / `bashTool` capture `process.cwd()` at import | When passing a custom `cwd` AND explicit `tools`, use the factory form `createCodingTools(cwd)` / `createReadTool(cwd)` |
| `session.prompt(...)` throws "stream in progress" | Calling `prompt()` again while the previous stream is still running | Pass `{ streamingBehavior: "steer" }` or `"followUp"`, or use `session.steer()` / `session.followUp()` |
| Auth errors with `ANTHROPIC_API_KEY` set | `AuthStorage` reads runtime overrides → `auth.json` → env in that order; a stale `~/.pi/agent/auth.json` can shadow your env | Either clear the stored credential, or call `authStorage.setRuntimeApiKey("anthropic", key)` before `createAgentSession()` |
| Nothing printed during streaming | You forgot to subscribe, or you only handle `text_delta` and the model is in thinking-only output | Subscribe to `message_update`, handle both `text_delta` and (optionally) `thinking_delta` |
| Extension only loads with `pi -e ./ext.ts`, not from regular runs | `-e` is a one-off; the file is not in an auto-discovery directory | Move it to `~/.pi/agent/extensions/<name>.ts` (global) or `<project>/.pi/extensions/<name>.ts` (project), or register it in `settings.json` `extensions: [...]` |
| Installed pi package fails at runtime with `Cannot find module '@mariozechner/pi-coding-agent'` | Listed it in `dependencies` instead of `peerDependencies` | The five core packages (`@mariozechner/pi-{ai,agent-core,coding-agent,tui}`, `typebox`) MUST be in `peerDependencies` with range `"*"` and not bundled — pi provides them at load time |
| `pi install` succeeded but a transitive dep is missing | `npm install --omit=dev` is used by default, so `devDependencies` are not present at runtime | Move the import to `dependencies`, or set `npmCommand` in `settings.json` if you need a custom npm wrapper |
| Extension changes do not take effect | The TUI cached the previous load | Run `/reload` inside pi (works for any extension in an auto-discovered location) |

## Install

```sh
pnpm add @mariozechner/pi-coding-agent
# Or one-off scripts:
npx tsx my-agent.ts
```

Requires Node ≥ 20.6 and an API key (env var or `~/.pi/agent/auth.json`).

## Minimal session

```ts
#!/usr/bin/env -S npx tsx
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSession,
} from "@mariozechner/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(), // no .jsonl on disk
  authStorage,
  modelRegistry,
});

session.subscribe((event) => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt(process.argv.slice(2).join(" ") || "Hello");
```

Run:

```sh
export ANTHROPIC_API_KEY=sk-ant-...
npx tsx my-agent.ts "Explain the layout of src/"
```

`createAgentSession()` with no options also works — it discovers tools, skills, extensions, and a default model from `~/.pi/agent/` and the cwd. Pass options only when you need to deviate from those defaults.

## Restricting the toolset

The SDK exposes both built-in tool arrays and string-name selection. Use whichever is more readable.

```ts
import { createAgentSession, readOnlyTools } from "@mariozechner/pi-coding-agent";

// Array of tool objects (use process.cwd())
await createAgentSession({ tools: readOnlyTools });

// Or by name — equivalent, more concise
await createAgentSession({ tools: ["read", "grep", "find", "ls"] });
```

Tool name catalog: `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`. Pre-bundled sets:

| Set | Contents |
|---|---|
| `codingTools` | `read`, `bash`, `edit`, `write` (default) |
| `readOnlyTools` | `read`, `grep`, `find`, `ls` |

### The cwd × tools trap

The pre-built tool **instances** (`readOnlyTools`, `codingTools`, `readTool`, `bashTool`, …) capture `process.cwd()` at import time and do **not** rebind. Combine them with a custom `cwd` and the agent silently reads the wrong directory.

Three combinations to remember:

| Form | With custom `cwd` | Why |
|---|---|---|
| `tools: readOnlyTools` (constants) | **NG** | Captured `process.cwd()` at import time |
| `tools: ["read", "grep", ...]` (string names) | **OK** | SDK resolves names per session against the supplied `cwd` |
| `tools: createReadOnlyTools(cwd)` (factories) | **OK** | You bind cwd explicitly |
| `tools` omitted | **OK** | SDK picks the default set and binds `cwd` for you |

The factory family mirrors every constant/instance — pick by need:

| You want… | Factory |
|---|---|
| `codingTools` set bound to cwd | `createCodingTools(cwd)` |
| `readOnlyTools` set bound to cwd | `createReadOnlyTools(cwd)` |
| Just one tool bound to cwd | `createReadTool(cwd)`, `createBashTool(cwd)`, `createEditTool(cwd)`, `createWriteTool(cwd)`, `createGrepTool(cwd)`, `createFindTool(cwd)`, `createLsTool(cwd)` |

```ts
import {
  createAgentSession,
  createCodingTools,
  createReadOnlyTools,
  createGrepTool,
  createReadTool,
} from "@mariozechner/pi-coding-agent";

const cwd = "/path/to/project";

// Whole set, bound to cwd
await createAgentSession({ cwd, tools: createCodingTools(cwd) });
await createAgentSession({ cwd, tools: createReadOnlyTools(cwd) });

// Or hand-picked, bound to cwd
await createAgentSession({ cwd, tools: [createReadTool(cwd), createGrepTool(cwd)] });

// Or — equivalent and shorter — name-based, which the SDK rebinds per session
await createAgentSession({ cwd, tools: ["read", "grep", "find", "ls"] });
```

You only need to think about this when you pass **both** a non-default `cwd` **and** an explicit `tools` value. Omit `tools` entirely and the SDK builds the default set bound to `cwd` for you.

## Custom tools

```ts
import { Type } from "typebox";
import { createAgentSession, defineTool } from "@mariozechner/pi-coding-agent";

const deployTool = defineTool({
  name: "deploy",
  label: "Deploy",
  description: "Deploy the current branch to staging",
  parameters: Type.Object({
    target: Type.Optional(Type.String({ description: "Target env (default: staging)" })),
  }),
  execute: async (_toolCallId, params) => {
    // Your logic. Must return { content: [...], details: {...} }.
    const target = params.target ?? "staging";
    return {
      content: [{ type: "text", text: `Deployed to ${target}` }],
      details: { target },
    };
  },
});

const { session } = await createAgentSession({
  customTools: [deployTool],
});
```

`customTools` is additive: it merges with whatever `tools` you also requested. Parameters use [TypeBox](https://github.com/sinclairzx81/typebox) — the agent gets a JSON Schema view, your `execute` gets typed `params`.

## Custom system prompt

The system prompt is owned by the `ResourceLoader`, not by `createAgentSession()` directly:

```ts
import { DefaultResourceLoader, createAgentSession } from "@mariozechner/pi-coding-agent";

const resourceLoader = new DefaultResourceLoader({
  systemPromptOverride: () => "You are a senior SRE. Answer tersely.",
});
await resourceLoader.reload();

const { session } = await createAgentSession({ resourceLoader });
```

The same loader is the entry point for adding skills, prompt templates, extensions, and virtual `AGENTS.md` context files. See [docs/sdk.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md) for the full option list.

## Extensions (the plugin system)

Extensions are TypeScript modules pi loads at startup. Compared to `customTools` passed via the SDK, an extension:

- Is reusable across every `pi` invocation that discovers it
- Can register tools **and** commands (`/foo`), shortcuts, footer widgets, providers, custom rendering
- Can intercept lifecycle events (block tool calls, modify context, customize compaction)
- Can prompt the user via `ctx.ui` (select / confirm / input / notify)

Pi loads `.ts` directly via [jiti](https://github.com/unjs/jiti) — no compilation step.

> **Security:** extensions run with your full system permissions and can execute arbitrary code. Only install from sources you trust.

### Auto-discovery locations

| Path | Scope |
|---|---|
| `~/.pi/agent/extensions/<name>.ts` | Global, single file |
| `~/.pi/agent/extensions/<name>/index.ts` | Global, multi-file |
| `.pi/extensions/<name>.ts` | Project-local |
| `.pi/extensions/<name>/index.ts` | Project-local, multi-file |

Plus paths declared in `settings.json` (see install section below). Extensions in any auto-discovered location can be hot-reloaded with `/reload` inside the TUI.

### Minimal extension

Save as `~/.pi/agent/extensions/greet.ts`:

```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("greet extension loaded", "info");
  });

  // Block dangerous bash commands
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;
    const cmd = event.input.command as string;
    if (/\brm\s+-rf?\b|\bsudo\b/.test(cmd)) {
      const ok = ctx.hasUI ? await ctx.ui.confirm("Dangerous", `Allow:\n${cmd}`) : false;
      if (!ok) return { block: true, reason: "blocked by greet extension" };
    }
  });

  pi.registerTool({
    name: "greet",
    label: "Greet",
    description: "Greet someone by name",
    parameters: Type.Object({ name: Type.String() }),
    async execute(_id, params) {
      return { content: [{ type: "text", text: `Hello, ${params.name}!` }], details: {} };
    },
  });

  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => ctx.ui.notify(`Hello ${args || "world"}!`, "info"),
  });
}
```

Try it without installing anywhere:

```sh
pi -e ./greet.ts
```

### Async factory (for startup work)

An async default export is awaited before `session_start` fires. Use it for fetching dynamic config (e.g. local-LLM model lists):

```ts
export default async function (pi: ExtensionAPI) {
  const res = await fetch("http://localhost:1234/v1/models");
  const { data } = (await res.json()) as { data: Array<{ id: string; context_window?: number; max_tokens?: number }> };

  pi.registerProvider("local-openai", {
    baseUrl: "http://localhost:1234/v1",
    apiKey: "LOCAL_OPENAI_API_KEY",
    api: "openai-completions",
    models: data.map((m) => ({
      id: m.id, name: m.id, reasoning: false, input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: m.context_window ?? 128000,
      maxTokens: m.max_tokens ?? 4096,
    })),
  });
}
```

### Loading extensions from the SDK

In SDK code, extensions are still owned by the `ResourceLoader`. `DefaultResourceLoader` discovers the same auto-discovery directories above; pass `additionalExtensionPaths` for one-off paths and `extensionFactories` for inline factories:

```ts
import { DefaultResourceLoader, createAgentSession } from "@mariozechner/pi-coding-agent";

const resourceLoader = new DefaultResourceLoader({
  additionalExtensionPaths: ["/abs/path/to/my-ext.ts"],
  extensionFactories: [
    (pi) => pi.on("agent_start", () => console.log("[inline] agent starting")),
  ],
});
await resourceLoader.reload();

const { session } = await createAgentSession({ resourceLoader });
```

### Multi-file extensions with npm dependencies

For an extension that pulls in npm packages, drop a `package.json` next to it:

```
~/.pi/agent/extensions/my-ext/
├── package.json
├── package-lock.json
├── node_modules/
└── src/
    └── index.ts
```

```jsonc
// package.json
{
  "name": "my-ext",
  "dependencies": { "zod": "^3.0.0" },
  "pi": { "extensions": ["./src/index.ts"] }
}
```

Run `npm install` in the directory once. pi resolves imports via the local `node_modules/`.

## Installing third-party packages

A **pi package** is the distribution unit: it bundles one or more extensions, skills, prompt templates, and themes. `pi install` writes to `settings.json`; on next start, pi auto-loads everything declared in the package.

```sh
pi install npm:@foo/bar@1.0.0           # npm, version-pinned
pi install npm:@foo/bar                 # npm, latest (re-pulled by `pi update`)
pi install git:github.com/user/repo@v1  # git, ref-pinned
pi install https://github.com/user/repo # raw URL also works
pi install ./local/package              # local path, not copied

pi list           # show installed
pi update         # pull all non-pinned packages
pi remove npm:@foo/bar
```

By default it modifies `~/.pi/agent/settings.json` (global). Use `-l` to write `<project>/.pi/settings.json` instead — committing that file makes pi auto-install missing packages on startup for everyone on the team.

To trial a package without persisting anything:

```sh
pi -e npm:@foo/bar
pi -e git:github.com/user/repo
```

`-e` installs to a temp dir for the current run only.

The resulting `settings.json` looks like:

```json
{
  "packages": [
    "npm:@foo/bar@1.0.0",
    "git:github.com/user/repo@v1"
  ],
  "extensions": [
    "/absolute/path/to/local/extension.ts",
    "/absolute/path/to/local/extension/dir"
  ]
}
```

`packages` (array): pi packages by source. `extensions` (array): bare extension paths that aren't packaged. Both arrays support an object form for filtering inside a package: `{ source: "npm:my-pkg", extensions: ["extensions/*.ts", "!extensions/legacy.ts"], skills: [], prompts: [...] }`.

### Authoring a publishable pi package

Add a `pi` manifest to `package.json` and tag with the `pi-package` keyword for [pi.dev/packages](https://pi.dev/packages) discovery:

```jsonc
{
  "name": "my-pi-pack",
  "version": "1.0.0",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  },
  "peerDependencies": {
    "@mariozechner/pi-coding-agent": "*",
    "@mariozechner/pi-ai": "*",
    "@mariozechner/pi-agent-core": "*",
    "@mariozechner/pi-tui": "*",
    "typebox": "*"
  },
  "dependencies": {
    "zod": "^3.0.0"
  }
}
```

If you skip the `pi` field entirely, pi auto-discovers from convention directories: `extensions/`, `skills/`, `prompts/`, `themes/`. Path arrays accept globs and `!negation`.

**Dependency rules — get this wrong and the package breaks at install time:**

- The five core packages — `@mariozechner/pi-coding-agent`, `@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`, `@mariozechner/pi-tui`, `typebox` — MUST live in `peerDependencies` with `"*"`. Pi provides them at runtime; bundling them causes module-identity bugs (your `defineTool` is not pi's `defineTool`).
- Everything else (zod, chalk, etc.) goes in `dependencies` — pi runs `npm install --omit=dev` after fetch, so `devDependencies` are not available at runtime.
- To embed another pi package, list it in both `dependencies` and `bundledDependencies`, then reference its resources via `node_modules/<name>/...`.

## Print mode (one-shot pipelines)

`runPrintMode` mirrors `pi -p`: send a prompt, stream the result, exit. Useful inside shell pipelines or CI tasks.

```ts
import {
  type CreateAgentSessionRuntimeFactory,
  SessionManager,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  runPrintMode,
} from "@mariozechner/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async (
  { cwd, sessionManager, sessionStartEvent },
) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.inMemory(),
});

await runPrintMode(runtime, {
  mode: "text", // "text" | "json"
  initialMessage: process.argv.slice(2).join(" "),
});
```

`mode: "json"` switches output to a structured JSON envelope per turn, which is what you want when piping into another program.

## Steering an in-flight stream

`session.prompt()` is sequential by default. To inject during a running turn:

```ts
await session.steer("Stop and read README.md first");  // delivered after current tool calls
await session.followUp("Then summarise it");           // delivered after the agent finishes
```

Both expand file-based prompt templates but reject extension commands (`/...`). If you call `session.prompt(text)` while streaming you must pick one explicitly: `{ streamingBehavior: "steer" | "followUp" }`.

## Picking the right entry point

| Use case | API |
|---|---|
| One-shot CLI tool you control end-to-end | `createAgentSession()` + `SessionManager.inMemory()` |
| Need persistent sessions on disk | `SessionManager.create(cwd)` (or `.continueRecent`, `.open`) |
| Build a pipe-friendly script | `runPrintMode(runtime, { mode: "json" })` |
| Custom tools shaped by your domain (one process, in-code) | `defineTool()` + `customTools: [...]` |
| Tools / commands shared across every `pi` run on this machine | Extension at `~/.pi/agent/extensions/<name>.ts` using `pi.registerTool` / `pi.registerCommand` |
| Tools / commands scoped to one project (commit them) | Extension at `<project>/.pi/extensions/<name>.ts`, plus `<project>/.pi/settings.json` (with `-l`) |
| Bundle and share extensions / skills / prompts | Pi package: `package.json` with the `pi` field + `pi-package` keyword |
| Install someone else's package | `pi install npm:<spec>` or `pi install git:<spec>` (use `-l` for project scope) |
| Replace the active session at runtime (`/new`, `/fork`, `/resume`) | `createAgentSessionRuntime()` then `runtime.newSession()` etc. — re-subscribe after each replacement |
| Drive the agent from another language | `pi --mode rpc --no-session` (JSON-RPC over stdio), no SDK |

## SDK vs. `pi --mode rpc`

Use the SDK when you want type safety, in-process control, and the ability to register tools or extensions written in TypeScript. Use RPC mode when the host is Python, Go, Rust, etc., or when you need process isolation. Both expose the same agent — the SDK just gives you direct access to internal state and event streams.

## References

- [Upstream SDK guide](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md) — authoritative SDK reference (skills, settings, extensions options, runtime replacement)
- [Extensions guide](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) — full event list, `ExtensionAPI` / `ExtensionContext` surface, custom UI components
- [Packages guide](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md) — packaging, `pi install` sources, filtering, scope/dedup rules
- [Skills guide](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md) — how `SKILL.md` is consumed by the agent (separate from this skills repo)
- [Settings reference](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/settings.md) — `~/.pi/agent/settings.json` schema (compaction, retry, packages, extensions)
- [`examples/sdk/`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/sdk) — 13 SDK examples, also installed under `node_modules/@mariozechner/pi-coding-agent/examples/sdk/`
- [`examples/extensions/`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions) — extension cookbook: `permission-gate.ts`, `protected-paths.ts`, `git-checkpoint.ts`, custom providers, custom UI, etc.
- [RPC mode](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md) — JSON protocol when calling pi from non-Node hosts
