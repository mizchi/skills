----
title: MoonBit Language Features Reference
----

# MoonBit Language Features Reference

Detailed examples of language features not covered in moonbit-agent-guide.

For release-sensitive syntax use the newest applicable entry in
[updates.md](updates.md), which covers August, September and November 2026.
The checked examples below use the current syntax; external async cancellation
is covered separately in [async.md](async.md).

## Patterns and control flow from the reviewed releases

- **Error narrowing (September):** `ParseError::_ as e` matches that suberror
  type and narrows `e` from `Error`, without enumerating its constructors.
- **Iteration patterns (September):** `for (name, count) in items { ... }`
  destructures elements. A labelled block (August) can return a value through
  `break done~ value`; a direct break inside the block must name its target.
- **Non-exhaustive enums (September):** When consuming another package's
  `#non_exhaustive` enum, match all known constructors then add `Type::..`.
  The compiler then warns if a later upstream version adds a known constructor
  you have not handled. Use `_` when intentionally ignoring remaining known
  cases too; it does not provide that same evolution check.

The checked [semantics fixture](../assets/update-smoke/semantics_wbtest.mbt)
combines error narrowing and destructuring with a labelled early exit. Its enum
is declared in a separate [variants package](../assets/update-smoke/variants/types.mbt),
so the `Type::..` test exercises an actual external-package boundary.

## Choose a lexical matcher

Since August, `lexscan` is stable and consumes a `moonbitlang/core/lexbuf`
scanner: `StringScanner` for an in-memory cursor, `Lexbuf` for synchronous
streams, and `AsyncLexbuf` for async streams. It does not accept a bare String
or StringView. Use `lexmatch` for a value, or `=~` for a boolean regex search.

```moonbit
fn whole_word(text : StringView) -> String? {
  lexmatch text {
    re"^[A-Za-z]+$" as word => Some(word.to_owned())
    _ => None
  }
}
```

