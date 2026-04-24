# Interop Patterns

Practical patterns for working with JavaScript objects, npm packages, callbacks, and null/undefined.

## Opaque Types with `#external`

Any JS value that doesn't match a MoonBit built-in should be wrapped as an opaque type:

```moonbit nocheck
///|
#external
pub type Element          // a DOM element
#external
pub type FileHandle       // a Node fs handle
```

Attach methods in the usual way — the receiver is passed as the first argument in the inline JS.

## The `JsValue` / `Any` Protocol

For generic interop, one opaque type plus get/set/call covers 90% of use cases:

```moonbit nocheck
///|
#external
pub type JsValue

///|
pub fn[A, B] identity(a : A) -> B = "%identity"

///|
pub extern "js" fn JsValue::get(self : JsValue, key : String) -> JsValue =
  #| (obj, key) => obj[key]

///|
pub extern "js" fn JsValue::set(self : JsValue, key : String, value : JsValue) -> Unit =
  #| (obj, key, value) => { obj[key] = value }

///|
pub extern "js" fn JsValue::call_method(
  self : JsValue,
  name : String,
  args : Array[JsValue],
) -> JsValue =
  #| (obj, name, args) => obj[name](...args)
```

Use `identity` to lift primitives into `JsValue` and back:

```moonbit nocheck
let obj = new_object()
obj.set("n", identity(42))
let n : Int = identity(obj.get("n"))
```

## Null vs Undefined

JS has both; `T?` can represent at most one. Check explicitly:

```moonbit nocheck
///|
pub extern "js" fn is_undefined(v : JsValue) -> Bool =
  #| (v) => v === undefined

///|
pub extern "js" fn is_null(v : JsValue) -> Bool =
  #| (v) => v === null

///|
/// Collapse both to None.
pub fn[T] to_option_nullish(v : JsValue) -> T? {
  if is_undefined(v) || is_null(v) { None } else { Some(identity(v)) }
}

///|
/// Only undefined → None; `null` passes through as `Some(null)` (JsValue only).
pub fn[T] to_option_undef(v : JsValue) -> T? {
  if is_undefined(v) { None } else { Some(identity(v)) }
}
```

For library APIs that care about the distinction (e.g. `FileReader.error` is `null` before read, `Error` after), introduce dedicated wrapper types `Nullable[T]` / `Nullish[T]` and narrow with `is_null` / `is_undefined`.

## Calling NPM Packages

Three techniques, from most preferred to fallback.

### 1. `#module("pkg")` — preferred when the export name is known at compile time

```moonbit nocheck
///|
#module("node:path")
extern "js" fn path_basename(p : String) -> String = "basename"

///|
#module("simple-statistics")
extern "js" fn std_dev(xs : Array[Double]) -> Double = "standardDeviation"
```

The compiler emits a real `import { basename as ... } from "node:path"` (ESM) or destructured `require(...)` (CJS) depending on `link.js.format`. Bundlers can statically trace and tree-shake. Works uniformly for Node built-ins (`"node:path"`, `"node:fs"`, ...), npm packages (`"lodash"`), and relative JS files (`"./helpers.js"`).

**Limitation:** named exports only, and the module specifier must be a compile-time string literal. See the `#module()` section in the main SKILL.md for the full constraint list.

### 2. `require("...").get("name")` — when the specifier is dynamic

```moonbit nocheck
///|
pub extern "js" fn require(name : String) -> JsValue =
  #| (name) => require(name)

let pkg_name = resolve_plugin_name()   // runtime-determined
let plugin = require(pkg_name)
let init : () -> Unit = identity(plugin.get("init"))
```

Use when the module name isn't known until runtime. Downsides: fails at runtime on ESM-only packages, bundlers cannot resolve the import, no tree-shaking.

### 3. Inline `#|` JS with `require` / `import` embedded — for one-off complex expressions

```moonbit nocheck
///|
extern "js" fn create_hash(algo : String) -> JsValue =
  #| (algo) => require("node:crypto").createHash(algo)
```

Useful when you want to combine a `require` with extra JS logic in the same closure. For plain named-export access, prefer `#module()` above.

## Callbacks

JS has first-class functions, so passing a MoonBit closure as a callback is direct:

```moonbit nocheck
///|
extern "js" fn add_event_listener(
  target : JsValue,
  event : String,
  cb : (JsValue) -> Unit,
) -> Unit =
  #| (target, event, cb) => target.addEventListener(event, cb)
```

No trampoline, no manual lifetime management — the MoonBit GC tracks the closure automatically.

For closures that capture mutable state:

```moonbit nocheck
///|
pub fn make_counter() -> () -> Int {
  let count = Ref::new(0)
  fn() {
    count.val = count.val + 1
    count.val
  }
}
```

Pass `make_counter()` directly to any `() -> Int` parameter.

## Arrays, Bytes, Strings

| MoonBit | JS runtime rep | Copy? |
|---|---|---|
| `String` | `string` | no |
| `Bytes`, `FixedArray[Byte]` | `Uint8Array` | no |
| `Array[T]` | `Array<T>` | no |

Zero-copy across the boundary — passing a `Bytes` to a JS function does not allocate.

Numeric arrays (`FixedArray[Double]`) may migrate to `Float64Array` / `Int32Array` in future versions. Today they are `Array<number>`.

## Constructors

`new Foo(a, b)` from MoonBit:

```moonbit nocheck
///|
pub extern "js" fn js_new(cls : JsValue, args : Array[JsValue]) -> JsValue =
  #| (cls, args) => new cls(...args)

let regex = js_new(
  global_this().get("RegExp"),
  [identity("foo"), identity("g")],
)
```

## Throwing into JS

Raise a JS error from MoonBit:

```moonbit nocheck
///|
pub extern "js" fn js_throw(value : JsValue) -> Unit =
  #| (value) => { throw value }
```

Use sparingly — typically you'd raise a MoonBit error via `raise` and let a boundary wrapper convert.

## Global Access

```moonbit nocheck
///|
pub extern "js" fn global_this() -> JsValue =
  #| () => globalThis
```

Then `global_this().get("fetch")`, `global_this().get("document")`, etc.
