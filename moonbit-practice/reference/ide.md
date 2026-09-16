---
title: "moon ide"
---

## Code Navigation with `moon ide`

**Use `moon ide` for code navigation in MoonBit projects instead of manual file
searching, grep, or semantic search.** It resolves symbols through the compiler,
so it distinguishes definitions from call sites and never matches comments or
string literals.

`moon ide` is served by the `moon-ide` binary shipped with the toolchain. If moon
reports `no such subcommand: 'ide'`, reinstall or upgrade the toolchain
(`moon upgrade`).

### Subcommands

| Command | Purpose |
|---|---|
| `moon ide peek-def <symbol>` | Show a symbol's definition with surrounding context |
| `moon ide find-references <symbol>` | List every usage across the project |
| `moon ide outline <path>` | Structural overview of a file or package |
| `moon ide doc '<query>'` | Discover and read APIs (supports globs) |
| `moon ide hover <symbol> -loc <file:line[:col]>` | Inferred type + doc comment at a location |
| `moon ide rename <old> <new>` | Rename a symbol project-wide |
| `moon ide analyze <path>` | Public API usage statistics |

> There is **no** `moon ide goto-definition`, and no `-tags` / `-query` flags.
> Earlier toolchains exposed that interface; it was replaced by the symbol-argument
> form below. `peek-def` covers "where is this defined", `doc` covers fuzzy search.

### Symbol syntax

All subcommands that take a `<symbol>` accept the same forms:

- `[@pkg.]symbol` — a function, constant, or type (e.g. `parse_int`, `Array`).
  Omitting `@pkg.` searches the current package and the prelude.
- `[@pkg.]Type::member` — methods, struct fields, enum variants, trait methods
  (e.g. `Array::length`, `@http.Request::new`, `Option::None`).

### `moon ide peek-def` — view definitions

```bash
moon ide peek-def <symbol> [-loc filename:line[:col]]
```

Two modes:

1. **Global search** (no `-loc`): resolves `<symbol>` using the symbol syntax above.
2. **Contextual search** (`-loc` given): matches `<symbol>` as a plain substring at
   that location. The line must be exact; the column is a hint. Use this when a
   name is ambiguous or shadowed.

```bash
$ moon ide peek-def String::rev
Found 1 symbols matching 'String::rev':
`pub fn String::rev` in package moonbitlang/core/builtin at .../string_methods.mbt:1039-1044

$ moon ide peek-def Parser -loc src/parse.mbt:46:4
Definition found at file src/parse.mbt
  | ///|
2 | priv struct Parser {
  |             ^^^^^^
  |   bytes : Bytes
  |   mut pos : Int
  | }
```

### `moon ide find-references` — track usages

```bash
moon ide find-references <symbol>
```

Always searches globally; `-loc` is not supported here. Prints the definition
first, then every reference with file:line:col and context.

```bash
$ moon ide find-references TranslationUnit
```

### `moon ide outline` — structural overview

```bash
moon ide outline .              # every .mbt file in the package
moon ide outline src/parser.mbt # one file
```

```bash
$ moon ide outline .
spec.mbt:
 L003 | pub(all) enum CStandard {
       ...
 L013 | pub(all) struct Position {
       ...
```

### `moon ide doc` — API discovery

**This is the primary tool for exploring an API.** Faster and more accurate than
grep. `moon doc <SYMBOL>` is deprecated and prints a warning pointing here.

```bash
# Empty query: list packages (in a module) or symbols (in a package)
moon ide doc ''

# Lookup by name
moon ide doc "String"            # a type and its methods
moon ide doc "@buffer"           # every exported symbol of a package
moon ide doc "@buffer.new"       # one function, with docs
moon ide doc "@encoding/utf8"    # nested package paths work

# Globbing
moon ide doc "String::*rev*"     # String methods containing "rev"
moon ide doc "*parse*"           # any symbol containing "parse"
```

```bash
$ moon ide doc "@buffer.new"
package "moonbitlang/core/buffer"

pub fn new(size_hint? : Int) -> Buffer
  Creates ...
```

### `moon ide hover` — type and docs in context

Unlike `peek-def`, which shows the source definition, `hover` shows the *inferred*
type plus doc comments at a specific location.

```bash
$ moon ide hover my_func -loc src/lib.mbt:10:4
fn my_func(x : Int) -> String
---
Documentation for my_func...

$ moon ide hover Map -loc src/lib.mbt:5:18
type Map[K, V]
---
Mutable linked hash map that maintains the order of insertion...
```

### `moon ide rename` — project-wide rename

Preferred over manual find-and-replace, which cannot tell a definition from a
same-named local.

```bash
$ moon ide rename old_name new_name
```

### `moon ide analyze` — unused public API

```bash
$ moon ide analyze .
pub fn build_report(...) -> Report  // usage: 2 (1 in test), in exports.mbt
pub fn never_called_pub() -> String // usage: 0 (0 in test), in exports.mbt

$ moon ide analyze internal/*
```

Useful before a release to find exports nobody calls, and to size the blast
radius of a signature change.

## Choosing a command

| Question | Command |
|---|---|
| "Where is `X` defined?" | `peek-def X` |
| "What is `X` here, exactly?" | `hover X -loc file:line:col` |
| "Who calls `X`?" | `find-references X` |
| "What does this package expose?" | `doc '@pkg'` |
| "Is there a method like `…rev…`?" | `doc 'String::*rev*'` |
| "What's in this file?" | `outline path` |
| "Can I drop this export?" | `analyze .` |
