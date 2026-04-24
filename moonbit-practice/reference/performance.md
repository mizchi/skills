---
title: "MoonBit Performance Tuning"
---

# MoonBit Performance Tuning

## View Types Overview

View types are **zero-copy, non-owning, read-only slices**. They don't allocate memory and are ideal for passing sub-sequences without copying data.

| Original Type | View Type | Slice Syntax |
|---------------|-----------|--------------|
| `String` | `StringView` | `s[:]`, `s[start:end]` |
| `Bytes` | `BytesView` | `b[:]`, `b[start:end]` |
| `Array[T]` | `ArrayView[T]` | `a[:]`, `a[start:end]` |
| `FixedArray[T]` | `ArrayView[T]` | `a[:]`, `a[start:end]` |

## StringView

### Creating StringView

```moonbit
let s = "hello world"
let view : StringView = s[:]           // Entire string
let hello : StringView = s[0:5]        // "hello"
let world : StringView = s[6:]         // "world"
let partial : StringView = s[:5]       // "hello"
```

### StringView for Function Parameters

```moonbit
///|
/// BAD: Takes ownership, may copy
fn process_string(s : String) -> Unit {
  // ...
}

///|
/// Good: Zero-copy, no allocation
fn process_string_view(s : StringView) -> Unit {
  // ...
}

// Both work - implicit conversion
process_string_view("hello")
process_string_view(some_string[:])
```

### Unicode Safety

StringView slicing may raise at surrogate boundaries (UTF-16 edge case):

```moonbit
fn safe_slice(s : String, start : Int, end : Int) -> StringView raise {
  s[start:end]  // May raise on invalid boundaries
}

// Or use try! if you're certain
let view = try! s[start:end]
```

### StringView Methods

```bash
moon doc StringView
```

Common operations:
- `view.length()` - Length in code units
- `view.to_string()` - Convert back to owned String
- `view.iter()` - Iterate over characters

## ArrayView

### Creating ArrayView

```moonbit
let arr = [1, 2, 3, 4, 5]
let view : ArrayView[Int] = arr[:]      // Entire array
let first3 : ArrayView[Int] = arr[0:3]  // [1, 2, 3]
let last2 : ArrayView[Int] = arr[3:]    // [4, 5]
```

### ArrayView for Function Parameters

```moonbit
///|
/// BAD: Takes ownership
fn sum_array(arr : Array[Int]) -> Int {
  arr.fold(init=0, fn(a, b) { a + b })
}

///|
/// Good: Zero-copy, accepts slices
fn sum_view(arr : ArrayView[Int]) -> Int {
  arr.fold(init=0, fn(a, b) { a + b })
}

// Both work
sum_view([1, 2, 3])        // Array literal
sum_view(arr[:])           // Full array
sum_view(arr[1:4])         // Slice
```

### Pattern Matching with Views

```moonbit
fn process(view : ArrayView[Int]) -> Unit {
  match view {
    [] => println("empty")
    [x] => println("single: \{x}")
    [first, ..rest] => {
      println("first: \{first}")
      process(rest)  // rest is ArrayView
    }
  }
}
```

### ArrayView Methods

```bash
moon doc ArrayView
```

Common operations:
- `view.length()` - Number of elements
- `view[i]` - Index access
- `view.iter()` - Iterator
- `view.to_array()` - Convert to owned Array

## BytesView

### Creating BytesView

```moonbit
let bytes : Bytes = b"hello"
let view : BytesView = bytes[:]
let first2 : BytesView = bytes[0:2]
```

### BytesView for Binary Data

```moonbit
///|
/// Good: Zero-copy binary parsing
fn parse_header(data : BytesView) -> Header raise ParseError {
  guard data.length() >= 4 else { raise ParseError::TooShort }
  let magic = data[0:2]
  let version = data[2:4]
  // ...
}
```

## Performance Patterns

### Avoid Unnecessary Allocations

```moonbit
///|
/// BAD: Creates intermediate strings
fn join_with_separator(parts : Array[String], sep : String) -> String {
  let mut result = ""
  for i, part in parts {
    if i > 0 { result = result + sep }
    result = result + part  // Allocates each time!
  }
  result
}

///|
/// Good: Use StringBuilder
fn join_with_separator(parts : Array[String], sep : String) -> String {
  let sb = StringBuilder::new()
  for i, part in parts {
    if i > 0 { sb.write_string(sep) }
    sb.write_string(part)
  }
  sb.to_string()
}
```

### Use Views in Recursive Functions

```moonbit
///|
/// Good: No copying in recursion
fn binary_search(arr : ArrayView[Int], target : Int) -> Int? {
  guard arr.length() > 0 else { None }
  let mid = arr.length() / 2
  if arr[mid] == target {
    Some(mid)
  } else if arr[mid] > target {
    binary_search(arr[:mid], target)
  } else {
    binary_search(arr[mid + 1:], target).map(fn(i) { i + mid + 1 })
  }
}
```

## Converting Back to Owned Types

When you need ownership:

```moonbit
let string_view : StringView = "hello"[:]
let owned_string : String = string_view.to_string()

let array_view : ArrayView[Int] = [1, 2, 3][:]
let owned_array : Array[Int] = array_view.to_array()

let bytes_view : BytesView = b"data"[:]
let owned_bytes : Bytes = bytes_view.to_bytes()
```
