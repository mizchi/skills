---
title: "MoonBit Standard Library and External Packages"
---

# MoonBit Standard Library

The standard library (`moonbitlang/core`) is **automatically available** - no need to add it to dependencies.

## Important Rules

- ❌ **DO NOT** use `moon add moonbitlang/core/*`
- ❌ **DO NOT** add to `"deps"` in `moon.mod.json`
- ❌ **DO NOT** add to `"import"` in `moon.pkg.json`
- ✅ **DO** use directly: `@strconv.parse_int()`, `@json.parse()`, etc.

## Exploring the Standard Library

```bash
# List all available packages
moon doc ''

# Explore specific package
moon doc "@json"
moon doc "@buffer"
moon doc "@encoding/utf8"

# Find specific function
moon doc "@strconv.parse_int"

# Search with glob
moon doc "String::*find*"
```

## Common Packages

### @json - JSON Parsing and Serialization

```moonbit
// Parse JSON
let value : @json.JsonValue = @json.parse("{\"name\": \"Alice\"}")!

// Access fields
match value {
  { "name": String(name) } => println(name)
  _ => ()
}

// Serialize to JSON (derive ToJson)
struct User { name: String; age: Int } derive(ToJson)

let user = { name: "Bob", age: 30 }
let json_str = user.to_json().stringify()
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
let n : Int = @strconv.parse_int("42")!
let hex : Int = @strconv.parse_int("ff", base=16)!

// Parse floats
let f : Double = @strconv.parse_double("3.14")!
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
struct Point { x: Int; y: Int } derive(Show)

let p = { x: 1, y: 2 }
println(p.to_string())  // "{x: 1, y: 2}"
```

### ToJson / FromJson - JSON Serialization

```moonbit
struct Config {
  name: String
  value: Int
} derive(ToJson, FromJson)

let config : Config = @json.from_json(@json.parse(json_str)!)!
```

### Eq / Compare - Equality and Ordering

```moonbit
struct Version { major: Int; minor: Int } derive(Eq, Compare)

let v1 = { major: 1, minor: 0 }
let v2 = { major: 1, minor: 1 }
v1 < v2  // true
```

### Hash - Hashing

```moonbit
struct Key { id: Int; name: String } derive(Hash, Eq)

// Can be used as HashMap key
let map : @hashmap.HashMap[Key, String] = @hashmap.new()
```

### Default - Default Values

```moonbit
struct Config {
  timeout: Int
  retries: Int
} derive(Default)

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

Always use `moon doc` to discover available APIs:

```bash
# What methods does Array have?
moon doc "Array"

# What's in the json package?
moon doc "@json"

# Find all parse functions
moon doc "*parse*"
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

```moonbit
// @x/fs - File system operations (native/node backend)
let content = @x/fs.read_to_string("file.txt")

// @x/sys - System operations
let args = @x/sys.get_args()
let env = @x/sys.get_env()
```

### Exploring

```bash
moon doc "@x/fs"
moon doc "@x/sys"
```

## moonbitlang/async - Asynchronous Programming

Async/await support for MoonBit.

### Installation

```bash
moon add moonbitlang/async
```

### Important: Import Required for async main/test

To use `async fn main` or `async test`, you **must** import `moonbitlang/async` in your `moon.pkg.json`:

```json
{
  "import": [
    "moonbitlang/async"
  ]
}
```

Without this import, `async fn main` and `async test` will not work.

### Basic Usage

```moonbit
// Define async function
async fn fetch_data(url : String) -> String raise {
  // async operations
}

// Run async code
@async.run(async fn() {
  let data = fetch_data("https://example.com")!
  println(data)
})
```

### Exploring

```bash
moon doc "@async"
```
