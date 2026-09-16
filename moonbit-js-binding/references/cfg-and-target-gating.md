# Target Gating: `#cfg()` vs `moon.pkg` `targets`

MoonBit offers two mechanisms for conditional compilation by backend. Understanding the trade-off keeps cross-backend libraries clean.

## `#cfg()` — declaration-level

Attribute form, placed on its own line above a `fn`, `const`, `type`, or block. The symbol only exists when the condition holds.

```moonbit nocheck
///|
#cfg(target="js")
pub fn now_ms() -> Double {
  ffi_date_now()
}

///|
#cfg(not(target="js"))
pub fn now_ms() -> Double {
  // native/wasm implementation
  ...
}
```

### Conditions

Observed in `~/.moon/lib/core`:

| Condition | Meaning |
|---|---|
| `#cfg(target="js")` | JS only |
| `#cfg(target="native")` | native only |
| `#cfg(not(target="js"))` | everything except JS |
| `#cfg(not(target="native"))` | everything except native |
| `#cfg(any(target="wasm", target="wasm-gc"))` | either wasm backend |
| `#cfg(any(target="native", target="llvm"))` | either AOT backend |
| `#cfg(false)` | always excluded (comment-out shortcut) |

Compose with `not(...)`, `any(...)`, and nested combinations.

### Rules

- **Exactly one match per target.** Two `#cfg` definitions of the same symbol whose conditions overlap is a compile error.
- **Cover all targets you call from.** If only `#cfg(target="js")` exists, the function does not exist on other backends. Callers that need the symbol on wasm/native must themselves be gated (or the file must be gated via `moon.pkg`).
- **Intrinsics vs fallback is a common pattern.** `moonbitlang/core` often pairs an intrinsic declaration (`= "%i64_to_i16"`) on native/wasm with a pure-MoonBit fallback on JS:

```moonbit nocheck
///|
#cfg(not(target="js"))
pub fn Int16::from_int64(self : Int64) -> Int16 = "%i64_to_i16"

///|
#cfg(target="js")
pub fn Int16::from_int64(self : Int64) -> Int16 {
  Int16::from_int(self.to_int())
}
```

## `targets:` — file-level (`moon.pkg`)

```
options(
  targets: {
    "ffi.mbt": ["js"],
    "native_stubs.mbt": ["native"],
  },
)
```

The file only participates in the compilation unit for the listed backends. `moon check --target wasm-gc` completely skips `ffi.mbt` above — no typechecking, no symbol table entry.

## Choosing between them

| Situation | Use |
|---|---|
| The whole file is `extern "js"` bindings | `targets: { "...": ["js"] }` |
| A cross-backend file with one function that needs a different implementation on JS | `#cfg` per declaration |
| You want `moon check --target native` to fully skip JS-only code | `targets:` (declaration-level `#cfg` still imports the file) |
| You want a single file to host related declarations for every backend | `#cfg` |

## Interaction with `extern`

Both mechanisms compose with `extern "c"` and `extern "js"`. A file declared with `"native"` target in `moon.pkg` may freely use `extern "c"`; a file declared with `"js"` target may use `extern "js"`. Mixing — e.g. an `extern "js"` declaration inside a `#cfg(target="js")` block in an otherwise cross-backend file — is supported and common.

```moonbit nocheck
///|
// In a cross-target file (no `targets` restriction):

#cfg(target="js")
extern "js" fn ffi_date_now() -> Double =
  #| () => Date.now()

#cfg(target="js")
pub fn now_ms() -> Double {
  ffi_date_now()
}
```

## Pitfalls

1. **Overlapping guards.** `#cfg(target="js")` and `#cfg(any(target="js", target="wasm"))` on the same symbol both match when building for JS → compile error. Narrow one of them.

2. **Calling an ungated function from a gated site.** `fn foo() { now_ms() }` where `foo` is not `#cfg`-gated but `now_ms` is only defined for JS → typecheck fails on other backends. Either gate `foo` too, or provide fallbacks for all backends.

3. **Forgetting that `targets:` hides the file entirely.** If `lib.mbt` imports a type defined only in `ffi.mbt`, and `ffi.mbt` is gated to `["js"]`, `moon check --target native` won't find the type. Either declare the type in a shared file and keep only FFI functions gated, or mirror the type with `#cfg` in both files.

4. **Using `#cfg` on a struct or enum constructor, not the whole type.** Guard the `type`/`struct`/`enum` declaration as a whole. Partial guards on fields or variants are not supported.
