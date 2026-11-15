# The mizchi Toolkit Map

Choose a binding layer by the *surface* the TypeScript code touches. Prefer an existing binding over hand-written `extern "js"`; when no binding exists, write a minimal FFI wrapper per the `moonbit-js-binding` skill.

## Packages

### Core, built-ins, Web and Node modules

Checked 2026-11-16 with `mizchi/js_core@0.13.0`, `mizchi/x@0.7.0` and
compiler v0.10.20. The old `mizchi/js/core` import no longer resolves in the
published 0.13.0 facade. Import the split module directly:

```sh
moon add mizchi/js_core
```

```mbt
// moon.pkg
import { "mizchi/js_core" @core }
```

Declare the module in `moon.mod` even when another facade also depends on it;
a transitive dependency does not authorize a direct package import.
Current module boundaries include:

- `mizchi/js_core` — `Any`, property access, casts, Promise and FFI helpers.
- `mizchi/js_builtin/*` — built-in Date, Math, JSON and collection packages.
- `mizchi/js_web/*` — Web APIs.
- `mizchi/js_node/*` — Node built-ins.
- `mizchi/js` — a convenience facade; inspect its current exported surface.

Use `moon add` for each module directly imported by the consumer and inspect its
resolved `moon.mod` / package interfaces. The [adapter smoke check](../assets/adapter-smoke/moon.mod)
verifies property access, a real Promise export and the filesystem/process path.
Other split modules above were identified from published metadata, not all
exercised by that check.

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
At 0.7.0 the cross-target facade uses experimental `moonbitlang/core/async`, with Native delegation and JS implementations. Keep its scheduler separate from external `moonbitlang/async` used by other libraries; verify a mixed call chain before sharing async state. Provides: process exec (`spawn`/`run`/pipes), filesystem, HTTP client/server, WebSocket, TLS, TCP/UDP, and async primitives (queues, condition variables, semaphores).
```bash
moon add mizchi/x
```
Use this **instead of** hand-binding `node:fs`/`node:http`/`node:child_process` whenever the ported code should also be runnable natively. The checked module depends on `moonbitlang/x` and `moonbitlang/regexp`; inspect its manifest when upgrading.

### `mizchi/cloudflare` — Cloudflare Workers (separate repo)
Workers runtime bindings. Pair with `cloudflare-mbt-worker-bundle` for the build/bundle step.
```bash
moon add mizchi/cloudflare
```

## The `Any` escape hatch (mizchi/js_core)

`Any` (`@core.Any`) mirrors TypeScript `any`. Treat it as a **boundary-only** tool — it belongs in adapter files, not the core (see `boundary-and-core.md`). API checked with mizchi/js_core 0.13.0:

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
| `fetch`, `crypto`, `TextEncoder`, `URL`, `structuredClone` | `mizchi/js_web` |
| `Date`, `Math`, `RegExp`, `JSON` | `mizchi/js_builtin` |
| `node:fs`, `node:path`, `node:os` (js-only ok) | `mizchi/js_node` |
| `node:child_process`, `node:net`, `node:http` server, `ws` (want native too) | `mizchi/x` |
| `document`, `window`, `HTMLCanvasElement`, `indexedDB` | `mizchi/js_browser` |
| `react`, `hono`, `zod`, `ai`, `drizzle-orm` | `mizchi/npm_typed` |
| `Deno.*` / `Bun.*` | `mizchi/js_deno` / `mizchi/js_bun` |
| `@cloudflare/workers-types` | `mizchi/cloudflare` |
| anything with no binding | minimal `extern "js"` + `#module("pkg")` (see `moonbit-js-binding`) |

> `supported_targets` warning: `mizchi/js` declares it, so `moon check` warns your package should too. For a leaf/app being migrated, declare it to silence the warning — in the `moon.pkg` DSL the verified syntax is the string expression form `supported_targets = "js"` (not `["js"]`, which warns "legacy array syntax"). For a **library you republish**, prefer gating individual FFI files via `targets: { "f.mbt": ["js"] }` instead — a package-level `supported_targets` propagates and can block downstream consumers on other backends (see `moonbit-js-binding`).

> Versioning note: package boundaries have shifted across releases (e.g. npm bindings moved out of `mizchi/js` into `mizchi/npm_typed` around v0.11; browser split into `mizchi/js_browser`). Run `moon add <pkg>` and check the resolved version in `moon.mod`; if an import path 404s, the binding likely lives in a sibling package now.
