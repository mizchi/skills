---
name: moonbit-practice
description: MoonBit code generation and packaging best practices. Use when writing MoonBit code to avoid common AI mistakes with syntax, tests, and benchmarks, or when defining and publishing a Wasm executable with SKILL.md for the MoonBit Skills Marketplace.
---

# MoonBit Practice Guide

Best practices for AI when generating MoonBit code.
If you don't understand something here, use `moonbit-docs` skill to search the official documentation.

> **Verified against MoonBit v0.10.12** (docs snapshot 2026-09). MoonBit is still
> pre-1.0 and breaks syntax on minor releases — when a construct here is rejected,
> run `moon fmt` first (it auto-migrates most deprecations) and check
> `moon explain <error-code>`.

## Guidelines

### Code Navigation: Prefer moon ide over Read/Grep

In MoonBit projects, **prefer `moon ide` commands over Read tool or grep**.

```bash
# ❌ Avoid: Reading files directly
Read src/parser.mbt

# ✅ Recommended: Find definitions from symbols
moon ide peek-def Parser::parse
moon ide doc 'Parser::*parse*'      # glob search over symbols

# ❌ Avoid: Searching with grep
grep -r "fn parse" .

# ✅ Recommended: Semantic search
moon ide find-references parse
moon ide outline src/parser.mbt
```

**Why:**
- `moon ide` provides semantic search (distinguishes definitions from call sites)
- grep picks up comments and strings
- `moon ide doc` quickly reveals APIs

**When `moon` is not installed** (sandbox, review-only checkout) none of the
verification steps this guide leans on — `moon fmt`, `moon check`, `moon test -u`,
`moon ide doc` — are available. Then: use `reference/stdlib.md` for core API
signatures instead of `moon ide doc`, leave every snapshot `content=""` for
`moon test -u` to fill later, and say explicitly in your summary which parts are
unverified. Do not hand-write values a tool was supposed to generate.

### Other Rules

