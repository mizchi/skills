# TypeScript Integration

MoonBit's JS backend emits `.d.ts` alongside `.js` automatically. Public functions become type-safe imports from TypeScript consumers.

## Build Output

```
_build/js/debug/build/
├── <pkg>.js         # ES module / CJS / IIFE (per link.js.format)
├── <pkg>.js.map     # source map
├── <pkg>.d.ts       # TypeScript declarations
└── moonbit.d.ts     # MoonBit primitive type aliases (Int, UInt, etc.)
```

Example emitted `.d.ts` (for the skill's sample project):

```ts
import type * as MoonBit from "./moonbit.d.ts";

export function greet(name: MoonBit.String): MoonBit.String;

export function add(a: MoonBit.Int,
                    b: MoonBit.Int): MoonBit.Int;
```

`MoonBit.Int` aliases `number`, `MoonBit.String` aliases `string`, etc. The aliases preserve the original MoonBit semantics as documentation without blocking TypeScript's structural types.

## Format Choice

Set in `moon.pkg`:

```
options(
  link: {
    "js": {
      "exports": ["add", "greet"],
      "format": "esm",   // "esm" | "cjs" | "iife"
    },
  },
)
```

| Format | When to use |
|---|---|
| `esm` | modern bundlers (Vite, esbuild, Rollup), Node 18+ with `"type": "module"` |
| `cjs` | legacy Node, `require()` consumers |
| `iife` | directly included via `<script>` tag; exposes `exports` on a global |

## Renaming Exports

Use `"source:alias"` syntax:

```
"exports": ["fib:fibonacci", "add"],
```

Compiles MoonBit `fib` to a JS export named `fibonacci`. Useful when the MoonBit name collides with reserved words or the JS conventions differ.

## Consuming from TypeScript

Given the generated `.d.ts`, a TypeScript consumer needs no manual typings:

```ts
// consumer.ts
import { add, greet } from "./_build/js/release/build/my_pkg.js";

const sum: number = add(2, 3);
const hello: string = greet("world");
```

For production, copy the output (or symlink) into your app's source tree and add a `moonbit.d.ts` reference path.

## Async-Returning Exports

If you export a MoonBit `async fn`, wrap it with `run_async` + `PromiseResolvers` so the JS caller receives a regular `Promise` (see `promise-bridging.md`). The generated `.d.ts` will show `Promise<T>` in the return position.

## Pitfalls

1. **Trait objects leak MoonBit internals.** `pub fn foo(x : SomeTrait)` generates a `.d.ts` signature using MoonBit's internal dictionary representation. Expose concrete types or opaque `#external` types at the boundary.

2. **`Int64` / `UInt64` in signatures.** TypeScript users see `MoonBit.Int64` which is a `bigint`, not `number`. Converting back to `number` may truncate. Document at the API level whether the caller should pass a `bigint` or a `number`.

3. **Enums with associated data.** `enum Result { Ok(Int), Err(String) }` generates a tagged-object representation that's awkward to construct from TypeScript. Prefer a pair of functions (`ok`, `err`) or a plain struct with discriminant fields.

4. **Debug vs release build outputs.** `moon build` defaults to `debug` (`_build/js/debug/...`). For published artifacts, use `moon build --release` and publish `_build/js/release/build/*`.

5. **Source maps in production.** Set `.js.map` path in your bundler config, or strip them with `moon build --release --no-source-map` for obfuscation.
