---
name: moonbit-js-binding
description: Guide for writing MoonBit bindings to JavaScript using `extern "js"`. Use when adding FFI declarations against browser/Node/Deno APIs or npm packages, wrapping JS objects behind opaque types, bridging Promises with `async fn` and `Promise::wait()`, configuring `moon.pkg` exports for esm/cjs/iife output, or handling null/undefined at the JS boundary.
---

# MoonBit JS Binding Guide

Step-by-step workflow for binding JavaScript APIs (browser DOM, Node built-ins, npm packages) to MoonBit through the `js` backend.

## When To Use

Use this skill when:

- Adding `extern "js" fn` declarations for a JS API
- Embedding inline JS (`#| (x) => ...`) or importing by module+name (`= "Math" "max"`)
- Configuring `moon.pkg` with `link.js` exports and `format: esm/cjs/iife`
- Wrapping JS objects with `#external pub type` and `%identity` casts
- Bridging Promises with `async fn` + `%async.suspend` + `%async.run`
- Mapping `undefined` / `null` distinctly into MoonBit `Option`
- Consuming npm packages via `require(...)` or ESM imports
- Generating `.d.ts` for TypeScript consumers

## Plan Mode Instructions

**If you are in plan mode** and creating a plan for moonbit-js-binding work:

1. In your final plan file, include an explicit instruction at the beginning that tells the executing agent to read the moonbit-js-binding skill before starting implementation.
2. The instruction should look like this:
   ```
   **Before starting implementation:** Use the Skill tool to load the moonbit-js-binding skill, which provides comprehensive guidance on `extern "js"` declarations, JS value wrapping, Promise bridging, and moon.pkg export configuration.
   ```

## Type Mapping

Map JS types to MoonBit types before writing any declarations.

| JavaScript | MoonBit | Notes |
|---|---|---|
| `boolean` | `Bool` | Direct |
| `number` (integer) | `Int`, `UInt` | JS is IEEE-754; large `Int64` will lose precision — use `BigInt` instead |
| `number` (float) | `Float`, `Double` | Direct |
| `bigint` | `BigInt` | Direct |
| `string` | `String` | Direct (both UTF-16) |
| `Uint8Array` | `Bytes`, `FixedArray[Byte]` | Direct — no copy |
| `Array<T>` | `Array[T]`, `FixedArray[T]` | Direct |
| `Function` | `FuncRef[(...) -> R]` or closure | Direct |
| `any` (opaque) | `#external pub type JsValue` | Wrap in a nominal type |
| `T \| undefined` | `T?` via `is_undefined` check | See Null/Undefined section |
| `T \| null` | `Nullable[T]` wrapper | `null` is NOT `undefined` |
| `Promise<T>` | `#external pub type Promise[T]` | Bridge with `async fn`/`wait()` |
| constant `enum` | `number` | `pub(all) enum E { A; B }` |

> **Warning — Number precision:** JavaScript has no integer type. Values crossing the FFI boundary round to IEEE-754 doubles. `Int` is fine for `\|x\| < 2^53`; beyond that use `BigInt`. `UInt64` / `Int64` currently map through JS `number` and lose bits above `2^53`.

> **Warning — Trait objects & MoonBit enums:** Passing `Map[K, V]`, `Result[_]`, `Json`, or non-`#external` trait objects across FFI exposes MoonBit's internal runtime shape. Convert to plain structs, `JsValue`, or primitives first.

## Workflow

Follow these 4 phases in order.

### Phase 1: Project Setup

Configure the module and package for JS output.

**Module (`moon.mod.json`)** — set `preferred-target` so `moon check`, `moon build`, `moon test` default to `js`:

```json
{
  "name": "user/pkg",
  "version": "0.1.0",
  "source": "src",
  "preferred-target": "js"
}
```

**Package (`src/moon.pkg`)** — gate `.mbt` files to the `js` backend and configure link output.

