---
title: "moon ide"
---


## Code Navigation with `moon ide`

**ALWAYS use `moon ide` for code navigation in MoonBit projects instead of manual file searching, grep, or semantic search.**

This tool provides two essential commands for precise code exploration:

### Core Commands

- `moon ide goto-definition` - Find where a symbol is defined
- `moon ide find-references` - Find all usages of a symbol

### Query System

Symbol lookup uses a two-part query system for precise results:

#### 1. Symbol Name Query (`-query`)

Fuzzy search for symbol names with package filtering support:

```bash
# Find any symbol named 'symbol'
moon ide goto-definition -query 'symbol'

# Find methods of a specific type
moon ide goto-definition -query 'Type::method'

# Find trait method implementations
moon ide goto-definition -query 'Trait for Type with method'

# Find symbol in specific package using @pkg prefix
moon ide goto-definition -query '@moonbitlang/x encode'

# Find symbol in multiple packages (searches in pkg1 OR pkg2)
moon ide goto-definition -query '@username/mymodule/pkg1 @username/mymodule/pkg2 helper'

# Find symbol in nested package
moon ide goto-definition -query '@username/mymodule/mypkg helper'
```

**Supported symbols**: functions, constants, let bindings, types, structs, enums, traits

**Package filtering**: Prefix your query with `@package_name` to scope the search. Multiple `@pkg` prefixes create an OR condition.

#### 2. Tag-based Filtering (`-tags`)

Pre-filter symbols by characteristics before name matching:

**Visibility tags**:

- `pub` - Public symbols
- `pub all` - Public structs with all public fields
- `pub open` - Public traits with all methods public
- `priv` - Private symbols

**Symbol type tags**:

- `type` - Type definitions (struct, enum, typealias, abstract)
- `error` - Error type definitions
- `enum` - Enum definitions and variants
- `struct` - Struct definitions
- `alias` - Type/function/trait aliases
- `let` - Top-level let bindings
- `const` - Constant definitions
- `fn` - Function definitions
- `trait` - Trait definitions
- `impl` - Trait implementations
- `test` - Named test functions

**Combine tags with logical operators**:

```bash
# Public functions only
moon ide goto-definition -tags 'pub fn' -query 'my_func'

# Functions or constants
moon ide goto-definition -tags 'fn | const' -query 'helper'

# Public functions or constants
moon ide goto-definition -tags 'pub (fn | const)' -query 'api'

# Public types or traits
moon ide goto-definition -tags 'pub (type | trait)' -query 'MyType'
```

### Practical Examples

```bash
# Find public function definition
moon ide goto-definition -tags 'pub fn' -query 'maximum'

# Find all references to a struct
moon ide find-references -tags 'struct' -query 'Rectangle'

# Find trait implementations
moon ide goto-definition -tags 'impl' -query 'Show for MyType'

# Find errors in specific package
moon ide goto-definition -tags 'error' -query '@mymodule/parser ParseError'

# Find symbol across multiple packages
moon ide goto-definition -query '@moonbitlang/x @moonbitlang/core encode'

# Combine package filtering with tags
moon ide goto-definition -tags 'pub fn' -query '@username/myapp helper'
```

### Query Processing

The tool processes queries in this order:

1. Filter symbols by `-tags` conditions
2. Extract package scope from `@pkg` prefixes in `-query`
3. Fuzzy match remaining symbols by name
4. Return top 3 best matches with location information

**Best Practice**: Start with `-tags` to reduce noise, then use `@pkg` prefixes in `-query` to scope by package for precise navigation.

## Additional IDE Commands

### `moon ide peek-def`

Display definitions inline. More accurate than grep (semantic search).

```bash
# Top-level symbol definition
$ moon ide peek-def String::rev
Found 1 symbols matching 'String::rev':
`pub fn String::rev` in package moonbitlang/core/builtin at .../string_methods.mbt:1039-1044

# Local symbol definition with location
$ moon ide peek-def Parser -loc src/parse.mbt:46:4
Definition found at file src/parse.mbt
  | ///|
2 | priv struct Parser {
  |             ^^^^^^
  |   bytes : Bytes
  |   mut pos : Int
  | }
```

### `moon ide outline`

List top-level symbols in a package or file.

```bash
# Directory (package) outline
$ moon ide outline .
spec.mbt:
 L003 | pub(all) enum CStandard {
       ...
 L013 | pub(all) struct Position {
       ...

# Single file outline
$ moon ide outline parser.mbt
```

### `moon ide hover`

Show type signature and documentation for a symbol at a specific location. Unlike `peek-def` which shows the source definition, `hover` shows the inferred type and doc comments.

```bash
# Show type and docs for a symbol at a location
$ moon ide hover my_func --loc src/lib.mbt:10:4
fn my_func(x : Int) -> String
---
Documentation for my_func...

# Show type info for a type reference
$ moon ide hover Map --loc src/lib.mbt:5:18
type Map[K, V]
---
Mutable linked hash map that maintains the order of insertion...
```

**When to use**: Use `hover` to inspect the inferred type or read documentation for a symbol in context. Use `peek-def` to jump to the source definition.

### `moon ide rename`

Rename a symbol across the entire project. Preferred over manual find-and-replace.

```bash
# Rename a symbol
$ moon ide rename old_name new_name
```

### `moon ide find-references`

Find all references to a symbol.

```bash
$ moon ide find-references TranslationUnit
```

### `moon ide analyze`

Display public APIs with usage statistics. Useful for finding unused exports (v0.8.3+).

```bash
# Analyze current package
$ moon ide analyze .
pub fn build_report(...) -> Report  // usage: 2 (1 in test), in exports.mbt
pub fn never_called_pub() -> String // usage: 0 (0 in test), in exports.mbt

# Analyze with glob pattern
$ moon ide analyze internal/*
```

## `moon doc` for API Discovery

**CRITICAL**: `moon doc '<query>'` is the primary tool for API discovery. Faster and more accurate than grep.

```bash
# Empty query: list available packages
moon doc ''

# List type methods
moon doc "String"

# List symbols in a package
moon doc "@buffer"

# Specific function details
moon doc "@buffer.new"

# Glob pattern
moon doc "String::*rev*"
```