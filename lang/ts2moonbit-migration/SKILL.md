---
name: ts2moonbit-migration
description: "Migrate a TypeScript codebase to MoonBit on the `js` target while keeping the same JavaScript API contract, using mizchi/js (JS/Web/Node bindings), mizchi/x (cross-target async backend: process/fs/http/ws), and mizchi/npm_typed (npm bindings). Use when porting a TS library, Node service, npm package, or Cloudflare Worker to MoonBit and the existing JS/TS consumers, `.d.ts`, and tests must keep working unchanged."
---

# TypeScript → MoonBit Migration

Port a TypeScript module, library, npm package, or Node service to MoonBit, compile it back to JavaScript with `moon build`, and ship it so existing JS/TS consumers cannot tell the implementation changed. The compiled `.js` + generated `.d.ts` must satisfy the **same API contract** the TypeScript version exposed.

This skill is the playbook that *composes* three lower-level skills — it does not duplicate them:

- **`moonbit-js-binding`** — the mechanics of `extern "js"`, opaque types, Promise bridging, `moon.pkg` exports. Load it when you write FFI by hand.
- **`translate-programming-language`** — the general parity methodology (oracles, fixtures, shadow testing, cutover). Load it for the verification discipline.
- **`moonbit-practice`** — MoonBit syntax, tests, `moon` commands.

What this skill adds on top of those: the **mizchi toolkit map**, a **TypeScript-specific type-classification pass**, and the **"preserve the JS API contract" build/publish loop** that lets you swap the implementation without touching downstream code.

## When To Use

Use this skill when **all** of these hold:

- The source is TypeScript (a library, npm package, Node CLI/server, or Worker).
- The output must remain consumable as JavaScript — same module shape, same exported signatures, ideally the same `.d.ts` and the same test suite.
- You will build with the MoonBit `js` backend (`moon build`), not WASM-for-the-browser-only.

Do **not** use this skill (reach for the named alternative instead) when:

- You only need to *call* a few JS APIs from an existing MoonBit project → `moonbit-js-binding`.
- You are migrating between two non-JS languages, or the target is not MoonBit → `translate-programming-language`.
- You are bundling MoonBit core + a TS entry for Cloudflare → `cloudflare/mbt-worker-bundle` (this skill covers the *porting*, that skill covers the *bundling*).

## The Governing Principle: the contract is the spec

The TypeScript public surface — exported names, parameter/return types, async-ness, error shapes, module format (ESM/CJS) — **is the test oracle**. Capture it first, never improvise it. Every porting decision is judged by one question: *does a consumer importing the built `.js` still see the same thing?*

Concretely, before porting a single function:

1. Inventory the exported symbols and their `.d.ts` signatures (`references/contract-capture.md`).
2. Snapshot the existing test suite — it becomes the parity gate, run against the MoonBit-built artifact.
3. Decide the contract level per export: **byte-exact** (serializers, hashers), **structural** (objects/JSON), or **semantic** (a value that round-trips). Most exports are structural.

## Architecture: JS-compatible boundary, idiomatic MoonBit core

The contract governs **only the exported boundary**. Behind it, write the implementation as clean, idiomatic MoonBit — the code you'd be happy to show a MoonBit reviewer, not a transliteration of the TypeScript. Two layers, kept separate (details + verified example in `references/boundary-and-core.md`):

- **Boundary adapter** (one thin file per exported surface, gated `["js"]`): the *only* place `@core.Any`, `_get`/`_set`/`cast`, `throw_error`, and `promisify*` appear. It parses JS values into core types, delegates, and marshals results back into the JS shapes the contract demands. It contains no business logic.
- **Idiomatic core**: rich `enum` + `match`, `struct`, `Result`/`raise`, `Map`, `Option`, generics. **No JS types reach this layer.** It is backend-agnostic and tested directly against the Phase 0 fixtures (no Node round-trip).

If `Any` or `_get`/`throw_error` shows up in a core module, the abstraction leaked — push it back out to the adapter. `Any` is a *bootstrapping and boundary* tool, never the destination: use it to get the port compiling, then pull the logic down into typed core modules. The boundary signatures are frozen by the contract; the core types are yours to refactor freely once parity holds.

