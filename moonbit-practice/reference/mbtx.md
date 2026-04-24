---
title: ".mbtx Single-File Script Mode (Nightly Only)"
---

# .mbtx Single-File Script Mode

> **Nightly only**: Requires `moon` nightly (`>= 0.1.20260214`).
> Not available in stable releases as of 2026-02-18.
> Install: `curl -fsSL https://cli.moonbitlang.com/install/unix.sh | bash -s nightly`
> Or upgrade: `moon upgrade --dev`

Source: [PR #1479](https://github.com/moonbitlang/moon/pull/1479) (merged 2026-02-13)
Implementation: `crates/moonbuild-rupes-recta/src/mbtx.rs`

## Overview

`.mbtx` is a single-file script format that combines `import` declarations and MoonBit code. No `moon.mod.json` or `moon.pkg` required.

```bash
moon run script.mbtx
moon run script.mbtx --target js
moon run script.mbtx --target native -- arg1 arg2
```

## Import Block Syntax

The `import { }` block must appear at the top of the file (comments/blank lines allowed before it). It uses the same parser as `moon.pkg`.

```moonbit
import {
  // Core packages: no version, prefix with moonbitlang/core/
  "moonbitlang/core/json",
  "moonbitlang/core/math",

  // External deps: version required, alias optional
  "moonbitlang/x@0.4.40/json5" @json5,
  "moonbitlang/x@0.4.40/sys" @xsys,
}

fn main {
  let result = try { @json5.parse("{a: 1}") } catch { _ => Json::Null }
  println(result)
  println(@xsys.get_cli_args())
}
```

### Import Rules

| Rule | Example | Result |
|------|---------|--------|
| Core: no version | `"moonbitlang/core/json"` | OK, alias `@json` |
| Core: version specified | `"moonbitlang/core@0.1.0/json"` | Error |
| External: version required | `"moonbitlang/x@0.4.40/fs"` | OK |
| External: no version | `"moonbitlang/x/fs"` | Error |
| Same module, multiple versions | `x@0.4.38` + `x@0.4.40` | Error |
| Custom alias | `"moonbitlang/x@0.4.40/fs" @xfs` | OK, use as `@xfs` |
| No alias | `"moonbitlang/x@0.4.40/stack"` | Auto alias `@stack` |
| `test-import` / `wbtest-import` | — | Not supported |

### Import Block vs No Import Block

| | With `import { }` | Without |
|---|---|---|
| Available packages | **Only specified + prelude** | All core packages |
| Unimported core use | Warning (deprecated) | Works (all loaded) |
| External deps | Resolved and downloaded | Not available |

## Supported Commands

| Command | Status | Notes |
|---------|--------|-------|
| `moon run file.mbtx` | Works | Primary use case |
| `moon run file.mbtx --build-only` | Works | Build without executing |
| `moon check file.mbtx` | Works | Type checking |
| `moon test file.mbtx` | Broken | Tests not discovered; `fn main` conflicts |
| `moon build file.mbtx` | Error | Requires moon project; use `--build-only` instead |

## Build Targets and Output

```bash
moon run script.mbtx --target js --build-only
moon run script.mbtx --target wasm-gc --build-only
moon run script.mbtx --target native --build-only
moon run script.mbtx --target js --release --build-only
```

| Target | Output | Standalone? |
|--------|--------|-------------|
| `js` | `_build/js/.../single.js` | Yes, runs with `node` |
| `wasm-gc` | `_build/wasm-gc/.../single.wasm` | Needs `moonrun` |
| `native` | `_build/native/.../single.c` + runtime | Needs `moonrun` to link |

### JS Target: Single-File Bundle

JS output bundles all dependencies into one file, including external deps:

```bash
moon run script.mbtx --target js --release --build-only
node _build/js/release/build/single/single.js
```

## Build Artifacts Location

Generated in the `.mbtx` file's parent directory:

```
/path/to/
├── script.mbtx           # Source
├── _build/
│   ├── script.mbt        # Preprocessed (import block → spaces)
│   └── wasm-gc/...       # Build output
└── .mooncakes/            # Downloaded external deps (if any)
```

## What Does NOT Work in .mbtx

### No `options()` / `link` Configuration

`moon.pkg` settings like `options()`, `link`, `warn-list` are **not supported inline**. They are build-system-level config, not compiler syntax.

```moonbit
// DOES NOT WORK in .mbtx:
options("warn-list": "-2")          // moonc parse error
///|link(wasm-gc, exports=["add"])  // silently ignored
```

Workaround: use CLI flags.

```bash
moon run script.mbtx --warn-list "-2"
moon run script.mbtx --deny-warn
moon run script.mbtx --release
```

### No Wasm/JS Custom Exports

Wasm output only exports `_start`. There is no way to configure `exports` in `.mbtx`. Use a full project with `moon.pkg` for custom exports.

### No Cross-File Imports

`.mbtx` is strictly single-file. Multiple `.mbtx` files cannot reference each other. `moon run a.mbtx b.mbtx` runs only the first file.

### No `moon test` Support

Tests in `.mbtx` are not discovered. `fn main` and `test` blocks conflict (`fn main` makes it a main package; tests need non-main).

## Internal: How Preprocessing Works

1. Regex extracts the first `import { ... }` block from file start
2. Import block is parsed by `moonutil::moon_pkg::parse` (same as `moon.pkg`)
3. Import paths are split into module (+ version) and package path
4. External deps are fetched to `.mooncakes/`
5. Import block is **replaced with spaces** (preserving line numbers) and written to `_build/<stem>.mbt`
6. `moonc build-package` receives only the specified packages via `-i` flags

## Quick Reference

```bash
# Run simple script
moon run hello.mbtx

# Run with external deps, JS target
moon run server.mbtx --target js

# Build JS bundle without running
moon run app.mbtx --target js --release --build-only
node _build/js/release/build/single/single.js

# Native with CLI args
moon run cli.mbtx --target native -- --port 8080

# Suppress warnings
moon run script.mbtx --warn-list "-2"
```

## References

- PR: https://github.com/moonbitlang/moon/pull/1479
- Implementation: `crates/moonbuild-rupes-recta/src/mbtx.rs`
- Test fixtures: `crates/moon/tests/test_cases/moon_test_single_file.in/import_block_ok.mbtx`