For successive tokens, construct `@lexbuf.StringScanner(text)` and pass it to
`lexscan`; the scanner retains and advances its cursor. Regexes start with `^`,
and a catch-all does not advance the cursor. A fallback is unnecessary only when
the regex cases are exhaustive. See the
[official matcher documentation](https://docs.moonbitlang.com/en/latest/language/fundamentals.html#lexscan)
and the cursor/whole-value regression case in the fixture above.

November's `reb"..."` adds byte matching to `=~` and `lexmatch`; it does **not**
add byte scanning to `lexscan`. Byte captures have static Byte/BytesView types;
non-ASCII bytes use `\xHH`. August also adds `v128le` byte patterns for extracting
16 little-endian bytes into a V128; check the chosen backend's SIMD support.

## Declarations from November

Write derives above their type as `#derive(...)`, and spell 32-bit widths as
`Int32` / `UInt32`; old integer names remain aliases. Extensible enum declaration
and extension are separate:

```moonbit
pub extenum Event

extenum Event += {
  Started
}
```

Use `declare pub let limit : Int32` when declaring a top-level interface value;
provide the matching `pub let limit : Int32 = ...` definition in the same
package. Attribute arguments now accept `@pkg.id` and arrays; do not copy the
old `qual.id` spelling. `moon fmt` handles supported syntax migrations.

## .mbti Files - Package Interface Documentation

MoonBit interface files (`pkg.generated.mbti`) are compiler-generated summaries of each package's public API surface.

**Standard library interfaces** are available in `~/.moon/lib/core`:

```
$ tree -P '*.mbti' -I 'internal' --prune ~/.moon/lib/core
/Users/username/.moon/lib/core
├── builtin
│   └── pkg.generated.mbti
├── array
│   └── pkg.generated.mbti
├── bench
│   └── pkg.generated.mbti
.....
```

**When to use each approach**:
- Use `moon ide doc` for API discovery (preferred). Plain `moon doc <SYMBOL>` is deprecated and only prints a warning pointing here
- Read `.mbti` files directly when you need the complete API surface at once

**Reading `.mbti` files for API discovery**:
- **Start with `builtin/pkg.generated.mbti`** - contains core types (String, Int, Array, etc.)
- Some builtin types like `String` expose APIs in both `builtin` and their dedicated packages
- **Local dependencies**: Find `.mbti` files in the `.mooncakes` directory
- **Your own packages**: A successful `moon check` refreshes `.mbti` for local packages whose preferred backend was checked. `moon info` remains available explicitly; use `moon check --no-mbti` when the check must not write interfaces

## Complex Types

```mbt check
///|
type UserId = Int32 // Int32 is aliased to UserId - like symlink

///|
///  Tuple-struct for callback
struct Handler((String) -> Unit) // A newtype wrapper

///|
/// Tuple-struct syntax for single-field newtypes
struct Meters(Int32) // Tuple-struct syntax

///|
let distance : Meters = Meters(100)

///|
let raw : Int32 = distance.0 // Access first field with .0

///|
#derive(Show, Eq, Debug, @json.ToJson, @json.FromJson)
struct Addr {
  host : String
  port : Int32
}

///|
/// Structural types with literal syntax
let config : Addr = {
  // `Type::` can be omitted if the type is already known
  host: "localhost",
  port: 8080,
}

///|
/// Recursive enum for trees
enum Tree[T] {
  Leaf(T)
  Node(left~ : Tree[T], T, right~ : Tree[T]) // enum can use labels
}

///|
fn sum_tree(tree : Tree[Int32]) -> Int32 {
  match tree {
    Leaf(x) => x
    Node(left~, x, right~) => sum_tree(left) + x + sum_tree(right)
  }
}
```

## Common Derivable Traits

Most types can automatically derive standard traits using the `#derive(...)` syntax:

Place the attribute **above** the type. `moon fmt` migrates suffix derives.
Derivation creates trait implementations; declare the corresponding `extend`
when methods should be attached to the type. The implicit-attachment warning is
enabled by default, including for derived implementations. For a checked
`Debug`/`Eq`/`ToJson` example, see [the smoke fixture](../assets/update-smoke/lib.mbt).

- **`Show`** - Enables `to_string()` and string interpolation with `\{value}` (human-facing formatting)
- **`Debug`** - Structural debug output; required by `debug_inspect` and `@debug.to_string`
- **`Eq`** - Enables `==` and `!=` equality operators
- **`Compare`** - Enables `<`, `>`, `<=`, `>=` comparison operators
- **`ToJson`** - Enables `@json.json_inspect()` for readable test output
- **`Hash`** - Enables use as Map keys
- **`Arbitrary` / `Shrink`** - Property-test generation and shrinking (`@quickcheck`)

```mbt check
///|
#derive(Show, Eq, Debug, @json.ToJson)
struct Coordinate {
  x : Int32
  y : Int32
}

///|
#derive(Show, Eq, Debug, Compare)
enum Status {
  Active
  Inactive
}
```

**Best practice**: derive `Debug` and `Eq` on every data type — `debug_inspect` and
`@debug.assert_eq` need them, and since v0.9 `Show` on container types is
deprecated in favour of `Debug`. Keep `Show` for human-facing formatting, and add
`ToJson` if you plan to test with `@json.json_inspect()`.

## Reference Semantics by Default

MoonBit passes most types by reference semantically:

```mbt check
///|
///  Structs with 'mut' fields are always passed by reference
struct Counter {
  mut value : Int32
}

///|
fn increment(c : Counter) -> Unit {
  c.value += 1 // Modifies the original
}

///|
/// Arrays and Maps are mutable references
fn modify_array(arr : Array[Int32]) -> Unit {
  arr[0] = 999 // Modifies original array
}

///|
///  Use Ref[T] for explicit mutable references to primitives
fn swap_values(a : Ref[Int32], b : Ref[Int32]) -> Unit {
  let temp = a.val
  a.val = b.val
  b.val = temp
}

///|
test "ref swap" {
  let x : Ref[Int32] = Ref::new(10)
  let y : Ref[Int32] = Ref::new(20)
  swap_values(x, y)
}
```

## Pattern Matching

MoonBit's pattern matching is comprehensive and exhaustive:

```mbt check
///|
/// Destructure arrays with rest patterns
fn process_array(arr : Array[Int32]) -> String {
  match arr {
    [] => "empty"
    [single] => "one: \{single}"
    [first, .. _middle, last] => "first: \{first}, last: \{last}"
    // middle is of type ArrayView[Int32]
  }
}

///|
fn analyze_point(point : Point) -> String {
  match point {
    { x: 0, y: 0 } => "origin"
    { x, y } if x == y => "on diagonal"
    { x, .. } if x < 0 => "left side"
    _ => "other"
  }
}

///|
/// StringView pattern matching for parsing
fn is_palindrome(s : StringView) -> Bool {
  loop s {
    [] | [_] => true
    [a, .. rest, b] if a == b => continue rest
    _ => false
  }
}
```

## Functional `loop` Control Flow

The `loop` construct is unique to MoonBit:

```mbt check
///|
/// Functional loop with pattern matching on loop variables
fn sum_list(list : @list.List[Int32]) -> Int32 {
  loop (list, 0) {
    (Empty, acc) => acc
    (More(x, tail=rest), acc) => continue (rest, x + acc)
  }
}

///|
///  Multiple loop variables with complex control flow
fn find_pair(arr : Array[Int32], target : Int32) -> (Int32, Int32)? {
  loop (0, arr.length() - 1) {
    (i, j) if i >= j => None
    (i, j) => {
      let sum = arr[i] + arr[j]
      if sum == target {
        Some((i, j))
      } else if sum < target {
        continue (i + 1, j)
      } else {
        continue (i, j - 1)
      }
    }
  }
}
```

**Note**: You must provide a payload to `loop`. For infinite loops, use `while true { ... }` instead. The syntax `loop { ... }` without arguments is invalid.

## Methods and Traits

Methods use `Type::method_name` syntax, traits require explicit implementation:

```mbt check
///|
struct Rectangle {
  width : Double
  height : Double
}

///|
fn Rectangle::area(self : Self) -> Double {
  self.width * self.height
}

///|
/// Static methods don't need self
fn Rectangle::new(w : Double, h : Double) -> Rectangle {
  { width: w, height: h }
}

///|
/// Show trait uses output(self, logger) for custom formatting.
/// Since v0.10.0 the `fn` keyword is required on trait methods and impls.
pub impl Show for Rectangle with fn output(self, logger) {
  logger.write_string("Rectangle(\{self.width}x\{self.height})")
}

///|
/// Since v0.10.4, `impl` no longer attaches methods implicitly.
/// Declare which trait methods are callable with dot syntax.
pub extend Rectangle with Show::{ output, to_string }

///|
/// Traits can have non-object-safe methods
trait Named {
  fn name() -> String // No 'self' parameter - not object-safe
}

///|
/// Trait bounds in generics
fn[T : Show + Named] describe(value : T) -> String {
  "\{T::name()}: \{value.to_string()}"
}

///|
impl Hash for Rectangle with fn hash_combine(self, hasher) {
  hasher..combine(self.width)..combine(self.height)
}
```

## Operator Overloading

MoonBit supports operator overloading through traits:

```mbt check
///|
struct Vector(Int32, Int32)

///|
pub impl Add for Vector with fn add(self, other) {
  Vector(self.0 + other.0, self.1 + other.1)
}

///|
pub impl Mul for Vector with fn mul(self, other) {
  Vector(self.0 * other.0, self.1 * other.1)
}

///|
#derive(Eq)
struct Person {
  age : Int32
}

///|
pub impl Compare for Person with fn compare(self, other) {
  self.age.compare(other.age)
}

///|
test "overloading" {
  let v1 : Vector = Vector(1, 2)
  let v2 : Vector = Vector(3, 4)
  let _v3 : Vector = v1 + v2
}
```

## Access Control Modifiers

MoonBit has fine-grained visibility control:

```mbt check
///|
/// `fn` defaults to Private - only visible in current package
fn internal_helper() -> Unit {
  ...
}

///|
pub fn get_value() -> Int32 {
  ...
}

///|
/// `pub struct` defaults to readonly - can read, pattern match, but not create
pub struct Config {}

///|
///  Public all - full access (read, create, pattern match)
pub(all) struct Config2 {}

///|
/// Abstract trait (default) - cannot be implemented outside this package
pub trait MyTrait {}

///|
///  Open for extension by external packages
pub(open) trait Extendable {}
```
