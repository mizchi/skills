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

Use `inspect()` for snapshot testing. Run `moon test -u` to auto-update.

```moonbit
test "snapshot" {
  inspect([1, 2, 3], content="")  // Empty initially
}
```

After `moon test -u`:

```moonbit
test "snapshot" {
  inspect([1, 2, 3], content="[1, 2, 3]")
}
```

### inspect vs @json.inspect

- `inspect()` - Uses `Show` trait, good for simple values
- `@json.inspect()` - Uses `ToJson` trait, better for complex nested structures

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

Add to `moon.pkg.json`:

```json
{
  "test-import": [
    "moonbitlang/quickcheck"
  ]
}
```

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

### Shrinking

QuickCheck automatically shrinks failing inputs to find minimal counterexamples:

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

Use `try?` to convert errors to `Result`:

```moonbit
///|
test "parse error" {
  let result = try? parse("invalid")
  inspect(result, content="Err(ParseError::InvalidInput)")
}
```