> **File format — `moon.pkg` (DSL) vs `moon.pkg.json` (JSON):** MoonBit accepts either filename. This skill uses the **DSL form `moon.pkg`** (no extension) throughout. Do NOT write `moon.pkg.json`; it is a different syntax (pure JSON, no `options(...)` wrapper, no trailing commas). Mixing them mid-project causes "Unable to read `moon.pkg`" parse errors. If you cloned an older template using `.pkg.json`, delete it and use `moon.pkg` as shown below.

> **`targets:` — only needed for backend-specific files:** The `targets:` block gates individual `.mbt` files to a subset of backends. Files that contain `extern "js"`, `extern "c"`, or backend-specific `#cfg` blocks **must** be listed. Pure MoonBit files (no FFI) do NOT need a `targets:` entry — if every file in the package is pure MoonBit, omit the `targets:` block entirely. The example above lists `ffi.mbt` / `async.mbt` because they contain `extern "js"`; a simple library with no FFI only needs `link: { ... }`.

```
import {
  "moonbitlang/async",
} for "test"

options(
  targets: {
    "ffi.mbt": ["js"],
    "async.mbt": ["js"],
    "async_test.mbt": ["js"],
  },
  link: {
    "js": {
      "exports": ["add", "greet"],
      "format": "esm",
    },
  },
)
```

**Key fields:**

| Field | Purpose |
|---|---|
| `targets` | Gate `.mbt` files to `["js"]`. JS-only FFI files MUST be gated or they break other backends. |
| `link.js.exports` | List public functions to re-export from the output module. Use `"name:alias"` to rename. |
| `link.js.format` | `"esm"` (ES modules, default for modern bundlers), `"cjs"` (Node `require`), or `"iife"` (browser script tag). |
| `import ... for "test"` | `moonbitlang/async` is only needed in tests (`async test`) — keep it out of production build. |

> **Warning — `supported-targets` vs `targets`:** Do NOT use `supported-targets: ["js"]` at the package level. It blocks downstream consumers. Gate individual files with `targets` instead.

> **Warning — `preferred-target: "js"`:** This is a default, not a lock. `moon test --target wasm-gc` still works on files that support it — useful for cross-backend libraries.

**Two ways to gate code by backend — `targets:` (file-level) vs `#cfg()` (declaration-level):**

| Approach | Granularity | When to use |
|---|---|---|
| `targets: { "foo.mbt": ["js"] }` in `moon.pkg` | Whole file | File is wholly JS-specific (FFI-only, backend-exclusive logic). Cleanest when the JS code doesn't need to share state with other backends. |
| `#cfg(target="js")` on a declaration | Single `fn`, `const`, or block | A mostly-shared module needs a backend-specific implementation of one symbol. Keeps related code in one file. |

Conditions you will see inside `#cfg(...)`:

```mbt nocheck
#cfg(target="js")                          // JS only
#cfg(target="native")                      // native only
#cfg(not(target="js"))                     // everything except JS
#cfg(any(target="wasm", target="wasm-gc")) // either wasm backend
#cfg(any(target="native", target="llvm"))  // either non-GC backend
#cfg(false)                                // always exclude (quick disable)
```

`moonbitlang/core` uses this pattern extensively — e.g. `Int16::from_int64` has a `%i64_to_i16` intrinsic on native/wasm but a fallback implementation on JS where 64-bit integers don't have a native representation:

```mbt nocheck
///|
#cfg(not(target="js"))
pub fn Int16::from_int64(self : Int64) -> Int16 = "%i64_to_i16"

///|
#cfg(target="js")
pub fn Int16::from_int64(self : Int64) -> Int16 {
  Int16::from_int(self.to_int())
}
```

The same file-level rule applies to `#cfg`: **every target your function is callable from must have exactly one matching definition**. Overlapping `#cfg` guards are a compile error. `#cfg(target="js")` + `#cfg(not(target="js"))` cover everything; `#cfg(target="js")` alone on a non-intrinsic declaration means that function does not exist on other backends and any code that calls it must itself be `#cfg`-gated (or live in a file gated via `targets:`).

**Choosing between them:** If the whole file is `extern "js"` wrappers, gate the file via `targets:` — simpler, and `moon check --target wasm-gc` skips the file entirely. If you are writing a cross-backend library where 90% of the logic is shared and only a few functions differ, reach for `#cfg`.

