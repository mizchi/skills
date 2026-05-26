----
title: MoonBit Language Features Reference
----

# MoonBit Language Features Reference

Detailed examples of language features not covered in moonbit-agent-guide.

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
- Use `moon doc` for interactive API discovery (preferred)
- Read `.mbti` files directly when you need the complete API surface at once

**Reading `.mbti` files for API discovery**:
- **Start with `builtin/pkg.generated.mbti`** - contains core types (String, Int, Array, etc.)
- Some builtin types like `String` expose APIs in both `builtin` and their dedicated packages
- **Local dependencies**: Find `.mbti` files in the `.mooncakes` directory
- **Your own packages**: After running `moon info`, check the generated `.mbti` in each package directory

## Complex Types

```mbt check
///|
type UserId = Int // Int is aliased to UserId - like symlink

///|
///  Tuple-struct for callback
struct Handler((String) -> Unit) // A newtype wrapper

///|
/// Tuple-struct syntax for single-field newtypes
struct Meters(Int) // Tuple-struct syntax

///|
let distance : Meters = Meters(100)

///|
let raw : Int = distance.0 // Access first field with .0

///|
struct Addr {
  host : String
  port : Int
} derive(Show, Eq, ToJson, FromJson)

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
fn sum_tree(tree : Tree[Int]) -> Int {
  match tree {
    Leaf(x) => x
    Node(left~, x, right~) => sum_tree(left) + x + sum_tree(right)
  }
}
```

## Common Derivable Traits

Most types can automatically derive standard traits using the `derive(...)` syntax:

- **`Show`** - Enables `to_string()` and string interpolation with `\{value}`
- **`Eq`** - Enables `==` and `!=` equality operators
- **`Compare`** - Enables `<`, `>`, `<=`, `>=` comparison operators
- **`ToJson`** - Enables `@json.inspect()` for readable test output
- **`Hash`** - Enables use as Map keys

```mbt check
///|
struct Coordinate {
  x : Int
  y : Int
} derive(Show, Eq, ToJson)

///|
enum Status {
  Active
  Inactive
} derive(Show, Eq, Compare)
```

**Best practice**: Always derive `Show` and `Eq` for data types. Add `ToJson` if you plan to test them with `@json.inspect()`.

## Reference Semantics by Default

MoonBit passes most types by reference semantically:

```mbt check
///|
///  Structs with 'mut' fields are always passed by reference
struct Counter {
  mut value : Int
}

///|
fn increment(c : Counter) -> Unit {
  c.value += 1 // Modifies the original
}

///|
/// Arrays and Maps are mutable references
fn modify_array(arr : Array[Int]) -> Unit {
  arr[0] = 999 // Modifies original array
}

///|
///  Use Ref[T] for explicit mutable references to primitives
fn swap_values(a : Ref[Int], b : Ref[Int]) -> Unit {
  let temp = a.val
  a.val = b.val
  b.val = temp
}

///|
test "ref swap" {
  let x : Ref[Int] = Ref::new(10)
  let y : Ref[Int] = Ref::new(20)
  swap_values(x, y)
}
```

## Pattern Matching

MoonBit's pattern matching is comprehensive and exhaustive:

```mbt check
///|
/// Destructure arrays with rest patterns
fn process_array(arr : Array[Int]) -> String {
  match arr {
    [] => "empty"
    [single] => "one: \{single}"
    [first, .. _middle, last] => "first: \{first}, last: \{last}"
    // middle is of type ArrayView[Int]
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
fn sum_list(list : @list.List[Int]) -> Int {
  loop (list, 0) {
    (Empty, acc) => acc
    (More(x, tail=rest), acc) => continue (rest, x + acc)
  }
}

///|
///  Multiple loop variables with complex control flow
fn find_pair(arr : Array[Int], target : Int) -> (Int, Int)? {
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
fn Rectangle::area(self : Rectangle) -> Double {
  self.width * self.height
}

///|
/// Static methods don't need self
fn Rectangle::new(w : Double, h : Double) -> Rectangle {
  { width: w, height: h }
}

///|
/// Show trait uses output(self, logger) for custom formatting
pub impl Show for Rectangle with output(self, logger) {
  logger.write_string("Rectangle(\{self.width}x\{self.height})")
}

///|
/// Traits can have non-object-safe methods
trait Named {
  name() -> String // No 'self' parameter - not object-safe
}

///|
/// Trait bounds in generics
fn[T : Show + Named] describe(value : T) -> String {
  "\{T::name()}: \{value.to_string()}"
}

///|
impl Hash for Rectangle with hash_combine(self, hasher) {
  hasher..combine(self.width)..combine(self.height)
}
```

## Operator Overloading

MoonBit supports operator overloading through traits:

```mbt check
///|
struct Vector(Int, Int)

///|
pub impl Add for Vector with add(self, other) {
  Vector(self.0 + other.0, self.1 + other.1)
}

///|
pub impl Mul for Vector with mul(self, other) {
  Vector(self.0 * other.0, self.1 * other.1)
}

///|
struct Person {
  age : Int
} derive(Eq)

///|
pub impl Compare for Person with compare(self, other) {
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
pub fn get_value() -> Int {
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
