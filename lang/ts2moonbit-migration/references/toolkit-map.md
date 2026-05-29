# The mizchi Toolkit Map

Choose a binding layer by the *surface* the TypeScript code touches. Prefer an existing binding over hand-written `extern "js"`; when no binding exists, write a minimal FFI wrapper per the `moonbit-js-binding` skill.

## Packages

### `mizchi/js` — core JS / Web Standard / Node built-ins
The base layer. JavaScript built-ins (`Date`, `RegExp`, `Math`), Web Standard APIs (`fetch`, `crypto`, streams), and `node:*` built-ins.

```bash
moon add mizchi/js
```
```json
// moon.pkg.json (or moon.pkg DSL import block)
{ "import": ["mizchi/js/core", "mizchi/js"] }
```

Module sub-layout (import only what you use):
- `mizchi/js/core` — `Any`, unsafe casts, the FFI primitives
- `mizchi/js/builtins/*` — `Date`, `RegExp`, `Math`, JSON, …
- `mizchi/js/web/*` — `fetch`, `crypto`, WebGPU, streams
- `mizchi/js/node` — Node standard library

### `mizchi/js_browser` — DOM and browser-only APIs
DOM, canvas, IndexedDB, storage, service workers. Split out so non-browser targets don't pull it in.
```bash
moon add mizchi/js_browser
```

### `mizchi/js_deno`, `mizchi/js_bun` — runtime-specific APIs
Add only for the runtime you target.
```bash
moon add mizchi/js_deno   # or: moon add mizchi/js_bun
```

### `mizchi/npm_typed` — npm package bindings (separate repo)
React, Preact, React Router, Hono, better-auth, Vercel AI SDK, Claude Code SDK, Zod, PGlite, DuckDB, Drizzle, and ~50 more.
```bash
moon add mizchi/npm_typed
```
If your dependency is covered here, use it instead of binding the package yourself.

### `mizchi/x` — cross-target async backend
Node.js backend compatibility layer for `moonbitlang/async`. Same source runs on `--target native` (delegating to `moonbitlang/async`) and `--target js` (via JS FFI). Provides: process exec (`spawn`/`run`/pipes), filesystem, HTTP client/server, WebSocket, TLS, TCP/UDP, and async primitives (queues, condition variables, semaphores).
```bash
moon add mizchi/x
```
Use this **instead of** hand-binding `node:fs`/`node:http`/`node:child_process` whenever the ported code should also be runnable natively. Depends on `moonbitlang/async` and `moonbitlang/x`.

### `mizchi/cloudflare` — Cloudflare Workers (separate repo)
Workers runtime bindings. Pair with `cloudflare/mbt-worker-bundle` for the build/bundle step.
```bash
moon add mizchi/cloudflare
```

## The `Any` escape hatch (mizchi/js/core)

`Any` mirrors TypeScript `any` and is how you make progress before every type is pinned:

```mbt nocheck
// zero-cost casts
let a : Any = any(value)         // T -> Any
let n : Int = obj["age"].cast()  // property access + cast
obj["key"] = any(v)              // property set
let r = obj._call("method", [any(x)])  // method call
```

Strategy: port with `Any` first to get it compiling, then tighten the hot paths and the public boundary to concrete types. The boundary (anything in `link.js.exports`) should end up fully typed so the generated `.d.ts` matches the contract.

## Picking layer by source import

| TS import you see | Use |
|---|---|
| `fetch`, `crypto`, `TextEncoder`, `URL`, `structuredClone` | `mizchi/js` (web) |
| `Date`, `Math`, `RegExp`, `JSON` | `mizchi/js` (builtins) |
| `node:fs`, `node:path`, `node:os` (js-only ok) | `mizchi/js` (node) |
| `node:child_process`, `node:net`, `node:http` server, `ws` (want native too) | `mizchi/x` |
| `document`, `window`, `HTMLCanvasElement`, `indexedDB` | `mizchi/js_browser` |
| `react`, `hono`, `zod`, `ai`, `drizzle-orm` | `mizchi/npm_typed` |
| `Deno.*` / `Bun.*` | `mizchi/js_deno` / `mizchi/js_bun` |
| `@cloudflare/workers-types` | `mizchi/cloudflare` |
| anything with no binding | minimal `extern "js"` + `#module("pkg")` (see `moonbit-js-binding`) |

> Versioning note: package boundaries have shifted across releases (e.g. npm bindings moved out of `mizchi/js` into `mizchi/npm_typed` around v0.11; browser split into `mizchi/js_browser`). Run `moon add <pkg>` and check the resolved version in `moon.mod.json`; if an import path 404s, the binding likely lives in a sibling package now.