- Use `moon ide doc '<Type>'` to explore APIs before implementing. `moon doc <SYMBOL>` is deprecated — it prints a warning and points at `moon ide doc`
- **Config format: use the DSL `moon.mod` / `moon.pkg`.** The JSON forms `moon.mod.json` / `moon.pkg.json` are deprecated and slated for removal; `moon fmt` migrates JSON → DSL. Samples: `assets/moon.mod`, `assets/moon.pkg`. Check reference/configuration.md before editing either
- **Executable packages use `pkgtype(kind: "executable")`**, not `options("is-main": true)`. `pkgtype(kind: "foreign_library")` replaces `options(link: true)`; plain libraries need no declaration
- **Multiple modules in one repo → use a workspace** (`moon.work`), not standalone modules. `moon work init <dirs>` creates the manifest; members share one build context and resolve each other locally. Path dependencies inside `moon.mod` are deprecated in favour of `moon.work`. See reference/configuration.md "Workspace"
- **Publishing filters live in `.moonignore`** (falling back to `.gitignore`), not the deprecated `include` / `exclude` fields in `moon.mod`
- **Examples below omit `pub`.** Anything a downstream package or a JS/Wasm host must see needs `pub` (`pub fn`, `pub struct`, `pub suberror`, `pub impl`, `pub extend`); package-local items do not.
- **Test files**: `*_test.mbt` is black-box (sees only the package's public API), `*_wbtest.mbt` is white-box (sees private items too). A bare `test "..." { }` block goes in one of those, or inline in the source file for a white-box test
- Reference files in this skill: `reference/language.md` (types, traits, pattern matching), `reference/testing.md` (test layout, snapshots, property tests, benchmarks), `reference/stdlib.md` (core APIs), `reference/configuration.md` (`moon.mod` / `moon.pkg` / workspaces), `reference/ide.md` (`moon ide`), `reference/ffi.md` and `reference/ffi-native.md` (FFI), `reference/performance.md`, `reference/refactor.md`, `reference/nix.md`, `reference/mbtx.md`, `reference/skills-marketplace.md`. **On any conflict, SKILL.md wins.**
- Check reference/mbtx.md for single-file `.mbtx` scripts (`moon run script.mbtx`, `moonx script.mbtx`, stdin via `moon run -`, inline source via `moon run -c '...'`, `import { }` prelude block)
- Check reference/skills-marketplace.md before defining or publishing an executable for skills.mooncakes.io; it covers package-local `SKILL.md`, Wasm targets, `moonx`, host capabilities, policy, and release verification

## Common Pitfalls

- **Don't use uppercase for variables/functions** - compilation error
- **`mut` is only for reassignment, not field mutation** - Array push doesn't need it
- **`return` is unnecessary** - last expression is the return value
- **Methods require `Type::` prefix**
- **`++` `--` not supported** - use `i = i + 1` or `i += 1`
- **No `try` needed for error propagation** - automatic (unlike Swift)
- **No `await` keyword** - just declare with `async fn`
- **Prefer range for over C-style** - `for i in 0..<n {...}`
- **`nobreak` not `else`** for functional for-loop exit values (`else` is deprecated)
- **Legacy syntax**: `function_name!(...)` and `function_name(...)?` are deprecated
- **`for { ... }` is deprecated** - use `for ;; { ... }` or `while true { ... }` for infinite loops
- **Cross-package `.` syntax for `impl` removed** - `.` method call only works within the same package
- **`trait`/`impl` methods require the `fn` keyword (v0.10.0)** - `moon fmt` migrates old code; see "Migrating a trait or impl" below
- **Attach trait methods with `extend` (v0.10.4)** - implicit `impl` → method attachment is deprecated; see "Migrating a trait or impl" below
- **`try?` is gone (v0.10.0)** - use `Ok(expr) catch { e => Err(e) }` for a `Result`, `try!` to panic on error
- **Struct `fn new(..)` constructor removed (v0.10.0)** - use a user-defined constructor `fn Type::Type(..)`; since v0.10.4 any type can define one, not just structs
- **`immut/array` removed (v0.10.9)** - deprecated in v0.9. Import `"moonbitlang/core/immut/vector"` in `moon.pkg` (default alias `@immut/vector`, i.e. the path after `moonbitlang/core/`) and use `@immut/vector.Vector`
- **`from_array` on immutable containers is deprecated (v0.10.4)** - use the type-named constructor, e.g. `@immut/vector.Vector([1, 2, 3])`
- **View operators reject negative indices (v0.10.4)** - `xs[-1:]` no longer means "from the end"
- **`moonbitlang/sys` is deprecated (v0.10.9)** - use `moonbitlang/core/env`: `let argv = @env.args()` (element 0 is the program, so CLI arguments are `argv[1:]`)
- **`@debug.to_repr(x)` is deprecated (v0.10.9)** - use `@debug.Repr(x)`
- **`guard` without `else` must be provably total (v0.10.9)** - otherwise E0087; write `guard!` when a panic is intended
- **Or-pattern `with` branches need parentheses (v0.10.9)** - `Some(x) | (None with x = 0)`
- **`inspect` superseded by `debug_inspect` for container/custom types (v0.9.2)** - `Show` for container types (`Array`/`Map`/`Set`/`Option`/`Result`/tuples) is deprecated; see "Snapshot Tests"
- **Default build target is `wasm` (v0.10.9)** - pass `--target js` / `--target native` explicitly, or set `preferred_target` in `moon.mod`

## Common Syntax Mistakes by AI

### Type Parameter Position

```moonbit
///| NG: fn identity[T] is old syntax
fn identity[T](val: T) -> T { val }

///| OK: Type parameter comes right after fn
fn[T] identity(val: T) -> T { val }
```

### raise Syntax

```moonbit
///|
/// NG: -> T!Error was removed
fn parse(s: String) -> Int!Error { ... }

///|
/// OK: Use raise keyword
fn parse(s: String) -> Int raise Error { ... }
```

`Int raise` is shorthand for `Int raise Error`.
async fn implicitly raises by default; use `noraise` to enforce no errors.

### Macro Calls

```moonbit
///|
/// NG: ! suffix was removed
assert_true!(true)

///|
/// OK
assert_true(true)
```

### Migrating a trait or impl

Two changes always fire together on the same code, so do both in one pass:

1. **v0.10.0** — add `fn` to the trait method *and* the `impl`.
2. **v0.10.4** — add an `extend` declaration for every trait method that callers
   invoke with dot syntax (`value.f()`); without it the dot call relies on
   deprecated implicit attachment.

`moon fmt` performs step 1 only. Step 2 is manual.

```moonbit
///| NG: method without fn (deprecated, warns then removed)
trait I {
  f(Self) -> Unit
}
impl I for Int with f(_) {}

///| OK: fn keyword on both the trait method and the impl
trait I {
  fn f(Self) -> Unit
}
impl I for Int with fn f(_) {}
```

Polymorphic trait methods: the method's own type parameters go **after `fn`**,
the impl's own type parameters stay after `impl`.

```moonbit
trait Logger {
  fn[X : Show] write_object(Self, X) -> Unit
}
impl Logger for StringBuilder with fn write_object(self, x) {
  self.write_string(x.to_string())
}

impl[A] Poly for Array[A] with fn[X] f(self, x : X) { ... }
//   ^^^ impl type params                  ^^^ method type params
```

`moon fmt` rewrites old trait/impl syntax automatically.

### Attach trait methods with `extend` (v0.10.4)

Writing `impl Trait for Type` used to silently attach every trait method to
`Type` as a dot-callable method. That is deprecated: an upstream trait gaining a
default method could make an existing `value.f()` ambiguous. Declare the
attachment explicitly instead.

```moonbit
///| NG (deprecated): relying on implicit attachment
impl Show for Point with fn output(self, logger) { ... }
let s = p.output(logger)   // implicit attachment, warns under warning 79

///| OK: attach the methods you want callable with dot syntax
impl Show for Point with fn output(self, logger) { ... }
pub extend Point with Show::{ output, to_string }
```

- General form: `extend Type with Trait::{ method1, method2 }`. `pub` makes the
  attached methods public; without it they are package-local.
- When the attached method uses a trait default, `Self` specializes to `Type`.
- Trait objects can be extended too: `extend &Derived with Super::{ method }`.
- Without an `extend`, still call through the trait: `Trait::method(value, ...)`.
- Warning `implicit_impl_as_method` (79) flags the deprecated pattern; it is off
  by default, so enable it (`moon check --warn-list +79`) when migrating a library.

### Structs, Constructors, Methods

The removed `fn new(..)` special form is replaced by a plain user-defined
constructor `fn Type::Type(..)` — available for any type since v0.10.4, not just
structs. Methods take the receiver as `self : Self`.

```moonbit
///| Struct with derives
struct Point {
  x : Int
  y : Int
} derive(Eq, Debug)

///| User-defined constructor (replaces removed `fn new`)
fn Point::Point(x : Int, y : Int) -> Point {
  { x, y }  // field-punning struct literal
}

///| Method: receiver `self : Self`, last expression is the return value
fn Point::manhattan(self : Self) -> Int {
  self.x.abs() + self.y.abs()
}

///| Call site: a declared constructor is called by the *type name*, not `Type::Type`
let p = Point(1, 2)

///| Constructors are ordinary functions, so they take labelled and optional
/// arguments and may raise:
fn Endpoint::Endpoint(host : String, port? : Int = 80) -> Endpoint {
  Host(host, port)
}
let e = Endpoint("example.com", port=443)
```

Without a declared constructor, a struct is still built with the record literal
`Point::{ x: 1, y: 2 }` (or bare `{ x: 1, y: 2 }` when the type is known). Declare
`fn Type::Type(..)` when construction needs validation, defaults, or a shorter
call — then prefer `Point(1, 2)` at every call site.

### Multi-line Text

```moonbit
let text =
  #|line 1
  #|line 2
```

### Comments and Block Separators

`///|` is a block separator. `///` comments attach to the following `///|` block.

```moonbit
///|
/// This function is foo
fn foo() -> Unit { ... }

///|
/// This function is bar
fn bar() -> Unit { ... }
```

Avoid consecutive `///|` at the file beginning as they create separate blocks.

## Snapshot Tests

`moon test -u` auto-fills the empty `content=""` of `inspect(val)` /
`debug_inspect(val)`. **Which to use (v0.9.2+):**

- **Primitives / strings** → `inspect` (`Show` is fine here)
- **Container types** (`Array`/`Map`/`Set`/`Option`/`Result`/tuples) **and custom
  types** → `debug_inspect`, because `Show` for these containers is deprecated and
  `Debug` gives structured, indented output. Keep `Show` for human-facing
  formatting only.
- **Deeply nested structures** → `@json.inspect`, whose JSON output stays readable
  after formatting. Requires `derive(ToJson)`.

Choose by the inspected expression's **static type**, not the runtime value:
`Result[Int, _]` is a container even when it holds `Ok(123)`, and the rule
propagates — to snapshot/assert a custom type (even nested inside a container) the
custom type must `derive(Debug)`, and equality via `@debug.assert_eq` additionally
needs `derive(Eq)`.

```moonbit
test "snapshot" {
  inspect("hello", content="")          // primitive/string -> inspect
  debug_inspect([1, 2, 3], content="")  // container -> debug_inspect
}

///| Custom type: derive Debug to snapshot, derive Eq to assert_eq
struct P {
  x : Int
} derive(Eq, Debug)

test "custom type" {
  debug_inspect(P::{ x: 1 }, content="")
  @debug.assert_eq(P::{ x: 1 }, P::{ x: 1 })
}
```

After `moon test -u`:

```moonbit
test "snapshot" {
  inspect("hello", content="hello")
  debug_inspect([1, 2, 3], content="[1, 2, 3]")
}
```

**Write `content=""` and let `moon test -u` fill it in. Never hand-write the
expected string** — `Debug` rendering is structural and differs from `Show`, so a
guessed value produces a test that fails on first run. If you cannot run the
toolchain, leave every `content=""` empty and say so; an empty snapshot is an
honest TODO, a wrong one is a false assertion.

For reference, these are the shapes `Debug` produces:

| Inspected value | `debug_inspect` renders |
|---|---|
| `[1, 2, 3]` | `[1, 2, 3]` |
| `P::{ x: 1 }` (struct) | `{x: 1}` |
| `Host("example.com", 443)` (enum with payload) | `Host("example.com", 443)` |
| `Err(InvalidEof)` (`Result` + `suberror`) | `Err(InvalidEof)` |

Long values are wrapped and indented, which is another reason to let `-u` write
them.

## Property Tests (v0.10.9)

QuickCheck now lives in the standard library as `moonbitlang/core/quickcheck`
(alias `@quickcheck`) — do **not** add a separate `moonbitlang/quickcheck`
dependency. Two entry points:

- `@quickcheck.check(property)` — raises on failure, silent on success. The type
  under test needs `Arbitrary + Shrink + Debug`.
- `@quickcheck.report(property)` — returns a structured `QuickCheckReport` instead
  of raising; needs only `Arbitrary + Shrink`.

```moonbit
test "reverse is an involution" {
  @quickcheck.check((xs : Array[Int]) => xs.rev().rev() == xs)
}
```

`derive(Arbitrary)` and `derive(Shrink)` generate the instances for custom types.
Optional labelled args tune the run: `count?`, `max_size?`, `max_shrinks?`,
`seed?` (reproducing a failure), `filter?` with `discard_ratio?`, and `observe?`
for statistics via `@quickcheck.{label, classify, collect}`.

## Doc Tests

Available in `.mbt.md` files or `///|` inline comments.

| Code Block | Behavior |
|------------|----------|
| ` ```mbt check ` | Checked by LSP |
| ` ```mbt test ` | Executed as `test {...}` |
| ` ```moonbit ` | Display only (not executed) |

Example (inline comment):

```moonbit

///|
/// Increment an integer by 1
/// ```mbt test
/// inspect(incr(41), content="42")
/// ```
pub fn incr(x : Int) -> Int {
  x + 1
}
```

## Pre-release Checklist

Run before releasing:

```bash
moon fmt   # Format code (also migrates deprecated syntax and JSON config)
moon info  # Generate type definition files
```

`pkg.generated.mbti` is auto-generated by `moon info`. Don't edit it directly.

## Exploring Built-in Type Methods

```bash
moon ide doc StringView   # StringView methods
moon ide doc Array        # Array methods
moon ide doc Map          # Map methods
```

## Quick Reference

| Topic | Command | Details |
|-------|---------|---------|
| Test | `moon test` | https://docs.moonbitlang.com/en/stable/language/tests |
| Update snapshots | `moon test -u` | Same as above |
| Filtered test | `moon test --filter 'glob'` | Run specific tests |
| Benchmark | `moon bench` | https://docs.moonbitlang.com/en/stable/language/benchmarks |
| Doc Test | `moon check` / `moon test` | https://docs.moonbitlang.com/en/stable/language/docs |
| Format | `moon fmt` | Also migrates deprecated syntax + JSON config |
| Generate types | `moon info` | - |
| Explain an error code | `moon explain E0087` | Or `moon check --explain` |
| Doc reference | `moon ide doc <Type>` | `moon doc <SYMBOL>` is deprecated |
| Search the registry | `moon search <keyword>` | `--json` for machine output |
| Run a registry tool | `moonx author/mod/cmd/tool` | Replaces the deprecated `moon runwasm` |
| Proof checking | `moon prove` | No separate Why3 install needed (v0.10.9) |
| Workspace init | `moon work init` | See reference/configuration.md |
| Workspace add | `moon work use mod1 mod2` | Add modules to workspace |
| API usage analysis | `moon ide analyze .` | Show public API usage stats |

## moon ide Tools

More accurate than grep for code navigation. See `reference/ide.md` for details.
The subcommands are `peek-def`, `find-references`, `outline`, `doc`, `hover`,
`rename`, and `analyze` — there is no `goto-definition`.

```bash
# Show symbol definition (global search by symbol syntax)
moon ide peek-def Parser::read_u32_leb128

# Package outline
moon ide outline .

# Find references
moon ide find-references TranslationUnit

# Peek a definition from a source location (contextual, substring match)
moon ide peek-def Parser -loc src/parse.mbt:46:4

# Show type signature and docs at a location (unlike peek-def, shows inferred type + doc comments)
moon ide hover my_func -loc src/lib.mbt:10:4

# Rename symbol across the project
moon ide rename old_name new_name

# Analyze public API usage
moon ide analyze .              # Current package
moon ide analyze internal/*     # Glob pattern
```

## Functional for loop

Prefer functional for loops whenever possible. More readable and easier to reason about.

```moonbit
// Functional for loop with state
for i = 0, sum = 0; i <= 10 {
  continue i + 1, sum + i  // Update state
} nobreak {
  sum  // Value at loop exit (nobreak, not else)
}

// Range for (recommended)
for i in 0..<n { ... }
for i, v in array { ... }  // index and value

// Range for carrying extra loop state (v0.10.0)
for x in xs; sum = 0; sum = sum + x { ... }

// Infinite loop (for { } is deprecated)
for ;; { ... }
```

When a loop is labelled, `break` / `continue` inside it must use the label too —
an unlabelled one directly inside a labelled loop is deprecated.

## Labelled Blocks (v0.10.9)

A block can carry a label; `break label~ value` exits it with that value. Use it
to bail out of nested control flow without returning from the function.

```moonbit
fn absolute(n : Int) -> Int {
  result~: {
    if n < 0 {
      break result~ -n
    }
    n
  }
}
```

An unlabelled `break` cannot leave a labelled block, and `continue` only targets
loops. Block and loop labels share one namespace — reusing an enclosing label
shadows it and reports E0036.

## Iterators and List Comprehensions

`[for .. => body]` builds an array; add `if <guard>` before `=>` to filter. The
result type follows the expected type — `Array` by default, but also
`FixedArray`, `ReadOnlyArray`, `String`, `Bytes`, or `Json`.

```moonbit
let evens = [for i in 0..<100 if i % 2 == 0 => i]
let labelled = [for i, x in ["a", "b", "c"] => "\{i}: \{x}"]
let text : String = [for x in 0..<3 => (x + 'a').unsafe_to_char()]
```

`return` / `break` / `continue` are not allowed inside a comprehension.

**Build an `Iter` with the explicit `[| .. |]` literal (v0.10.4)** — relying on the
expected type to turn `[x, ..xs]` into an `Iter` is deprecated, because it
silently changes evaluation order.

```moonbit
let prefix = [| 1, 2, 3 |]
let values = [| ..prefix, 4, 5 |]        // ..xs evaluated now, consumed lazily
let squares = [| for x in 1..<=3 => x * x |]  // fully lazy
```

For a lazy or infinite sequence with carried state, build the `Iter` directly:

```moonbit
let mut p1 = 1
let mut p2 = 0
let fibs : Iter[Int] = Iter::new(fn() {
  let next = p1
  p1 = p1 + p2
  p2 = next
  Some(next)
})
let first_six = fibs.take(6).collect()
```

Iterators are single-pass — once consumed by `each` / `fold` / `collect`, ask the
source for a fresh one.

## Template Write `<+` (v0.10.0)

`buf <+ expr` appends to a `StringBuilder` — terser than `write_string`, pairs
well with `$|` interpolation for building markup/strings. `buf <? expr` writes
conditionally.

```moonbit
let buf = StringBuilder()
buf <+ "<ul>"
for item in items {
  buf <+ $|<li>\{item}</li>
}
buf <+ "</ul>"
buf.to_string()
```

Bytes support interpolation too: `let b : Bytes = b"value=\{x}"` (UTF-8 encoded).

## Regex: `=~`, `lexmatch`, `lexscan`

Three constructs, picked by what you need:

| Need | Construct |
|---|---|
| One boolean check | `input =~ re"abc"` |
| Several regex cases returning different values | `lexmatch input with longest { ... }` |
| Tokenize a stream, advancing a cursor | `lexscan` over `@lexbuf.{Lexbuf, AsyncLexbuf, StringScanner}` |

```moonbit
///| Boolean search (first-match, search-based — anchor with ^ / $ if needed)
let matched = s =~ re"abc"

///| Bind the match and the surrounding text
if s =~ (re"[0-9]+" as digits, before~, after~) { ... }

///| Multi-case dispatch over a String / StringView
let kind = lexmatch input with longest {
  (re"^[ \t\r\n]+") => Space
  (re"^[A-Za-z][A-Za-z0-9_]*" as t) => Ident(t)
  _ => Other
}
```

The right-hand side must be a regex **constant** expression (a literal, a `const`,
or constants combined with `+` / `|` / parentheses) — runtime strings are rejected.
The old experimental string-piece `lexmatch` patterns and `lexmatch?` have been
removed; `lexscan` became stable in v0.10.9.

## String Constants

`const` supports string concatenation and interpolation (v0.8.3+):

```moonbit
const Hello : String = "Hello"
const HelloWorld : String = Hello + " world"
const Message : String =
  $|========
  $|\{HelloWorld}
  $|========
```

## Error Handling

MoonBit uses checked errors. See `reference/ffi.md` for details.

Three declaration shapes — pick the smallest that fits:

```moonbit
///| No payload at all (the common case for a single failure mode).
/// This declares an error type `EmptyInput` with one payload-free constructor
/// of the same name — `raise EmptyInput` works directly.
suberror EmptyInput

///| One constructor carrying a payload — the constructor repeats the type name
suberror DivError { DivError(String) }

///| Several constructors, like an enum
suberror ParseError {
  InvalidEof
  InvalidChar(Char)
}
```

Visibility works as elsewhere: `pub suberror` / `pub(all) suberror` / `priv suberror`.

**Derive `Debug` on every error type you might snapshot or print.** A `Result`
returned by the catch form below is a container, so `debug_inspect` needs `Debug`
on *both* sides — including the error:

```moonbit
suberror ParseError {
  InvalidEof
  InvalidChar(Char)
} derive(Eq, Debug)
```

```moonbit
///| Declare with raise, auto-propagates
fn parse(s: String) -> Int raise ParseError {
  if s.is_empty() { raise ParseError::InvalidEof }
  ...
}

///| Convert to Result — `try?` was removed (v0.10.0)
let result : Result[Int, ParseError] = Ok(parse(s)) catch { e => Err(e) }

///| Single expression with a fallback: omit `try`
let n = parse(s) catch { _ => 0 }

///| Panic instead of handling
let n = try! parse(s)

///| Full form: `noraise` branch handles the success value
let n = try parse(s) catch {
  ParseError::InvalidEof => -1
  _ => 0
} noraise {
  v => v
}
```

Snapshotting the result of that conversion — the composed case:

```moonbit
test "parse failure" {
  let r : Result[Int, ParseError] = Ok(parse("")) catch { e => Err(e) }
  debug_inspect(r, content="")   // moon test -u fills in Err(InvalidEof)
}
```

If you annotate the binding with the concrete error type (`Result[Int, ParseError]`
rather than `Result[Int, Error]`), the error side has a `Debug` instance and the
snapshot works. A bare `Error` is an open type with no `derive` you can attach —
narrow the signature to your own `suberror`, or match the error and snapshot the
branch instead.

### Cleanup: `defer` and `errdefer` (v0.10.9)

```moonbit
///| defer: always runs on leaving the body (return / break / continue / raise)
fn read_all(path : String) -> String raise {
  let f = open(path)
  defer f.close()
  f.read_to_string()
}

///| errdefer: runs only when the body raises or is cancelled.
/// Use it when the resource is handed to the caller on success.
async fn connect(addr : Addr) -> Tcp {
  let sock = make_tcp_socket()
  errdefer sock.close()
  connect_tcp_socket(sock, addr)
  sock
}
```

Consecutive `defer`s run in reverse order. `return` / `break` / `continue` are
disallowed on the right-hand side; the cleanup may itself raise (and in async
code await), in which case its error replaces the original. An `errdefer` in a
body that cannot raise reports E0091; a catch-all that only cleans up and
re-raises should become an `errdefer` (E0092).

### Guard (v0.10.9)

`guard` performs exhaustiveness analysis. A `guard` that may fail needs an `else`;
if the compiler cannot prove it always succeeds it reports E0087. Use `guard!`
when terminating is intended — `guard!` takes no `else`.

```moonbit
fn require_some(value : Int?) -> Int {
  guard! value is Some(result)
  result
}
```

A redundant `!` or `else` on an exhaustive condition now warns.

## CI and Publishing

### Third-party actions

Prefer the **official curl installer** (`assets/ci.yaml`) or **Nix with moonbit-overlay** (`assets/ci-nix.yaml`) over third-party actions such as `hustcer/setup-moonbit@v1`. The installer is short and adds nothing to the action supply chain; the Nix path is fully reproducible when a `flake.nix` is present.

### `moon update` is mandatory

Runners start with an empty registry index. Any registry-hosted MoonBit dependency makes `moon check` / `moon test` / `moon build` fail with `Failed to resolve registry dependency` until you run `moon update`. Put it immediately after installing the CLI in every workflow that touches mooncakes.

### Publishing an npm package whose build depends on MoonBit

Some projects (e.g. Vite plugins, language tooling) ship as npm packages but run `moon` inside `pnpm build` — for instance `pnpm build:parser` that calls `moon -C tools/parser build --release --target js`. In that case the npm publish workflow needs both the MoonBit CLI and `moon update` **before** `pnpm build`, otherwise the build fails on CI.

See `assets/publish-to-npm.yaml` for a minimal release-triggered publish workflow that uses OIDC Trusted Publishing (no `NPM_TOKEN`) and sets up MoonBit correctly. Pair it with a release automation tool (see the `npm-release` skill for a release-please + OIDC setup) to avoid manual `npm publish` calls.

### Publishing to mooncakes.io

Package contents are filtered by `.moonignore` (or `.gitignore` when absent);
dot-prefixed files and `_build/` are excluded by default. mooncakes.io rejects
package names that differ from an existing one only by case. Verify the artifact
before publishing:

```bash
moon publish --dry-run -v
unzip -l _build/publish/<author>-<module>-<version>.zip
```

## Assets

- `assets/moon.mod` — module config sample in the DSL (replaces moon.mod.json)
- `assets/moon.pkg` — package config sample in the DSL (replaces moon.pkg.json)
- `assets/ci.yaml` — GitHub Actions CI (curl installer)
- `assets/ci-nix.yaml` — GitHub Actions CI with Nix (moonbit-overlay)
- `assets/publish-to-npm.yaml` — release-triggered npm publish with MoonBit build and OIDC Trusted Publishing

### Nix Setup (moonbit-overlay)

[moonbit-community/moonbit-overlay](https://github.com/moonbit-community/moonbit-overlay) provides a Nix flake overlay for reproducible MoonBit builds.

Minimal `flake.nix` for a MoonBit project:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    moonbit-overlay.url = "github:moonbit-community/moonbit-overlay";
    moon-registry = {
      url = "git+https://mooncakes.io/git/index";
      flake = false;
    };
  };

  outputs = { nixpkgs, moonbit-overlay, moon-registry, ... }:
    let
      system = "x86_64-linux"; # or aarch64-darwin, etc.
      pkgs = import nixpkgs {
        inherit system;
        overlays = [ moonbit-overlay.overlays.default ];
      };
      moonHome = pkgs.moonPlatform.bundleWithRegistry {
        cachedRegistry = pkgs.moonPlatform.buildCachedRegistry {
          moonModJson = ./moon.mod.json;
          registryIndexSrc = moon-registry;
        };
      };
    in {
      devShells.${system}.default = pkgs.mkShellNoCC {
        packages = [ moonHome pkgs.git ];
        env.MOON_HOME = "${moonHome}";
      };
    };
}
```

Key APIs from the overlay:
- `pkgs.moonPlatform.buildMoonPackage` - Build a MoonBit package as a Nix derivation
- `pkgs.moonPlatform.bundleWithRegistry` - Create a MOON_HOME with cached registry
- `pkgs.moonPlatform.buildCachedRegistry` - Pre-fetch mooncakes registry dependencies

> The overlay's `moonModJson` argument still expects a JSON manifest. If your
> module has migrated to `moon.mod`, keep a generated `moon.mod.json` for Nix or
> check the overlay for DSL support before dropping it.