### Phase 2: FFI Layer

Write `extern "js"` declarations. Keep them private (or prefixed `ffi_`); expose safe wrappers in Phase 3.

**Inline JS (`#|` literal):**

```mbt nocheck
///|
extern "js" fn ffi_console_log(msg : String) -> Unit =
  #| (msg) => console.log(msg)

///|
extern "js" fn ffi_sqrt(x : Double) -> Double =
  #| (x) => Math.sqrt(x)
```

The `#|` literal is the function body **as raw JS source**. The MoonBit compiler inlines it at the call site — no closure allocation at runtime.

**Module-and-name form** (imports an existing JS function directly):

```mbt nocheck
///|
extern "js" fn math_max(a : Double, b : Double) -> Double = "Math" "max"
```

Use this when you want to reference a globally accessible function without wrapping it in a closure. Slightly faster and smaller.

**`#module("pkg")` — compile-time ESM / CJS import:**

For named exports from JS modules (Node built-ins, npm packages, local `.js` files), annotate the `extern "js"` with `#module("module-id")`. The right-hand side is the **export name** inside that module (not an inline JS body):

```mbt nocheck
///|
#module("node:path")
extern "js" fn path_basename(p : String) -> String = "basename"

///|
#module("node:path")
extern "js" fn path_extname(p : String) -> String = "extname"
```

What the compiler emits:

| `link.js.format` | Generated code |
|---|---|
| `"esm"` | `import { basename as basename$7 } from "node:path";` |
| `"cjs"` | `const { basename: basename$1548 } = require("node:path");` |
| `"iife"` | same CJS-style destructure (wrapped in the IIFE) |

Why `#module()` beats a hand-rolled `require("...")` wrapper:

