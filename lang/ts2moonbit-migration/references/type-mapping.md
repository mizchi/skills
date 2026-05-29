# TypeScript → MoonBit Type Mapping

Classify every field, parameter, and return by *meaning* before picking a MoonBit type. The TypeScript analog of OCaml's `string`-vs-`Bytes` trap is `number` (one type covering ints, floats, ids, and bitfields) and the `null`/`undefined` split.

## Primitives

| TypeScript | MoonBit | Notes |
|---|---|---|
| `boolean` | `Bool` | direct |
| `number` integer, `\|x\| < 2^53` | `Int` (signed 32-bit wrapping) or `UInt` | MoonBit has no `Int32`; `Int` wraps at 32 bits — fine for most app ints |
| `number` integer that can exceed 2^53 | `BigInt` (or `Int64`/`UInt64`) | ids, epoch-millis, bitfields. `Int64` surfaces in `.d.ts` as `bigint` |
| `number` float | `Double` | use `Float` only if the contract is 32-bit |
| `bigint` | `BigInt` / `Int64` | direct; `.d.ts` shows `bigint` |
| `string` (human text / labels) | `String` | UTF-16; `String::length()` counts code units, not bytes. **`<`/`>` on `String` order by length first, not lexicographically** — see warning below |
| `string` (binary, base64-decoded, protocol bytes) | `Bytes` | classify by meaning, not by TS type |
| `Uint8Array` | `Bytes` / `FixedArray[Byte]` | no copy across the boundary |

> **`String` comparison is not lexicographic.** MoonBit's `<`/`>`/`compare` on `String` order by **length first**, then content — so `"beta" < "alpha"` is `true` (4 < 5). JS string comparison (and most contracts: sort orders, semver identifiers, range keys) is lexicographic by code unit. When the contract depends on string ordering, write an explicit code-unit comparison (`a[i] < b[i]` over `UInt16`, shorter-is-less on a common prefix) instead of `<`. *(Found while porting `semver`: prerelease identifier precedence was inverted until switched to explicit comparison.)*

> **`number` precision rule.** JS `number` is IEEE-754 double. `Int` is safe for `\|x\| < 2^31` arithmetic and round-trips for `\|x\| < 2^53`. Anything that can grow past 2^53 (snowflake ids, nanosecond timestamps) must be `BigInt` — but check the *contract*: if JS consumers pass/read a plain `number`, you may need to keep `Double` and document the precision ceiling rather than switch them to `bigint`.

## Nullability — do not collapse

TypeScript distinguishes `T`, `T | undefined`, `T | null`, and `T | null | undefined`. MoonBit `T?` only models present/absent.

| TS | MoonBit | How |
|---|---|---|
| `T \| undefined` | `T?` | check `is_undefined(v)` → `None`/`Some` |
| `T \| null` | `Nullable[T]` wrapper | explicit `is_null` branch; `null ≠ undefined` |
| `T \| null \| undefined` | dedicated 3-state, or `Nullish[T]` | split with both checks; never `Some(null)` |
| optional property `x?: T` | `T?` field | absent property ≈ `undefined` |

`mizchi/js/core` already provides these — don't hand-roll them:

```mbt nocheck
@core.is_undefined(v)   // v === undefined
@core.is_null(v)        // v === null
@core.is_nullish(v)     // v == null  (null OR undefined)
@core.nullable(opt)     // T? -> Any  (None becomes null/undefined per impl)
@core.from_option(opt)  // T? -> Any
@core.identity_option(v) // Any -> T?  (nullish-aware)
```

If the contract never produces `null` (only `undefined`), `T?` is fine — confirm from the Phase 0 fixtures, don't assume.

## Compound types

| TypeScript | MoonBit | Notes |
|---|---|---|
| `T[]` / `Array<T>` | `Array[T]` | growable; `FixedArray[T]` for fixed |
| `readonly T[]` | `ArrayView[T]` / `ReadOnlyArray[T]` | cheap read-only slice |
| `[A, B]` tuple | `(A, B)` | direct |
| object / interface / record | `struct` | update syntax `{ ..old, field: v }` |
| `Record<string, V>` / `Map` | **don't pass `Map` across the boundary** | use `struct`, `Array[(String, V)]`, or `Any` at the edge |
| discriminated union | `enum` | data-carrying enums are awkward to build from JS — see below |
| string-literal union `"a" \| "b"` | `enum` (no payload) or `String` | enum if used internally; keep `String` at the boundary if JS passes raw strings |
| `Date` | `mizchi/js` `Date` binding | not a MoonBit primitive |
| `RegExp` | `mizchi/js` `RegExp` binding | — |
| `Promise<T>` | `async fn` returning `T` + `.wait()` | see Async below |
| `(a: A) => R` | `FuncRef[(A) -> R]` or closure | — |
| `any` / `unknown` | `Any` (mizchi/js/core) | tighten before it reaches the public boundary |
| `object` opaque (DOM node, handle) | `#external pub type` | wrap + `%identity` cast (see `moonbit-js-binding`) |

## Discriminated unions / enums at the boundary

A MoonBit `enum Result { Ok(Int); Err(String) }` compiles to a tagged-object shape that is clumsy to construct from TypeScript and leaks MoonBit's representation into the `.d.ts`. At the **public boundary**, prefer one of:

- a plain `struct` with a discriminant field (`{ kind: String, value: ... }`), or
- a pair of constructor functions (`ok(x)`, `err(msg)`) exported to JS,

and keep the rich `enum` internal. Inside MoonBit, use `enum` freely.

## Errors

| TS error style | MoonBit |
|---|---|
| `throw new Error(msg)` | `raise` with a `suberror`; bridge to a thrown JS `Error` at the export if the contract throws |
| rejected `Promise` | `async fn ... raise E`; the bridge rejects the JS Promise |
| returned result object `{ok:false,error}` | mirror as a `struct` (keeps the contract structural) |

Match the Phase 0 error contract: if consumers `catch` an `Error` with a specific `message`, your export must still throw that.

## Boundary-leak checklist (verify in Phase 6 `.d.ts` diff)

These emit MoonBit-internal shapes into the generated `.d.ts`. Fix them in the boundary adapter — keep the rich type in the core and convert to a JS-friendly shape at the export (see `boundary-and-core.md`):

1. `Int64`/`UInt64` in a signature → `.d.ts` shows `bigint`, not `number`.
2. data-carrying `enum` → tagged-object type; replace with struct or constructor fns.
3. `Map[K,V]`, `Result[_]`, `Json`, trait objects → internal runtime layout; convert to structs/arrays/`Any`.
4. exported async returning `@core.Promise[T]` → `.d.ts` shows `any` (external type), even though JS receives a real `Promise`. Document the resolved type in a hand-maintained overlay `.d.ts` if consumers need `Promise<T>` (see `build-and-publish.md`).