## Before You Port: Library Triage

When the thing you're replacing is a *library*, run two checks before Phase 0 — they decide whether and how to port.

**1. Does the library's reason-to-exist survive in MoonBit?** Many JS libraries exist to paper over a JS gap that MoonBit doesn't have (ergonomic immutable updates, structural deep-equal, tiny typed utilities). For a **MoonBit consumer**, the right move is often to *not port the library* and use the native idiom instead. Porting is justified when **existing JS consumers** must keep importing the same module — then you reproduce the contract even if MoonBit wouldn't need the library internally.

**2. Classify the library — it predicts how much idiomatic core you'll get:**

| Class | What it is | Port shape | Example (verified) |
|---|---|---|---|
| **Domain-logic** | parsing, algorithms, data transforms, validation | rich idiomatic core (`enum`/`match`/`struct`) + thin boundary — the Architecture pattern shines | **semver**: `enum Ident` / `struct SemVer` core + `match`-based precedence; 198/198 parity vs `semver@7.8.1` |
| **Runtime-mechanics** | Proxy / getter-setter / prototype tricks, reflection, JS-engine behaviors | little-to-no idiomatic core; stays FFI-heavy in `extern "js"`. Consider whether to port at all | **immer**: Proxy copy-on-write in FFI; 12/12 contract parity (incl. structural sharing) vs `immer@10` — but no idiomatic core, and MoonBit needs no immer (`{ ..base, x: v }` is native) |

If the library is runtime-mechanics **and** the consumer could be MoonBit, prefer exposing the native idiom over porting. If it's domain-logic, expect a clean core and proceed to Phase 0.

## The mizchi Toolkit Map

Pick the binding layer by *surface*, not by habit. Full install lines and import paths are in `references/toolkit-map.md`.

| Source TypeScript uses… | MoonBit package | `moon add` |
|---|---|---|
| JS built-ins, Web Standard APIs, `node:*` built-ins | `mizchi/js` | `moon add mizchi/js` |
| DOM, canvas, IndexedDB, storage, service workers | `mizchi/js_browser` | `moon add mizchi/js_browser` |
| Deno / Bun runtime APIs | `mizchi/js_deno`, `mizchi/js_bun` | per runtime |
| npm packages (React, Hono, Zod, AI SDK, Drizzle…) | `mizchi/npm_typed` | `moon add mizchi/npm_typed` |
| Node backend I/O that must run on **both** native and js (spawn, fs, http server, ws, tcp/tls) | `mizchi/x` | `moon add mizchi/x` |
| Cloudflare Workers runtime | `mizchi/cloudflare` | `moon add mizchi/cloudflare` |

Rules of thumb:

- **Reach for a binding before writing FFI.** Hand-rolled `extern "js"` is a last resort for APIs no package covers. When you do write it, follow `moonbit-js-binding`.
- **`mizchi/js`'s `Any` is a boundary tool, not the destination.** Its `Any` type + zero-cost casts (`any(x)`, `Any::cast`, property access `_get`/`_set`, method `_call`/`_invoke`) mirror TypeScript's `any` and let you get the port compiling. Keep them in the boundary adapter and replace them with typed core code as you go (see the Architecture section).
- **`mizchi/x` is the cross-target backend.** If the TS service does process/fs/http/websocket work and you want it to also run on `--target native` later, port onto `mizchi/x` (which delegates to `moonbitlang/async` natively and to JS FFI on the js target) instead of binding `node:*` directly.

## Workflow

Eight phases. Do not skip Phase 0 — porting without the captured contract is how you ship a silent behavior change.

### Phase 0 — Capture the contract
Read `references/contract-capture.md`.
- Enumerate every exported symbol and its type signature (from `.d.ts`, `tsc --declaration`, or `package.json` `exports`).
- Pin the source runtime; freeze the existing test suite as the oracle. Generate fixtures from the TS implementation for ordinary, boundary, malformed, and error cases — never hand-author expected values.
- Record the module format(s) the package ships (`esm`, `cjs`, dual) and the entry points in `package.json`.

