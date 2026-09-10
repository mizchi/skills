---
title: "MoonBit Testing Reference"
---

# MoonBit Testing Reference

## Doc Tests

Doc tests can be written in `.mbt.md` files or inline docstrings.

### Code Block Types

| Block | Behavior |
|-------|----------|
| ` ```mbt check ` | Type-checked by LSP and `moon check` |
| ` ```mbt test ` | Executed as `test {...}` block |
| ` ```moonbit ` | Display only (not executed) |

### Inline Docstring Example

````moonbit
///|
/// Get the largest element of a non-empty `Array`.
///
/// # Example
/// ```mbt test
/// test {
///   inspect(sum_array([1, 2, 3, 4, 5, 6]), content="21")
/// }
/// ```
///
/// # Panics
/// Panics if the `xs` is empty.
pub fn sum_array(xs : Array[Int]) -> Int {
  xs.fold(init=0, fn(a, b) { a + b })
}
````

### README.mbt.md

Create `README.mbt.md` in your package directory with tested code examples:

````markdown
# My Package

## Usage

```mbt test
test {
  inspect(@mypackage.hello(), content="Hello, World!")
}
```
````

Symlink to `README.md` for GitHub compatibility:

```bash
ln -s README.mbt.md README.md
```

## Snapshot Tests

Snapshot helpers fill an empty `content=""` when you run `moon test -u`.

```moonbit
test "snapshot" {
  inspect("hello", content="")          // primitive / string
  debug_inspect([1, 2, 3], content="")  // container / custom type
}
```

After `moon test -u`:

```moonbit
test "snapshot" {
  inspect("hello", content="hello")
  debug_inspect([1, 2, 3], content="[1, 2, 3]")
}
```

### Which snapshot helper (v0.9.2+)

| Helper | Trait | Use for |
|---|---|---|
| `inspect()` | `Show` | Primitives and strings |
| `debug_inspect()` | `Debug` | `Array` / `Map` / `Set` / `Option` / `Result` / tuples and custom types |
| `@json.inspect()` | `ToJson` | Deeply nested structures — JSON stays readable when formatted |

`Show` for container types is deprecated: the debugging interface moved to the
`Debug` trait in v0.9, so container snapshots go through `debug_inspect`. Pick by
the expression's **static** type, and `derive(Debug)` any custom type you snapshot
(add `Eq` for `@debug.assert_eq`).

```moonbit
test "complex structure" {
  let data = { "name": "Alice", "scores": [90, 85, 92] }
  @json.inspect(data, content={"name":"Alice","scores":[90,85,92]})
}
```

## Benchmarks with moon bench

### Basic Benchmark

```moonbit
///|
bench "array_sum" {
  let arr = Array::make(1000, 1)
  arr.fold(init=0, fn(a, b) { a + b })
}

///|
bench "array_sum_iter" {
  let arr = Array::make(1000, 1)
  let mut sum = 0
  for v in arr {
    sum = sum + v
  }
  sum
}
```

### Running Benchmarks

```bash
moon bench                    # Run all benchmarks
moon bench --target js        # JS backend
moon bench --target wasm-gc   # Wasm backend
```

### Benchmark Best Practices

1. **Isolate the operation**: Only measure the code you want to benchmark
2. **Use realistic data sizes**: Small inputs may not reveal performance issues
3. **Compare alternatives**: Benchmark multiple approaches side by side
4. **Consider different backends**: Performance varies between JS, Wasm, and Native

## QuickCheck (Property-Based Testing)

QuickCheck generates random test inputs automatically.

### Setup

Since v0.10.9 QuickCheck ships **inside the standard library** as
`moonbitlang/core/quickcheck` — do not add a `moonbitlang/quickcheck` dependency.
Import the package when the default prelude alias is not enough:

```moonbit
import {
  "moonbitlang/core/quickcheck",
} for "test"
```

### check vs report

| Entry point | Behaviour | Bounds on the type |
|---|---|---|
| `@quickcheck.check(prop)` | Raises on failure, silent on success | `Arbitrary + Shrink + Debug` |
| `@quickcheck.report(prop)` | Returns a `QuickCheckReport` instead of raising | `Arbitrary + Shrink` |

Both accept labelled options: `count?`, `max_size?`, `max_shrinks?`, `seed?`
(reproduce a failure), `filter?` with `discard_ratio?`, `observe?`, and
`counterexample_context?`.

### Basic Usage

```moonbit
///|
test "reverse twice is identity" {
  @quickcheck.check(fn(arr : Array[Int]) {
    arr.rev().rev() == arr
  })
}

///|
test "sort is idempotent" {
  @quickcheck.check(fn(arr : Array[Int]) {
    let sorted = arr.copy()
    sorted.sort()
    let sorted_again = sorted.copy()
    sorted_again.sort()
    sorted == sorted_again
  })
}
```

### Custom Generators

```moonbit
///|
test "custom generator" {
  // Generate positive integers only
  @quickcheck.check(fn(n : Int) {
    let positive = n.abs() + 1
    positive > 0
  })
}
```

### Generators for custom types

`derive(Arbitrary)` generates values of a custom type; `derive(Shrink)` implements
`@quickcheck.Shrink` so failures can be minimised. Build bespoke generators from
the `@quickcheck.Generator[T]` combinators.

```moonbit
///|
struct User {
  name : String
  age : Int
} derive(Arbitrary, Shrink, Debug)
```

### Statistics

`@quickcheck.label`, `@quickcheck.classify`, and `@quickcheck.collect` record
observations about the generated inputs so you can see whether the distribution
actually exercises the interesting cases; pass them via `observe?`.

### Shrinking

QuickCheck automatically shrinks failing inputs to find minimal counterexamples
(the `core/quickcheck/shrink` package holds the shrinkers):

```moonbit
///|
test "finds minimal counterexample" {
  // If this fails, QuickCheck will find the smallest failing input
  @quickcheck.check(fn(arr : Array[Int]) {
    arr.length() < 100  // Will fail and shrink to length=100
  })
}
```

## Test Organization

### File Naming

- `*_test.mbt` - Black-box tests (only public API)
- `*_wbtest.mbt` - White-box tests (can access private members)
- `*.mbt.md` - Documentation with tested examples

### Test Filtering

```bash
moon test --filter "Array::*"           # Run tests matching pattern
moon test src/parser_test.mbt           # Run specific file
moon test -v                            # Verbose output
```

### Panic Tests

Name tests with `panic` prefix:

```moonbit
///|
test "panic on empty array" {
  ignore(@mypackage.head([]))  // Should panic
}
```

### Error Tests

`try?` was removed in v0.10.0. Convert an error to a `Result` by catching it:

```moonbit
///|
test "parse error" {
  let result : Result[Int, ParseError] = Ok(parse("invalid")) catch { e => Err(e) }
  debug_inspect(result, content="Err(InvalidInput)")
}
```

`Result` is a container type, so snapshot it with `debug_inspect` and
`derive(Debug)` the error type. To assert that a call panics instead, use
`try!` inside a `panic test`.
