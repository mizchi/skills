# Build & Publish: satisfying the JS API contract

The goal of Phase 6: produce a `.js` + `.d.ts` that a consumer importing the package cannot distinguish from the TypeScript original. The build configuration *is* the contract enforcement.

## moon.mod.json

```json
{
  "name": "you/pkg",
  "version": "0.1.0",
  "source": "src",
  "preferred-target": "js"
}
```

`preferred-target: "js"` makes `moon check`/`build`/`test` default to the JS backend. It's a default, not a lock — `moon test --target native` still works for code that supports it (relevant when porting onto `mizchi/x`).

## src/moon.pkg — exports + format

```
import {
  "mizchi/js/core",
  "mizchi/js",
  "moonbitlang/async" for "test",
}

options(
  supported_targets: "js",   // app/leaf: silences the mizchi/js supported_targets warning
  link: {
    "js": {
      "exports": ["create_app:createApp", "parse", "stringify"],
      "format": "esm",
    },
  },
)
```

- **`exports`** must list every Phase 0 export name. Use `"moonbit_name:js_name"` to match the original casing — MoonBit is `snake_case`, the JS contract is usually `camelCase`. `create_app:createApp` exports MoonBit `create_app` as JS `createApp`.
- **`format`** must match what the package shipped (`esm` / `cjs` / `iife`). Wrong format breaks consumers even when signatures match.
- Gate any file containing `extern "js"` to `["js"]` via `targets:` (see `moonbit-js-binding`).

> Use the `moon.pkg` DSL form (no `.json`). Do not mix with `moon.pkg.json`.

## Async exports — return a real Promise

An exported MoonBit `async fn` cannot be awaited by a sync JS caller as-is. Wrap the internal async logic with `mizchi/js/core`'s `promisify*` (or `from_async`) so the export returns `@core.Promise[T]` and JS receives a real `Promise`. Verified pattern (mizchi/js 0.12.1):

```mbt nocheck
// internal async logic
async fn do_work_impl(x : Int) -> Int {
  @core.sleep(1)
  x * 2
}

// exported boundary: hand JS a real Promise
pub fn do_work(x : Int) -> @core.Promise[Int] {
  (@core.promisify1(do_work_impl))(x)
}
```

List `do_work` in `exports`. At runtime JS gets a genuine `Promise` (`p instanceof Promise === true`, `await p` works — verified). **But** the generated `.d.ts` types the return as `any`, not `Promise<number>`, because `@core.Promise[T]` is an external type. If consumers need the precise `Promise<T>` type, ship a small hand-maintained overlay `.d.ts` that re-declares the async exports, or wrap the package in a thin typed `index.ts`.

## Build

```bash
moon check                 # fast type-check
moon test                  # run MoonBit tests (js default)
moon build --release       # publishable artifact + .d.ts
```

Release output:

```
_build/js/release/build/
├── <pkg>.js        # ESM/CJS/IIFE per link.js.format
├── <pkg>.js.map
├── <pkg>.d.ts      # generated TypeScript declarations
└── moonbit.d.ts    # MoonBit primitive aliases (Int→number, String→string, …)
```

## The `.d.ts` diff gate

This is the hard contract check. Diff the generated declaration against the Phase 0 snapshot:

```bash
moon build --release
diff contract/index.d.ts _build/js/release/build/<pkg>.d.ts
# names/casing won't line up 1:1 (snake_case, MoonBit.* aliases) — read it,
# don't expect a clean diff. The point is to catch type/shape regressions.
```

Every difference is either a contract break to fix in MoonBit, or an intentional, documented change. Common offenders and fixes:

| `.d.ts` shows | Means | Fix |
|---|---|---|
| `bigint` where contract has `number` | you used `Int64`/`BigInt` | switch to `Int`/`Double` if the value fits, or document the change |
| tagged-object type | data-carrying `enum` at boundary | replace with struct or constructor fns |
| `MoonBit`-prefixed internal type | leaked `Map`/`Result`/trait object | convert to plain struct / `Any` |
| missing export | name not in `link.js.exports` | add it |
| wrong export name | snake_case leaked | use `"snake:camel"` rename |
| duplicate export (Node fails to load: `Duplicate export`) | an `exports` entry resolves to *both* a free `fn` and a same-named static method (e.g. `parse` matches boundary `parse` **and** `SemVer::parse`) | give the core method a distinct identifier (`SemVer::from_string`, `SemVer::cmp`) so only the boundary owns the exported name |

## npm packaging

Wrap the release output so consumers `import` it normally. Minimal `package.json`:

```json
{
  "name": "your-pkg",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./_build/js/release/build/pkg.d.ts",
      "import": "./_build/js/release/build/pkg.js"
    }
  },
  "files": ["_build/js/release/build"]
}
```

Match the **original** `package.json` `exports` map (entry names, conditions). If the source was dual ESM+CJS, build both formats (two packages or two `link` configs) and provide `import`/`require` conditions accordingly.

For app/bundler integration, `mizchi/vite-plugin-moonbit` compiles `.mbt` on the fly so you can `import` MoonBit modules directly during development without a manual `moon build` step.

## Source maps

`.js.map` is emitted by default. For obfuscated production output use `moon build --release --no-source-map`, or point your bundler at the maps for debuggable builds.
