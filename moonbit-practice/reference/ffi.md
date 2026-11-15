---
title: "MoonBit FFI Reference"
---

# MoonBit FFI Reference

## External Type Declaration

```moonbit
#external
type ExternalRef
```

- Wasm: `externref`
- JS: `any`
- C: `void*`

## External Function Declaration

### JavaScript Backend

```moonbit
///| Module.function format
fn cos(d : Double) -> Double = "Math" "cos"

///| Inline JavaScript
extern "js" fn cos(d : Double) -> Double =
  #|(d) => Math.cos(d)

///| Multi-line
extern "js" fn fetch_json(url : String) -> Value =
  #|(url) => fetch(url).then(r => r.json())
```

### Wasm Backend

```moonbit
///| Import from host
fn cos(d : Double) -> Double = "math" "cos"

///| Inline Wasm
extern "wasm" fn identity(d : Double) -> Double =
  #|(func (param f64) (result f64))
```

### C Backend

```moonbit
extern "C" fn put_char(ch : UInt32) = "putchar"
```

## Type Mapping

### JavaScript

| MoonBit | JavaScript |
|---------|-----------|
| `String` | `string` |
| `Bool` | `boolean` |
| `Int32`, `UInt32`, `Double` | `number` |
| `BigInt` | `bigint` |
| `Bytes` | `Uint8Array` |
| `FixedArray[T]` (except bytes) | `T[]` |
| `#external type` | `any` |

`Array[T]` is an internal growable container, not a supported JS array ABI.
Pass `FixedArray::from_array(xs[:])` to an FFI function, and convert nested arrays at each
boundary. v0.10.19 announced a new JS `Array` layout for the next release;
the local v0.10.20 development compiler already uses it. Byte arrays use
`Uint8Array`; numeric fixed arrays may use typed arrays in future versions.
See the [official ABI table](https://docs.moonbitlang.com/en/latest/language/ffi.html).

### Wasm

| MoonBit | Wasm |
|---------|------|
| `Bool`, `Int` | `i32` |
| `Int64` | `i64` |
| `Float` | `f32` |
| `Double` | `f64` |
| `#external type` | `externref` |

## JavaScript FFI Patterns

### Handling undefined/null

```moonbit
#external
pub type Value

extern "js" fn Value::undefined() -> Value = "() => undefined"
extern "js" fn Value::null() -> Value = "() => null"
extern "js" fn Value::is_undefined(self : Value) -> Bool =
  #|(n) => Object.is(n, undefined)
```

### Type Cast (%identity)

```moonbit
fn[T] Value::cast_from(value : T) -> Value = "%identity"
fn[T] Value::cast(self : Value) -> T = "%identity"
```

### Error Handling

```moonbit
extern "js" fn wrap_ffi(
  op : () -> Value,
  on_ok : (Value) -> Unit,
  on_error : (Value) -> Unit,
) -> Unit =
  #|(op, on_ok, on_error) => {
  #|  try { on_ok(op()); }
  #|  catch (e) { on_error(e); }
  #|}
```

### Loading Node.js Modules

```moonbit
extern "js" fn require_ffi(path : String) -> Value =
  #|(path) => require(path)

// Usage
let path_module = require_ffi("node:path")
```

### ESM Import with #module (Recommended)

The `#module` attribute generates ESM `import` statements in the output JavaScript.

```moonbit
#module("node:fs")
extern "js" fn readFileSync(path : String, encoding : String) -> String = "readFileSync"

#module("node:path")
extern "js" fn basename(path : String) -> String = "basename"
extern "js" fn dirname(path : String) -> String = "dirname"
```

This generates:

```javascript
import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
```

#### Default Export

Use `default` as the function name to import the default export:

```moonbit
#module("lodash")
extern "js" fn lodash() -> Value = "default"
```

Generates:

```javascript
import lodash from "lodash";
```

#### npm Packages

Works with any npm package:

```moonbit
#module("zod")
extern "js" fn z() -> Value = "z"

#module("marked")
extern "js" fn marked(input : String) -> String = "marked"
```

#### Requirements

- Must use `"format": "esm"` in the `moon.pkg` link config
- Target must be JavaScript backend (`--target js`)

#### Limitations

- **Only functions can be imported** - classes and objects cannot be directly imported via `#module`
- To use classes or objects, import them through a wrapper function:

```moonbit
#module("some-lib")
extern "js" fn get_some_class() -> Value = "SomeClass"

// Then use it via Value operations
let cls = get_some_class()
```

## Exporting Functions

Configure in `moon.pkg`:

```moonbit
options(
  link: {
    "js": {
      "exports": [ "add", "fib:fibonacci" ],
      "format": "esm",
    },
  },
)
```

## Callbacks

### FuncRef (No Closures)

```moonbit
///| Only functions without free variables
fn register(callback : FuncRef[() -> Unit]) -> Unit
```

### Regular Closures

In JavaScript, closures are handled automatically.

## Custom Enum Values

```moonbit
enum Flags {
  Read = 1
  Write = 2
  ReadWrite = 3
}
```

Useful for compatibility with C library flags.

## References

- FFI: https://docs.moonbitlang.com/en/stable/language/ffi.html
- JS FFI Guide: https://www.moonbitlang.com/pearls/moonbit-jsffi