### Phase 1 — Project setup
- `moon.mod.json`: set `"preferred-target": "js"` so `moon check/build/test` default to JS.
- `moon add` the toolkit packages you mapped in Phase 0.
- Lay out `src/moon.pkg` with `link.js` (exports + format) — empty exports for now, filled in Phase 6.
- Decide the npm interop shape: a thin `package.json` whose `exports` point at the `moon build --release` output (see `references/build-and-publish.md`).

### Phase 2 — Classify types
Read `references/type-mapping.md`.
This is the TypeScript analog of the OCaml `string`-vs-`Bytes` hazard. Classify **every** field and parameter by *meaning* before choosing a MoonBit type:
- `number` → `Int`/`Double` *only if* `|x| < 2^53`; anything that can exceed it (ids, timestamps-as-int, bitfields) → `BigInt`/`Int64`, and check the contract for which the JS side expects.
- `string` carrying bytes (base64-decoded, binary protocols) → `Bytes`, not `String`.
- `T | null | undefined` unions → do **not** collapse to `T?`; split with `is_null`/`is_undefined`.
- Object/record literals, discriminated unions, `Date`, `Promise<T>`, callbacks — see the reference table.

### Phase 3 — Port leaf modules (idiomatic core + thin adapter)
Read `references/boundary-and-core.md`.
- Port pure/leaf modules first, then shared helpers, then I/O adapters, then orchestration/entry.
- Write the logic as **idiomatic MoonBit core** (`enum`/`match`, `struct`, `Result`/`raise`) with no JS types; keep `Any`/`_get`/`throw_error`/FFI confined to a **thin boundary adapter** file per exported surface.
- Test the core directly against the Phase 0 fixtures (no Node round-trip needed); test the adapter through Node to confirm the contract.

### Phase 4 — Port backend / async I/O
- Map `Promise<T>` to MoonBit `async fn` + `.wait()` (Promise bridging — `moonbit-js-binding`).
- For process/fs/http/ws/tcp, port onto `mizchi/x` so the same source runs on native and js. Add `moonbitlang/async` (`for "test"`) for `async test`.

### Phase 5 — Port npm dependencies
- Replace each npm import with its `mizchi/npm_typed` binding where one exists.
- For an npm package with no binding: write a minimal `extern "js"` + `#module("pkg")` wrapper (named-export rules in `moonbit-js-binding`), exposing only the surface you actually call. Don't bind the whole library.

### Phase 6 — Re-export to satisfy the contract
Read `references/build-and-publish.md`.
- List the Phase 0 export names in `link.js.exports` (use `"moonbit_name:js_name"` to match the original casing/naming).
- Set `link.js.format` to match what the package shipped (`esm`/`cjs`; dual-build if the original was dual).
- `moon build --release`; diff the **generated `.d.ts`** against the Phase 0 `.d.ts`. Reconcile every difference — a changed signature is a broken contract. Watch the leak-prone shapes: `Int64`→`bigint`, enums-with-data, trait objects (see `references/type-mapping.md`).

### Phase 7 — Verify parity and cut over
Read `references/parity-verification.md` (and `translate-programming-language` for the full gate discipline).
- Point the **original TypeScript test suite** at the MoonBit-built `.js` and run it. Green here is the primary signal.
- For services, shadow/replay real traffic and diff responses, headers, and side effects before switching.
- Canary with a rollback window; keep the TS implementation deployable until the window closes.

## Type Mapping (quick reference)

Full table with edge cases in `references/type-mapping.md`.