- **Statically analyzable.** Vite / esbuild / Rollup can trace the dependency, tree-shake, and resolve paths correctly.
- **Format-agnostic source.** The same `.mbt` file works under ESM (where `require` isn't defined) and CJS without a second code path.
- **Smaller generated code.** No per-call closure; the destructured local is reused.
- **Bundler-compatible paths.** Works for npm package specifiers (`"lodash"`), Node built-ins (`"node:path"`), relative files (`"./helpers.js"`), and URL-style specifiers when supported by the runtime.

**Constraints:**

1. **Named exports only.** The RHS must be a key exported from the module. For default exports or modules whose top-level value is the function itself, you need a bridge re-export on the JS side, or fall back to inline `import`/`require` in an FFI body.
2. **One export per declaration.** You cannot share a destructure across multiple `#module` FFIs — each annotation generates its own import line. The compiler deduplicates the module specifier, so you pay one `require` per unique module, not per function.
3. **Module-name literal must be compile-time constant.** Dynamic module paths (`#module(some_variable)`) are not supported. For dynamically chosen modules, fall back to `require(name)` in inline JS.
4. **No inline body allowed.** `#module("pkg")` + `extern "js" fn f() = "name"` is the only shape. Mixing with `#| (...)  => ...` is a compile error.
5. **Browser globals don't need it.** For `window`, `document`, `fetch`, `Math`, etc., use inline JS or the module+name form (`= "Math" "max"`); they are not imported, just accessed.
6. **Side-effectful imports are still side-effectful.** The `import`/`require` fires when the compiled module loads. If `pkg` has top-level side effects (CLI banners, global patching), they run during import even if you never call the FFI function.
7. **Test vs release format.** `moon test` uses CJS harness regardless of your `link.js.format`. If a module is ESM-only (no CJS entry point in `package.json` `exports`), its tests may fail even though `moon build --release` works. Gate those tests or use a dual-format package.

**When to use which form:**

| Form | Use when |
|---|---|
| `#\|(x) => ...` inline | Small expression, complex logic, need to compose multiple JS calls in one wrapper |
| `= "Math" "max"` module+name | Calling a pre-defined global function (no module import needed) |
| `#module("pkg")` + `= "name"` | Calling a named export from an importable module (Node built-in, npm package, local file) |
| `require("pkg").get("name")` helper | Dynamic module name, or module-name only known at runtime |

**Multi-line inline JS:**

```mbt nocheck
///|
extern "js" fn ffi_do_work(x : Int) -> Int =
  #| (x) => {
  #|   const y = x * 2;
  #|   return y + 1;
  #| }
```

**Opaque JS value pattern:**

For anything without a MoonBit equivalent (DOM nodes, npm objects, `undefined`, `null`), wrap it in `#external pub type`:

```mbt nocheck
///|
#external
pub type JsValue

///|
/// Zero-cost bitcast — compiles to nothing.
pub fn[A, B] identity(a : A) -> B = "%identity"
```

`%identity` is a compiler intrinsic: it moves a value across types at the type-checker level and emits no JS code. Use it to lift primitives into `JsValue` and back. It is **unchecked at runtime** — wrong use is a silent type error.

**Generic FFI operations on `JsValue`:**

```mbt nocheck
///|
pub extern "js" fn JsValue::get(self : JsValue, key : String) -> JsValue =
  #| (obj, key) => obj[key]

///|
pub extern "js" fn JsValue::set(
  self : JsValue,
  key : String,
  value : JsValue,
) -> Unit =
  #| (obj, key, value) => { obj[key] = value }

///|
pub extern "js" fn JsValue::call_method(
  self : JsValue,
  name : String,
  args : Array[JsValue],
) -> JsValue =
  #| (obj, name, args) => obj[name](...args)
```

These three primitives ( `get` / `set` / `call_method` ) can express virtually any JS object interaction.

**Null / undefined distinction:**

MoonBit `T?` cannot represent `T | null | undefined` safely — you'd get `Some(null)`. Check explicitly with `is_undefined` / `is_null`:

```mbt nocheck
///|
pub extern "js" fn is_undefined(v : JsValue) -> Bool =
  #| (v) => v === undefined

///|
pub fn[T] js_get_opt(obj : JsValue, key : String) -> T? {
  let v = obj.get(key)
  if is_undefined(v) {
    None
  } else {
    Some(identity(v))
  }
}
```

For libraries that distinguish `null` from `undefined` (e.g. `FileReader.error`), introduce `Nullable[T]` and `Nullish[T]` wrapper types and narrow with explicit checks.

### Phase 3: MoonBit API

Build safe, typed, `pub` wrappers over the raw `ffi_*` externs.

```mbt nocheck
///|
pub fn console_log(msg : String) -> Unit {
  ffi_console_log(msg)
}

///|
pub fn sqrt(x : Double) -> Double {
  if x < 0 { panic() }
  ffi_sqrt(x)
}
```

**Exports to JS consumers:**

Anything listed in `moon.pkg` `link.js.exports` must be `pub`. The compiler emits a named ESM export (or CJS property, or IIFE global) for each. A `.d.ts` is generated automatically from the public signature.

### Phase 4: Promise / Async Bridging

MoonBit async uses two compiler intrinsics that translate to JS Promise internals:

| Intrinsic | Role |
|---|---|
| `%async.suspend` | Convert a resume/reject callback pair into an `await` point |
| `%async.run` | Start an async computation from a sync context |

**Canonical setup** (see `references/promise-bridging.md` for full detail). Declare in this order — each item depends on the previous:

```mbt nocheck
///|
#external
pub type Promise[T]

///|
/// Cast Promise[T] to JsValue so JsValue methods (get/call_method) apply.
/// Required by `Promise::wait` below.
pub fn[T] Promise::to_any(self : Promise[T]) -> JsValue = "%identity"

///|
pub async fn[T, E : Error] suspend(
  f : ((T) -> Unit, (E) -> Unit) -> Unit,
) -> T raise E = "%async.suspend"

///|
pub fn run_async(f : async () -> Unit noraise) -> Unit = "%async.run"

///|
/// The bridge. `await promise` in JS = `promise.wait()` in MoonBit.
pub async fn[T] Promise::wait(self : Promise[T]) -> T {
  suspend(fn(ok, err) {
    self.to_any().call_method("then", [identity(fn(v : JsValue) { ok(identity(v)) })])
        .call_method("catch", [identity(fn(e : JsValue) { err(identity(e)) })])
    |> ignore
  })
}
```

**When do you need `%async.run` vs just `%async.suspend`?**

| Situation | Need `run_async`? | Why |
|---|---|---|
| `async test "..." { ... }` block | No | The test harness already runs the block in an async context |
| `pub async fn` calling `.wait()` | No | The caller is already async; await chains naturally |
| Exported MoonBit sync function that kicks off a Promise and returns it to JS | Yes | You are crossing sync → async; `run_async` schedules the body |
| Constructing a `Promise[T]` from an `async fn` executor | Yes | The executor body must run even though `new Promise(...)` is sync |

In short: **`async test` users never write `run_async`**. It is needed only when `%identity`-casting async computations into JS Promise land from a sync context.

**Standard pattern — FFI returning Promise + async wrapper:**

```mbt nocheck
///|
extern "js" fn ffi_fetch_text(url : String) -> Promise[String] =
  #| (url) => fetch(url).then(r => r.text())

///|
pub async fn fetch_text(url : String) -> String {
  ffi_fetch_text(url).wait()
}
```

Callers write `let body = fetch_text(url)` inside an `async test` or `async fn` — no `.wait()` needed at the call site. Tests:

```mbt nocheck
async test "fetch_text resolves" {
  let body = fetch_text("https://example.com")
  inspect(body.length() > 0, content="true")
}
```

> **Note — `moonbitlang/async`:** `async test` blocks require `import { "moonbitlang/async" } for "test"` in `moon.pkg`. The dependency is only needed at test time. Add with `moon add moonbitlang/async` — **version 0.17.0 or later** is required (older 0.1.x releases don't support the current `%async.suspend` ABI). As of this skill's writing, `0.18.0` is known good.

### Phase 5: Testing

```bash
moon check                           # type-check, fast
moon test                            # run all tests (js is default)
moon test src --filter "greet"       # filter by name
moon build                           # emit .js + .d.ts to _build/js/release/build/
```

**Build output paths — debug vs release:**

| Command | Output directory |
|---|---|
| `moon build` (default) | `_build/js/debug/build/<pkg>.js` + `.d.ts` |
| `moon build --release` | `_build/js/release/build/<pkg>.js` + `.d.ts` |
| `moon test` (auto) | `_build/js/debug/test/<pkg>.{internal,blackbox}_test.js` |

`.d.ts` is generated in both modes. For publishing to npm, use `--release`. For local experimentation, the default `debug` output is sufficient and links faster.

**Running the generated module from Node:**

```bash
# debug build
node --input-type=module -e 'import("./_build/js/debug/build/<pkg>.js").then(m => console.log(m.add(2,3)))'

# release build (after `moon build --release`)
node --input-type=module -e 'import("./_build/js/release/build/<pkg>.js").then(m => console.log(m.add(2,3)))'
```

A runnable end-to-end example lives under `assets/js_binding_proj/` in this skill — see the directory for a minimal project with 8 passing tests (sync + async) that you can copy, adapt, and run with `moon test`.

## Decision Table

| Situation | Pattern | Key Action |
|---|---|---|
| Call a JS global (one-liner) | Inline `#\|` with arrow function | `extern "js" fn ... = #\| (x) => ...` |
| Reference existing global (no wrap) | Module+name form | `= "Math" "max"` |
| Named export from npm / Node built-in | `#module("pkg")` + `= "exportName"` | Compiler emits `import { exportName }` or `require`, bundler-friendly |
| Opaque JS object | `#external pub type T` | Wrap + cast with `%identity` |
| JS `any` container | Single `JsValue` type with `get`/`set`/`call_method` | Build object-protocol helpers once, reuse |
| `T \| undefined` | Check `is_undefined(v)`, return `T?` | Never assume `Some(null)` is meaningful |
| `T \| null` (distinct from undefined) | `Nullable[T]` wrapper type | Explicit `is_null` branch |
| JS Promise | `#external type Promise[T]` + `wait()` | Bridge via `%async.suspend` |
| Export to JS consumers | `link.js.exports` in moon.pkg | List `pub` functions; `.d.ts` auto-generated |
| Gate a whole file to one backend | `targets: { "f.mbt": ["js"] }` in moon.pkg | Cleanest when the whole file is backend-specific |
| Gate a single function to one backend | `#cfg(target="js")` above the `fn` | Use when 90% of the file is shared; pair with `#cfg(not(target="js"))` for the other backends |
| Large integer (`\|x\| > 2^53`) | `BigInt`, not `Int64` | JS `number` loses bits above 2^53 |
| Call an npm package | Wrap `require("pkg")` → `JsValue.get("fn")` | See `references/interop-patterns.md` |
| Catch a JS exception | Wrap call in `try { ... } catch { ... }` on JS side | See `references/error-handling.md` |

## Common Pitfalls

1. **Forgetting to gate files with `targets`.** A file containing `extern "js"` that isn't gated to `["js"]` breaks `moon check --target wasm-gc` and `native`. Always gate FFI files.

2. **Using `T?` to model `T | null | undefined`.** MoonBit's `None` is not JS `null`, and `Some(null)` is a nonsense value. Split with `is_undefined` and `is_null` before lifting.

3. **Relying on `Int64` across FFI.** JS `number` is IEEE-754 double. Any 64-bit integer > 2^53 silently rounds. Use `BigInt` or split into two `Int`s.

4. **Exposing MoonBit internals by passing `Map`/`Result`/trait objects directly.** These have a MoonBit-specific runtime layout. Convert to plain structs, `Array[(K, V)]`, or `JsValue` at the boundary.

5. **Missing `moonbitlang/async` for `async test`.** The test-only import is easy to forget. Add `import { "moonbitlang/async" } for "test"` to `moon.pkg` before writing the first `async test`.

6. **Forgetting `%async.run` when calling async from sync JS.** Exported sync functions can't `await`. If you need to fire an async operation from a sync export, wrap it with `run_async(async fn() noraise { ... })` and return a `Promise` explicitly.

7. **Calling `.wait()` without being in an `async` context.** `.wait()` is `async` — it only compiles inside an `async fn` or `async test`. Non-async callers need the Promise directly.

8. **Using `%identity` where a real conversion is needed.** `%identity` is a type-checker escape hatch with no runtime effect. Using it to cast `Int` ↔ `String` will produce a runtime error with no warning. Only use when the JS runtime representation genuinely matches.

9. **Exporting a `pub` function that isn't in `link.js.exports`.** It is callable from other MoonBit packages but not re-exported from the compiled JS module. Add the name to `exports`.

## Example Project

A minimal, runnable project demonstrating every pattern above:

```
assets/js_binding_proj/
├── moon.mod.json           # preferred-target: js, moonbitlang/async dep
└── src/
    ├── moon.pkg            # targets + link.js.exports
    ├── ffi.mbt             # extern "js" + JsValue + inline JS
    ├── lib.mbt             # Safe public wrappers (add, greet, js_get_opt)
    ├── lib_test.mbt        # Sync tests
    ├── async.mbt           # Promise[T] + suspend + wait
    ├── async_test.mbt      # async test blocks
    ├── modules.mbt         # #module("node:path") ESM/CJS import demo
    ├── modules_test.mbt
    ├── cross_target.mbt    # #cfg(target="...") per-declaration gating demo
    └── cross_target_test.mbt
```

Run:

```bash
cd assets/js_binding_proj
moon test              # 12 tests pass (sync + async + #cfg + #module)
moon build             # emits ESM + .d.ts
node --input-type=module -e 'import("./_build/js/debug/build/js_binding_proj.js").then(m => console.log(m.add(2,3), m.greet("world"), m.basename("/a/b/c.html")))'
# → 5 Hello, world! c.html
```

## References

@references/promise-bridging.md
@references/interop-patterns.md
@references/error-handling.md
@references/typescript-integration.md
@references/cfg-and-target-gating.md
