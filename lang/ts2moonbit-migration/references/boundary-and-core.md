# Boundary Adapter + Idiomatic Core

The project policy: **the externally exported interface conforms to the JS contract, but the implementation behind it is idiomatic MoonBit.** Keep a thin adapter layer at the boundary and a clean core that never sees a JS type. This is the anti-corruption layer / ports-and-adapters pattern applied to migration.

## The two layers

```
JS / TS consumers
      │  (the captured contract: names, shapes, formats, errors)
┌─────▼───────────────────────────────────────┐
│  Boundary adapter  (one thin file per export)│  ← Any, plain structs, Int/Double,
│  - parse JS values into core types           │    _get/_set/cast, throw_error,
│  - call the core                             │    promisify — JS-shaped in/out
│  - convert core results back to JS shapes    │
├──────────────────────────────────────────────┤
│  Idiomatic MoonBit core                       │  ← enum + match, struct, Result/raise,
│  - rich types, pattern matching, no JS types  │    Map, Option, generics. NO @core.Any,
│  - the part you'd be proud to show a MoonBit  │    NO _get/_set, NO throw_error here.
│    reviewer                                   │
└───────────────────────────────────────────────┘
```

**Rule of thumb:** `@core.Any`, `_get`/`_set`/`cast`, `throw_error`, and `promisify*` live *only* in boundary files. If one appears in a core module, the abstraction has leaked — push it out to the adapter.

## Verified example

Idiomatic core — rich `enum`, `match`, typed error. No JS types:

```mbt nocheck
// core_shape.mbt
pub enum Shape {
  Circle(Double)
  Rect(Double, Double)
}

pub fn Shape::area(self : Shape) -> Double {
  match self {
    Circle(r) => 3.141592653589793 * r * r
    Rect(w, h) => w * h
  }
}

pub suberror ShapeError { ShapeError(String) }

pub fn Shape::parse(
  kind : String, a : Double, b : Double,
) -> Shape raise ShapeError {
  match kind {
    "circle" => Circle(a)
    "rect" => Rect(a, b)
    _ => raise ShapeError("unknown shape: " + kind)
  }
}
```

Thin boundary adapter — the only file that touches JS. Parses the JS object into the core enum, calls the idiomatic method, maps the typed error onto a JS `throw`:

```mbt nocheck
// boundary_shape.mbt  (gate to ["js"] in moon.pkg)
pub fn shape_area(input : @core.Any) -> Double {
  let kind : String = input._get("kind").cast()
  let a : Double = input._get("a").cast()
  let b : Double = if @core.is_undefined(input._get("b")) {
    0.0
  } else {
    input._get("b").cast()
  }
  match (try? Shape::parse(kind, a, b)) {
    Ok(shape) => shape.area()        // idiomatic core does the real work
    Err(ShapeError(msg)) => {
      @core.throw_error(msg)         // typed error -> JS Error, matches contract
      0.0
    }
  }
}
```

From JS the contract is plain and idiomatic-JS:

```js
shape_area({ kind: "circle", a: 2 });   // 12.566...
shape_area({ kind: "rect", a: 3, b: 4 }); // 12
shape_area({ kind: "tri", a: 1 });        // throws Error: unknown shape: tri
```

(Verified end-to-end with moon 0.1.x / mizchi/js 0.12.1.)

## What goes where

| Concern | Idiomatic core | Boundary adapter |
|---|---|---|
| Domain types | `enum`, `struct`, generics, `Map`, `Option` | plain `struct` / `Any` mirroring the JS shape |
| Errors | `suberror` + `raise` / `Result` | `throw_error` (if contract throws) or a `{ok,error}` struct (if it returns) |
| Numbers | the right type (`Int`, `Double`, `BigInt`) for the domain | whatever the contract's `number`/`bigint` is; convert at the edge |
| Async | `async fn` + `.wait()` | wrap with `@core.promisify*` to return `@core.Promise[T]` |
| Nullability | `Option`, real sum types | `is_nullish`/`nullable`/`from_option` against JS `null`/`undefined` |
| Collections | `Array`, `Map`, views | `Array[(String, V)]` / `Any` object — never pass `Map`/trait objects out |

## Why not "just use Any everywhere"

`Any` is a fine *bootstrapping* and *boundary* tool, but as a destination it throws away everything MoonBit is good at — exhaustive `match`, type safety, refactorability — and produces code no better than the TypeScript you left. Use `Any` to get the port compiling, then pull the logic down into typed core modules and leave only the marshalling at the boundary.

## Practical tips

- **One adapter file per exported surface**, gated `["js"]` in `moon.pkg`. The core files stay backend-agnostic (and can even be tested on `--target native` if they have no JS dependency).
- **Test the core directly** with ordinary MoonBit tests against the Phase 0 fixtures — no JS round-trip needed. Test the *adapter* through Node to confirm the contract.
- **Keep the adapter dumb.** It marshals and delegates; it contains no business logic. If you're tempted to put a branch of real logic in the adapter, it belongs in the core.
- **Refactor the core freely** once parity holds — its types are yours, not the contract's. Only the boundary signatures are frozen.
