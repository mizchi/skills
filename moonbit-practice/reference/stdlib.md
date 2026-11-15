---
title: "MoonBit Standard Library and External Packages"
---

# MoonBit Standard Library

> Error-raising calls need no suffix. The legacy `f(x)!` / `f!(x)` / `f(x)?`
> propagation forms were removed — inside a `raise` context errors propagate
> automatically; otherwise use `expr catch { ... }` or `Ok(expr) catch { e => Err(e) }`.

The standard library (`moonbitlang/core`) is **never a dependency** — it ships with
the toolchain. But that does not mean every core package is in scope for free.

## Important Rules

- ❌ **DO NOT** use `moon add moonbitlang/core/*`
- ❌ **DO NOT** add `moonbitlang/core` to the `import` block in `moon.mod` (module deps)
- ✅ **DO** use language builtins such as `Int32`, `Array`, and `Option` directly.
- ✅ **DO** import core packages referenced through `@alias` in **`moon.pkg`**.
  The old implicit `@json` / `@strconv` / `@buffer` package aliases are not a
  substitute for imports on v0.10.19. A package import is not a module dependency:

  ```moonbit
  import {
    "moonbitlang/core/json",           // used as @json
    "moonbitlang/core/immut/vector",   // used as @immut/vector
    "moonbitlang/core/quickcheck",     // used as @quickcheck
  }
  ```

  The default alias is the path after `moonbitlang/core/`, so a nested package
  keeps its slash: `moonbitlang/core/immut/sorted_set` → `@immut/sorted_set`.

Use `moon ide doc` to identify the package and import the aliases used by the
source. September also added warnings for unused imports, including method-only
imports: keep imports for explicit package references, rather than adding every
package that implements a method on a builtin type.

## Exploring the Standard Library

```bash
# List all available packages
moon ide doc ''

# Explore specific package
moon ide doc "@json"
moon ide doc "@buffer"
moon ide doc "@encoding/utf8"

# Find specific function
moon ide doc "@strconv.parse_int"

# Search with glob
moon ide doc "String::*find*"
```

## Common Packages

Since v0.10.19, check `moonbitlang/core/path` for `Path` and joining paths with
`/`, `moonbitlang/core/compress` for DEFLATE/gzip/zlib, and
`moonbitlang/core/archive/zip` for ZIP/ZIP64 and entry metadata. Inspect the
selected compiler's APIs before adding an external replacement. `core/abort`
can no longer be substituted as a virtual package.

From the August release, `core/diff` offers Myers/Patience sequence differences
and edit distances; `core/lexbuf` provides the scanners consumed by `lexscan`.
Inspect their selected-compiler interfaces through `moon ide doc '@diff'` or
`moon ide doc '@lexbuf'`. QuickCheck's generation, filtering, observation, and
shrinking APIs are covered in [testing.md](testing.md), including September's
derived `Shrink` support.

### @json - JSON Parsing and Serialization

Import `"moonbitlang/core/json"` explicitly. `Json` and `ToJson` now live in
this package. The qualified names below avoid relying on prelude aliases or
implicit method attachment. Use `#derive(@json.ToJson)` for user types; attach
derived methods explicitly when the API needs dot calls.

```moonbit
// Parse JSON
let value : @json.Json = @json.parse("{\"name\": \"Alice\"}")

// Access fields
match value {
  { "name": String(name) } => println(name)
  _ => ()
}

// Serialize to JSON (derive ToJson)
#derive(@json.ToJson)
struct User { name: String; age: Int32 }

let user : User = { name: "Bob", age: 30 }
let json_str = @json.Json(user).stringify()
```

### @buffer - Mutable Byte Buffer

```moonbit
let buf = @buffer.new()
buf.write_string("Hello")
buf.write_byte(b' ')
buf.write_string("World")
let result = buf.to_string()  // "Hello World"
```

### @strconv - String Conversion

```moonbit
// Parse integers
let n : Int = @strconv.parse_int("42")
let hex : Int = @strconv.parse_int("ff", base=16)

// Parse floats
let f : Double = @strconv.parse_double("3.14")
```

### @encoding/utf8 - UTF-8 Encoding

```moonbit
// Encode string to UTF-8 bytes
let bytes : Bytes = @encoding/utf8.encode("Hello 世界")

// Decode UTF-8 bytes to string
let s : String = @encoding/utf8.decode(bytes)
```

### @hashmap - Hash Map (Alternative to Map)

```moonbit
let map : @hashmap.HashMap[String, Int] = @hashmap.new()
map.set("a", 1)
map.set("b", 2)
let value = map.get("a")  // Some(1)
```

### @hashset - Hash Set

```moonbit
let set : @hashset.HashSet[Int] = @hashset.new()
set.insert(1)
set.insert(2)
set.contains(1)  // true
```

### @sorted_map / @sorted_set - Sorted Collections

```moonbit
// Keys are kept in sorted order
let map : @sorted_map.T[String, Int] = @sorted_map.new()
map.insert("b", 2)
map.insert("a", 1)
// Iteration: a, b (sorted)
```

### @random - Random Number Generation

```moonbit
let rng = @random.new()
let n = rng.int()           // Random Int
let f = rng.double()        // Random Double [0, 1)
let arr = [1, 2, 3, 4, 5]
rng.shuffle(arr)            // Shuffle in place
```

### @time - Time and Duration

```moonbit
let now = @time.now()
let duration = @time.Duration::from_seconds(5)
```

### @result - Result Utilities

```moonbit
let ok : Result[Int, String] = Ok(42)
let err : Result[Int, String] = Err("failed")

// Map over success
ok.map(fn(n) { n * 2 })  // Ok(84)

// Unwrap with default
err.unwrap_or(0)  // 0
```

