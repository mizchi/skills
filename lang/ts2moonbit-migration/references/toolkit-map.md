# The mizchi Toolkit Map

Choose a binding layer by the *surface* the TypeScript code touches. Prefer an existing binding over hand-written `extern "js"`; when no binding exists, write a minimal FFI wrapper per the `moonbit-js-binding` skill.

## Packages

### `mizchi/js` — core JS / Web Standard / Node built-ins
The base layer. JavaScript built-ins (`Date`, `RegExp`, `Math`), Web Standard APIs (`fetch`, `crypto`, streams), and `node:*` built-ins.

```bash
moon add mizchi/js
```
```
// src/moon.pkg (DSL form — verified)
import {
  "mizchi/js/core",
  "mizchi/js",
}
```
(The JSON form `moon.pkg.json` with `{ "import": ["mizchi/js/core", "mizchi/js"] }` works too. Pick one per package — don't mix.)

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

`Any` (`@core.Any`) mirrors TypeScript `any`. Treat it as a **boundary-only** tool — it belongs in adapter files, not the core (see `boundary-and-core.md`). Verified API (mizchi/js 0.12.1):

```mbt nocheck
let a : @core.Any = @core.any(value)      // T -> Any
let obj = @core.new_object()              // {} 
obj._set("age", @core.any(30))            // obj.age = 30   (property set)
let n : Int = obj._get("age").cast()      // obj.age + cast (property get)
let first = arr._get_by_index(0)          // arr[0]
let r = obj._call("method", [@core.any(x)])  // obj.method(x)
let r2 = fn_any._invoke([@core.any(x)])      // fn(x)
```

Note: property access is the methods `_get` / `_set` / `_get_by_index`, **not** `obj["key"]` bracket syntax. In the `.d.ts`, an exported `@core.Any` surfaces as TypeScript `any`.

Strategy: port with `Any` first to get it compiling, then pull the logic down into typed idiomatic core modules and leave only marshalling in the adapter. The exported boundary should end up with concrete signatures so the generated `.d.ts` matches the contract; the core should have no `Any` at all.

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

> `supported_targets` warning: `mizchi/js` declares it, so `moon check` warns your package should too. For a leaf/app being migrated, declare it to silence the warning — in the `moon.pkg` DSL the verified syntax is the string expression form `supported_targets: "js"` (not `["js"]`, which warns "legacy array syntax"); in `moon.pkg.json` use `"supported-targets": ["js"]`. For a **library you republish**, prefer gating individual FFI files via `targets: { "f.mbt": ["js"] }` instead — a package-level `supported_targets` propagates and can block downstream consumers on other backends (see `moonbit-js-binding`).

> Versioning note: package boundaries have shifted across releases (e.g. npm bindings moved out of `mizchi/js` into `mizchi/npm_typed` around v0.11; browser split into `mizchi/js_browser`). Run `moon add <pkg>` and check the resolved version in `moon.mod.json`; if an import path 404s, the binding likely lives in a sibling package now.
