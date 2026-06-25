---
title: "MoonBit Configuration Reference"
---

# MoonBit Configuration Reference

> **Prefer the DSL formats `moon.mod` / `moon.pkg`.** The JSON formats
> `moon.mod.json` / `moon.pkg.json` are deprecated-pending and kept only for
> existing projects. New projects should use the DSL. Ready-to-copy samples live
> at `assets/moon.mod` and `assets/moon.pkg`.

## File Structure

```
my-project/
├── moon.mod        # Module configuration, project-wide (new DSL)
└── src/
    ├── moon.pkg    # Package configuration (new DSL)
    └── main.mbt
```

## Migrating from JSON to the DSL

`moon fmt` converts both files to the DSL in place:

```bash
moon fmt          # converts moon.mod.json -> moon.mod and moon.pkg.json -> moon.pkg
```

The DSL adds comments, trailing commas, and a more concise syntax. Top-level
settings use `key = value`; build-affecting settings go inside `options( ... )`.

---

## moon.mod (Module Configuration, new DSL)

```moonbit
name = "username/project"

version = "0.1.0"

license = "MIT"

repository = "https://github.com/username/project"

description = "One-line description"

keywords = [ "cli", "example" ]

readme = "README.md"

// Default backend: js | wasm | wasm-gc | native
preferred_target = "js"

// Warning/alert tweaks (- silences, + enables; by number or name)
warnings = "-2"

// Registry dependencies, version pinned inline with `@`
import {
  "moonbitlang/x@0.4.45",
}

options(
  source: "src",                              // source directory
  // exclude: [ "examples", "_build" ],       // paths kept out of the published package
)
```

Field mapping from the old JSON keys: `preferred-target` → `preferred_target`,
`warn-list` → `warnings`, `source`/`deps` move into `options(...)` / the `import`
block respectively.

### Path dependencies

The JSON `"deps": { "myuser/mod2": { "path": "../mod2" } }` becomes a path entry in
the `import` block; for cross-module work prefer a workspace (`moon.work`, below).

---

## moon.pkg (Package Configuration, new DSL)

```moonbit
// Imports; `@alias` after a path imports it under a short name
import {
  "moonbitlang/core/builtin",
  "username/project/util" @util,
}

// Test-only imports (block may be empty). White-box variant: `for "wbtest"`.
import {
  "moonbitlang/core/test",
} for "test"

// Optional, top-level
supported_targets = "wasm"
warnings = "-unused_value"

options(
  is_main: true,                              // executable package with `fn main`

  // Conditional compilation: file -> backend conditions
  targets: {
    "only_js.mbt": [ "js" ],
    "not_js.mbt": [ "not", "js" ],
    "js_release.mbt": [ "and", [ "js" ], [ "release" ] ],
  },

  // Backend link options
  link: {
    "js": { "exports": [ "hello" ], "format": "esm" },          // esm | cjs | iife
    "wasm-gc": { "exports": [ "hello" ], "use-js-builtin-string": true },
  },

  // Codegen step before build (same shape as legacy JSON)
  "pre-build": [
    { "input": "a.txt", "output": "a.mbt", "command": ":embed -i $input -o $output" },
  ],
)
```

- Conditions: `wasm`, `wasm-gc`, `js`, `native`, `debug`, `release`. Operators:
  `and`, `or`, `not`.
- `is_main` and `"is-main"` are both accepted; prefer the unquoted `is_main`.
- `:embed` converts a file to MoonBit source (`--text` / `--binary`, `--name`).

---

## Legacy JSON formats (existing projects only)

Equivalent JSON for reference when reading older code. Run `moon fmt` to migrate.

### moon.mod.json

```json
{
  "name": "username/project-name",
  "version": "0.1.0",
  "deps": {
    "moonbitlang/x": "0.4.6",
    "username/other": { "path": "../other" }
  },
  "source": "src",
  "license": "MIT",
  "repository": "https://github.com/...",
  "description": "...",
  "keywords": ["example"],
  "preferred-target": "js",
  "warn-list": "-2-4",
  "alert-list": "-alert_1"
}
```

### moon.pkg.json

```json
{
  "is-main": true,
  "import": [
    "moonbitlang/quickcheck",
    { "path": "moonbitlang/x/encoding", "alias": "lib" }
  ],
  "test-import": [],
  "targets": { "only_js.mbt": ["js"] },
  "link": { "js": { "exports": ["hello"], "format": "esm" } },
  "pre-build": [
    { "input": "a.txt", "output": "a.mbt", "command": ":embed -i $input -o $output" }
  ]
}
```

---

## Warning Numbers

Common ones:
- `1` Unused function
- `2` Unused variable
- `11` Partial pattern matching
- `12` Unreachable code
- `27` Deprecated syntax

Check all: `moonc build-package -warn-help`

## Workspace (moon.work) — managing multiple modules

**When a repo holds more than one module, manage them with a workspace
(`moon.work`)** instead of standalone modules. Members share one build context
and `_build/` directory, resolve each other locally, and keep dependency versions
in sync. See https://docs.moonbitlang.com/ja/latest/toolchain/moon/workspace.html
(experimental).

```bash
# Create the manifest with initial members in one step (paths are module dirs)
moon work init mod1 mod2

# ...or init empty, then add members later
moon work init
moon work use mod1 mod2
```

This generates `moon.work` at the repo root:

```
members = [
  "./mod1",
  "./mod2",
]
```

`moon check` / `moon test` / `moon build` run from the workspace root operate
across all members.

### Workspace commands (verified, moon 0.1.20260618)

| Command | Description |
|---------|-------------|
| `moon work init [paths...]` | Create the `moon.work` manifest, optionally with initial member dirs |
| `moon work use <paths...>` | Add module directories to the manifest |
| `moon work sync` | Sync workspace dependency versions into member manifests |

### Cross-module imports

Depend on a sibling member by its module name in the consumer's `moon.mod`
`import` block, then import the package in `moon.pkg`:

```moonbit
// in mod1/src/moon.pkg
import {
  "myuser/mod2" @mod2,
}
```

```moonbit
fn main {
  println(@mod2.hello())
}
```

Run a specific member from the workspace root with `moon run <member-dir>`
(e.g. `moon run mod1`). Use `moon work sync` after changing versions to propagate
them across members.

## References

- Module: https://docs.moonbitlang.com/en/stable/toolchain/moon/module
- Package: https://docs.moonbitlang.com/en/stable/toolchain/moon/package
