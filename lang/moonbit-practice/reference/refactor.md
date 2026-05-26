---
title: "MoonBit Refactoring Patterns"
---

# MoonBit Refactoring Patterns

## Prefer match-if Pattern for Two-way Branches with No-op

```moonbit
let opt : Int? = Some(1)

///|
/// BAD
match opt {
  Some(v) => println("hello")
  None => ()
}

///|
/// Good
if opt is Some(v) {
  println("hello")
}
```

## Prefer guard for Early Returns

Use `guard` when you want to exit early if a condition is not met.

```moonbit
///|
/// BAD: Deep nesting
fn get_value(array : Array[Int], index : Int) -> Int? {
  if index >= 0 && index < array.length() {
    Some(array[index])
  } else {
    None
  }
}

///|
/// Good: Early return with guard
fn get_value(array : Array[Int], index : Int) -> Int? {
  guard index >= 0 && index < array.length() else { None }
  Some(array[index])
}
```

Combine with pattern matching:

```moonbit
///|
/// BAD: Deep nesting with match
fn process(resources : Map[String, Resource], path : String) -> String raise Error {
  match resources.get(path) {
    Some(resource) => {
      match resource {
        PlainText(text) => process(text)
        _ => fail("\{path} is not plain text")
      }
    }
    None => fail("\{path} not found")
  }
}

///|
/// Good: Flatten with guard is
fn process(resources : Map[String, Resource], path : String) -> String raise Error {
  guard resources.get(path) is Some(resource) else { fail("\{path} not found") }
  guard resource is PlainText(text) else { fail("\{path} is not plain text") }
  process(text)
}
```

## Prefer StringView for String Performance

```moonbit
///|
/// BAD: String concatenation creates new strings each time
fn process_string(s : String) -> String {
  ...
}

///|
/// Good: StringView avoids copying
fn process_string_view(s : StringView) -> Unit {
  ...
}
```

## Prefer for-in over C-style for

```moonbit
///|
/// BAD: C-style for
for i = 0; i < items.length(); i = i + 1 {
  println(items[i])
}

///|
/// Good: for-in
for item in items {
  println(item)
}

///|
/// Good: When index is needed
for i, item in items {
  println("\{i}: \{item}")
}
```

## Prefer Arrow Functions for Single Expressions

```moonbit
///|
/// BAD: Verbose
let f = fn(x) { x + 1 }
arr.map(fn(x) { x * 2 })

///|
/// Good: Arrow function
let f = fn { x => x + 1 }
arr.map(fn { x => x * 2 })
```

## Use else with for Loops to Return Values

```moonbit
///|
/// BAD: Using variable to hold result
fn find_first(arr : Array[Int], target : Int) -> Int? {
  let mut result : Int? = None
  for i in arr {
    if i == target {
      result = Some(i)
      break
    }
  }
  result
}

///|
/// Good: Return directly with for-else
fn find_first(arr : Array[Int], target : Int) -> Int? {
  for i in arr {
    if i == target {
      break Some(i)
    }
  } else {
    None
  }
}
```