### @option - Option Utilities

```moonbit
let some : Int? = Some(42)
let none : Int? = None

some.map(fn(n) { n * 2 })  // Some(84)
some.unwrap_or(0)          // 42
none.unwrap_or(0)          // 0
```

## Collections Overview

| Type | Description | Use Case |
|------|-------------|----------|
| `Array[T]` | Resizable array | General purpose |
| `FixedArray[T]` | Fixed-size array | Known size, no resize |
| `Map[K, V]` | Ordered hash map | Key-value with insertion order |
| `@hashmap.HashMap[K, V]` | Hash map | Fast lookup |
| `@sorted_map.T[K, V]` | Sorted map | Ordered by keys |
| `@list.T[T]` | Linked list | Functional programming |
| `@deque.T[T]` | Double-ended queue | Queue/stack operations |

## Traits in Standard Library

### Show - String Representation

```moonbit
#derive(Show)
struct Point { x: Int; y: Int }

let p = { x: 1, y: 2 }
println(p.to_string())  // "{x: 1, y: 2}"
```

### ToJson / FromJson - JSON Serialization

```moonbit
#derive(@json.ToJson, @json.FromJson)
struct Config {
  name: String
  value: Int
}

let config : Config = @json.from_json(@json.parse(json_str))
```

### Eq / Compare - Equality and Ordering

```moonbit
#derive(Eq, Compare)
struct Version { major: Int; minor: Int }

let v1 = { major: 1, minor: 0 }
let v2 = { major: 1, minor: 1 }
v1 < v2  // true
```

### Hash - Hashing

```moonbit
#derive(Hash, Eq)
struct Key { id: Int; name: String }

// Can be used as HashMap key
let map : @hashmap.HashMap[Key, String] = @hashmap.new()
```

### Default - Default Values

```moonbit
#derive(Default)
struct Config {
  timeout: Int
  retries: Int
}

let config = Config::default()  // { timeout: 0, retries: 0 }
```

## Iterators

```moonbit
let arr = [1, 2, 3, 4, 5]

// Map
arr.map(fn(x) { x * 2 })  // [2, 4, 6, 8, 10]

// Filter
arr.filter(fn(x) { x % 2 == 0 })  // [2, 4]

// Fold
arr.fold(init=0, fn(acc, x) { acc + x })  // 15

// Find
arr.find(fn(x) { x > 3 })  // Some(4)

// Any / All
arr.any(fn(x) { x > 3 })  // true
arr.all(fn(x) { x > 0 })  // true

// Chaining
arr.filter(fn(x) { x % 2 == 0 })
   .map(fn(x) { x * 2 })  // [4, 8]
```

## String Operations

```moonbit
let s = "hello world"

s.length()                    // 11
s.contains("world")           // true
s.starts_with("hello")        // true
s.ends_with("world")          // true
s.split(" ")                  // ["hello", "world"]
s.replace("world", "MoonBit") // "hello MoonBit"
s.trim()                      // Remove whitespace
s.to_upper()                  // "HELLO WORLD"
s.to_lower()                  // "hello world"
```

## Discovering APIs

Always use `moon ide doc` to discover available APIs:

```bash
# What methods does Array have?
moon ide doc "Array"

# What's in the json package?
moon ide doc "@json"

# Find all parse functions
moon ide doc "*parse*"
```

---

# External Packages

Unlike `moonbitlang/core`, these packages require explicit installation.

## moonbitlang/x - Extended Utilities

Experimental and extended utilities not yet in core.

### Installation

```bash
moon add moonbitlang/x
```

### Common Packages

Re-check package ownership before copying an older `x` example: path operations
now also have a core package. September consolidates Unicode APIs under
`moonbitlang/x/unicode` and adds `jwt` / `bcrypt`; check the resolved package's
signatures rather than inventing constructors or assuming browser/native parity.

```moonbit
// @x/fs - File system operations (native/node backend)
let content = @x/fs.read_to_string("file.txt")
```

> **`moonbitlang/sys` is deprecated (v0.10.9).** Argument and environment access
> moved into the standard library as `moonbitlang/core/env`:
>
> ```moonbit
> let argv = @env.args()   // argv[0] is the program; CLI args are argv[1:]
> ```
>
> Import `"moonbitlang/core/env"` in `moon.pkg` and drop the `moonbitlang/sys`
> dependency.

### Exploring

```bash
moon ide doc "@x/fs"
moon ide doc "@env"
```

## Async runtimes

The new `moonbitlang/core/async` is experimental as of v0.10.19. It offers
corresponding packages such as `core/async/http`. Opt in only after checking
its current signatures and backend support; consumers must allow experimental
packages. An existing external `moonbitlang/async` setup can stay in place.
Coexistence with `core/async` requires external runtime 0.22.7 or newer.

The following sections describe the external runtime, not the experimental core
API. Re-check with `moon ide doc` before changing the import family.
For August's file/header changes and September's implemented cancellation
semantics, read [async.md](async.md). An old `catch`-based cancellation branch
is not current guidance for external async 0.22.x.

### External runtime installation

```bash
moon add moonbitlang/async
```

### Import the selected runtime for async main/test

To use `async fn main` or `async test`, with the external runtime, import `moonbitlang/async` in your `moon.pkg`:

```moonbit
import {
  "moonbitlang/async",
}
```

For `async test`, put this import in the test import block (`for "test"`).
Do not mix runtime-specific helper APIs without checking their compatibility.

### Basic Usage

```moonbit
// Define async function
async fn fetch_data(url : String) -> String raise {
  // async operations
}

// Run async code
@async.run(async fn() {
  let data = fetch_data("https://example.com")
  println(data)
})
```

### Exploring

```bash
moon ide doc "@async"
```
