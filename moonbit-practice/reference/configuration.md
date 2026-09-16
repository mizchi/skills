---
title: "MoonBit Configuration Reference"
---

# MoonBit Configuration Reference

> **Use the DSL formats `moon.mod` / `moon.pkg`.** The JSON formats
> `moon.mod.json` / `moon.pkg.json` are deprecated and scheduled for removal;
> they are kept only so existing projects still build. New projects use the DSL.
> Ready-to-copy samples live at `assets/moon.mod` and `assets/moon.pkg`.
>
> Verified against MoonBit v0.10.12.

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

// Source directory holding the packages (top-level, not inside options)
source = "src"
```

Field mapping from the old JSON keys: `preferred-target` → `preferred_target`,
`warn-list` → `warnings`, `source` becomes a top-level assignment, and `deps`
becomes the `import` block.

### `source` also decides every package's import path

A package's import path is **module name + its directory path relative to
`source`**. `source` is therefore not just a file-layout setting — moving it
renames every cross-package import in the module.

```text
moon.mod                      name = "acme/semver", source = "src"
src/
├── semver/                   -> package path "acme/semver/semver"
│   ├── moon.pkg
│   └── version.mbt
└── cmd/semver/               -> package path "acme/semver/cmd/semver"
    ├── moon.pkg              pkgtype(kind: "executable")
    └── main.mbt
```

`src/cmd/semver/moon.pkg` then imports the library as:

```moonbit
import {
  "acme/semver/semver" @semver,
}
```

Only directories **under `source`** are scanned for packages: with
`source = "src"`, a top-level `cmd/` directory is invisible to the build. Omit
`source` to make the module root the source root.

### Publishing filters: `.moonignore`, not `include` / `exclude`

The `include` and `exclude` fields of `moon.mod` are **deprecated**. Packaging now
follows conventional ignore-file rules: the `.moonignore` in a directory — or its
`.gitignore` when absent — decides what ships. Dot-prefixed paths and the
package-root `_build/` are excluded by default (`_build/` cannot be re-included).

```gitignore
# .moonignore
examples/
*.log
!fixtures/keep.log
# re-include a root dotfile that the default rule excludes
!/.moonignore
```

When a legacy `include` is present it is an exhaustive allowlist and suppresses
`exclude`, `.gitignore`, `.moonignore`, and the default dot-path exclusion — one
more reason to migrate.

### Path dependencies

Local path dependencies inside `moon.mod` are deprecated. For cross-module work
use a workspace (`moon.work`, below); members resolve each other by module name
with no path entry at all.

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

// Files moon fmt should skip (optional, top-level)
formatter(ignore: [ "generated.mbt" ])

// What this package builds: "library" (default) | "executable" | "foreign_library"
pkgtype(kind: "executable")

options(
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
- `:embed` converts a file to MoonBit source (`--text` / `--binary`, `--name`).

### Package type: `pkgtype`, not `is-main` / `link: true`

One `pkgtype` declaration says what the package builds. The kinds are mutually
exclusive and must not be declared together.

| `pkgtype(kind: ...)` | Replaces | Meaning |
|---|---|---|
| `"library"` | — | Default; nothing to declare |
| `"executable"` | `options("is-main": true)` | Package has `fn main` |
| `"foreign_library"` | `options(link: true)` | Builds a library artifact for foreign code |

The **object**-valued `link` option is unrelated and still lives in `options(...)`:
it configures backend-specific linking (`exports`, `format`, …) as shown above.

### Exporting symbols: prefer `#export_name`

In a `foreign_library` package, `#export_name` pins a stable symbol name on a
public, non-generic function in the generated Wasm / JS / C output. Prefer it over
backend-specific `exports` link configuration for new exports.

```moonbit
#export_name("attr_add")
pub fn add_by_attr(n : Int) -> Int {
  n + 42
}
```

Export names must currently be valid C identifiers and unique within the package
on every backend. The attribute cannot be used on generic functions or functions
with optional arguments. Export declarations are scoped to the package producing
the artifact — an attribute in a dependency does not add symbols to your output.

---

## Legacy JSON formats (existing projects only)

Equivalent JSON for reference when reading older code. Support is deprecated and
will be removed — run `moon fmt` in the module root to migrate both files.

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
    "moonbitlang/core/quickcheck",
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
