# MoonBit update baseline

Reviewed on 2026-11-15 against the three newest articles on the official
[updates index](https://www.moonbitlang.com/updates):

| Release | Source | Guidance retained here |
| --- | --- | --- |
| v0.10.9 | [2026-08-19](https://www.moonbitlang.com/updates/2026/08/19/index) | Cleanup scope, lexical scanners, labelled blocks, Wasm default, packaging filters, QuickCheck/diff, external runtime I/O changes |
| v0.10.14 | [2026-09-21](https://www.moonbitlang.com/updates/2026/09/21/index) | Error narrowing, iteration patterns, extensible-enum matching, clamped slices, explicit methods/tests, implemented cancellation changes |
| v0.10.19 | [2026-11-05](https://www.moonbitlang.com/updates/2026/11/05/index) | Derive/integer/config migrations, byte regexes, native archives, script headers, interfaces, test scheduling, experimental core async |

## Resolve overlapping guidance

For the same API and applicable version, **the newest article takes precedence**
over an older article or example in this skill. Keep useful older features that
were not superseded. A planned change remains planned until a later source says
it shipped; record compiler experiments separately from release guarantees.
External runtime versions and the MoonBit compiler are separate version axes.

| Topic | Earlier guidance | Current choice |
| --- | --- | --- |
| `moonx` backends | August allowed Native; September deprecated it | November: Wasm only; use `moon run` for local Native/JS |
| Script permissions | September used leading `// policy:` comments | November: `---` configuration header with `permission(...)` |
| Cancellation | August prepared cleanup for a future change | September: async 0.22.x cancellation bypasses `catch`; use `defer`/`errdefer` and `handle_cancellation` |
| Derives | Older examples used suffix `derive(...)` | November: `#derive(...)` above the declaration |
| JSON manifests | Older templates described deprecation | November: build inputs must use the DSL; `moon fmt` still migrates JSON |
| JS arrays | September deprecated `Array` in FFI | November schedules layout replacement for the next release; use `FixedArray` now |

Language examples live in [language.md](language.md); cleanup, cancellation and
external runtime I/O migration are in [async.md](async.md). This reference is the
version baseline when a copied example elsewhere has not caught up.

## Migration order

Follow [upgrading.md](upgrading.md) for the complete procedure: capture the old
baseline, update the existing toolchain, migrate manifests/syntax, resolve
dependency compatibility, repair semantic changes, optionally use a supported
fix driver, then validate behavior and API files. That guide also records the
verified two-pass JSON migration and the current `moon fix` availability gate.

## JS and async boundaries

Use `FixedArray[T]` in JS FFI signatures and `FixedArray::from_array(xs[:])` when passing an
internal growable array. Raw JS spread and `%identity` do not convert a MoonBit
array. Apply the rule to Promise collections and nested arrays too. The
[official FFI ABI](https://docs.moonbitlang.com/en/latest/language/ffi.html)
documents the supported mappings; `Bytes` / fixed byte arrays use `Uint8Array`.

The v0.10.19 announcement schedules the new JS `Array` layout for the **next**
release. It is already present in the local v0.10.20 development compiler used
to test these examples. Do not present it as a released v0.10.19 layout change.

`moonbitlang/core/async` is experimental. Keep an existing `moonbitlang/async`
dependency until its consumer APIs and supported backends have been tested.
Incremental coexistence requires external `moonbitlang/async` **0.22.7 or newer**
and explicit experimental-package opt-in for consumers of `core/async`.
Do not treat that coexistence minimum as the minimum for an external-only app.
The bundled JS example now pins external async **0.22.7** and tests cancellation
as well as Promise conversion. This updates the sample's previous 0.21.0 runtime;
it is not an instruction to upgrade a consumer without checking its API changes.

## Language and library checks

- Slice syntax now uses clamping views; use `exact_view` when bounds violations
  must fail. Do not implement end-relative indexing by assuming negative bounds.
- Use `T::_` to narrow an open `Error` to a suberror type. For external
  `#non_exhaustive` enums, handle known constructors and use `Type::..` for
  future ones; `_` intentionally ignores remaining known cases as well.
- `for` can destructure elements, and labelled blocks can return early with
  `break label~ value`. A direct break inside such a block must name its target.
- `lexmatch` handles a String/StringView value; stable `lexscan` consumes a
  `core/lexbuf` scanner. Byte regex support does not extend to `lexscan`.
- For defined ordering involving NaN, use `Float::total_compare` or
  `Double::total_compare`. Ordinary arithmetic/equality retain IEEE semantics;
  ordinary `compare` with NaN is unspecified. The defined ordering treats signed
  zeros as equal.
- Use `reb"..."` for byte-oriented matching. A single-byte capture is `Byte`;
  other captures are `BytesView`. Literals use ASCII or `\xHH` escapes, and
  `lexscan` does not support byte regexes yet.
- Import `moonbitlang/core/json` for `Json` / `ToJson`. Use `@json.Json(value)`
  or `@json.ToJson::to_json(value)` rather than assuming `.to_json()` is attached.
- Discover new path, compression, and ZIP APIs through `moon ide doc` before
  adding a dependency that duplicates them. Inspect signatures in the selected
  compiler's core, rather than copying an older library's API names.

## Tooling checks

- `moon update` refreshes the registry; check/build/test resolve dependencies.
  Remove dependency-synchronization uses of `moon install` and removed `bin-deps`.
- Use `moon view` to inspect versions and `moon tree --package --json` to inspect
  package dependencies. Native prebuild scripts receive build environment
  variables; do not build new integrations around legacy stdin metadata.
- Tests use qualified `@package.symbol` references in black-box files. A doc
  test needs its own backend `#cfg`; it no longer inherits the function's guard.
- Test executables run in parallel. Use `-j 4` to cap them, or
  `--no-parallelize` for shared ports/files. Async tests inside one package have
  separate scheduling; that flag does not serialize them.
- Put `.mbtx` configuration in a leading `---` header; see [mbtx.md](mbtx.md).
  `moon testcli` is experimental; check `moon test --help` for standalone-script
  testing supported by the installed compiler.
- Conditional imports may select backend implementations under one alias in
  `moon.pkg`, including test imports. See [configuration.md](configuration.md).
- Build native static libraries with `pkgtype(kind: "foreign_library")` and
  call `moonbit_init()` in the host before exported functions. See
  [ffi-native.md](ffi-native.md).
- `moonx` runs registry Wasm executables; `moon run` runs local packages on a
  selected backend. Module publication and Marketplace skill upload are separate
  operations; verify the current upload flow before claiming distribution.

## Reproduction

Run `just --justfile moonbit.justfile test` from this repository. It checks the
new syntax/library fixtures on Wasm, JS, and Native, runs a configured `.mbtx`,
links a native archive to a C host, and runs the JS boundary/Promise/cancellation
example. The cross-package enum fixture is compiled with `--deny-warn`, so a
missing future-constructor branch fails the gate.
The verified local compiler is `moonc v0.10.20+65efd5b93` (2026-11-05), with
`moon 0.1.20261104` and Node 24. This does not establish compatibility with every
older compiler or every version of an external runtime adapter.