| TypeScript | MoonBit (with mizchi/js) | Watch out for |
|---|---|---|
| `boolean` | `Bool` | — |
| `number` (int, `< 2^53`) | `Int` / `UInt` | beyond 2^53 → `BigInt` |
| `number` (float) | `Double` | — |
| `bigint` | `BigInt` / `Int64` | `Int64` surfaces as `bigint` in `.d.ts` |
| `string` (text) | `String` | UTF-16 length, not bytes |
| `string` (binary) | `Bytes` | classify by meaning |
| `Uint8Array` | `Bytes` | no-copy |
| `T[]` | `Array[T]` | — |
| `any` / `unknown` | `Any` (mizchi/js) | cast with `Any::cast` |
| `object` / record | `struct` | don't pass `Map`/trait objects across the boundary |
| discriminated union | `enum` | data-carrying enums are awkward from JS; prefer constructor fns |
| `T \| undefined` | `T?` via `is_undefined` | — |
| `T \| null` | `Nullable[T]` wrapper | `null ≠ undefined` |
| `Promise<T>` | `async fn` + `.wait()`; export via `@core.promisify*` | exported async surfaces as `any` in `.d.ts`, not `Promise<T>` |
| `(…) => R` callback | `FuncRef`/closure | — |
| `Date` | `mizchi/js` `Date` binding | — |

## Decision Table

| Situation | Do this |
|---|---|
| Need to call a JS/Web/Node built-in | `mizchi/js` binding; FFI only if missing |
| Need DOM / browser API | `mizchi/js_browser` |
| Need an npm package | `mizchi/npm_typed`; else minimal `#module()` wrapper |
| Backend I/O that should also run native | `mizchi/x` (not raw `node:*`) |
| Value can exceed 2^53 | `BigInt`/`Int64`, confirm against contract |
| `string` is actually bytes | `Bytes` |
| Union with both `null` and `undefined` | split, don't use `T?` alone |
| Exported function is async | return `@core.Promise[T]` via `@core.promisify*`/`from_async`; JS receives a real `Promise` (`.d.ts` type is `any`) |
| Original package was dual ESM/CJS | dual-build; match `package.json` `exports` |
| `.d.ts` signature changed after build | contract break — fix the MoonBit signature, don't patch the `.d.ts` |
| Unsure a behavior matches | run the original TS test against the built `.js` |

## Common Pitfalls

1. **Porting before capturing the contract.** Without the Phase 0 `.d.ts` + test snapshot you have no parity oracle and will ship silent changes.
2. **`number` → `Int` reflex.** JS `number` is IEEE-754. Ids, epoch-millis-as-int, and bitmasks overflow `Int` semantics or lose precision past 2^53. Classify first.
3. **Collapsing `T | null | undefined` into `T?`.** `Some(null)` is nonsense; the contract distinguishes the two. Split with `is_null`/`is_undefined`.
4. **Binding `node:*` directly when you wanted cross-target.** If the service should later run native, port onto `mizchi/x`, not hand-rolled `node:fs`/`node:http` FFI.
5. **Leaking MoonBit internals in the `.d.ts`.** Passing `Map`, `Result`, data-carrying `enum`, or trait objects across the boundary emits MoonBit's internal runtime shape into the `.d.ts`. Expose plain structs / opaque `#external` types / pairs of constructor functions.
6. **Wrong `link.js.format`.** Shipping ESM where the package was CJS (or vice-versa) breaks every consumer even if signatures match. Match Phase 0; dual-build if the original was dual.
7. **Exporting a raw `async fn`.** A sync JS caller can't `await` a bare MoonBit `async fn`. Wrap the internal async logic with `@core.promisify*` (or `from_async`) so the export returns `@core.Promise[T]` and JS receives a real `Promise`. Note the generated `.d.ts` types it as `any`, not `Promise<T>`.
8. **Binding the whole npm library.** Bind only the surface you call. Over-binding wastes effort and bloats output.
9. **Trusting unit parity alone.** Run the *original* TS suite against the built artifact and shadow real traffic before cutover (`translate-programming-language` gates).

## Verified Against

The build/export/FFI workflow and the `mizchi/js` `Any` API in this skill were verified end-to-end with **moon 0.1.20260522 / moonc v0.9.3** and **mizchi/js 0.12.1** (round-tripping objects and Promises through Node). Package boundaries and the `Any` method names (`_get`/`_set`/`_call`/`cast`) shift across releases — re-check against the resolved version in your `moon.mod.json` if a signature mismatches.

## References

@references/contract-capture.md
@references/toolkit-map.md
@references/boundary-and-core.md
@references/type-mapping.md
@references/build-and-publish.md
@references/parity-verification.md
