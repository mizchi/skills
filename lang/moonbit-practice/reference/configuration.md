---
title: "MoonBit Configuration Reference"
---

# MoonBit Configuration Reference

## File Structure

```
my-project/
├── moon.mod.json    # Module configuration (project-wide)
└── src/
    ├── moon.pkg       # Package configuration (new format)
    └── main.mbt
```

## Migrating from moon.pkg.json to moon.pkg

`moon.pkg.json` is being migrated to the custom syntax `moon.pkg`. Convert with:

```bash
NEW_MOON_PKG=1 moon fmt
```

This converts `moon.pkg.json` to `moon.pkg`.

## moon.pkg (New Format)

Compared to JSON: supports comments, trailing commas, and more concise syntax.

### Imports

```moonbit
// Basic import
import {
  "moonbitlang/async/io",
  "path/to/pkg" as @alias,
}

// Test imports
import "test" {
  "path/to/pkg5",
}

// White-box test imports
import "wbtest" {
  "path/to/pkg7",
}
```

### Options

```moonbit
options(
  "is-main": true,
  "bin-name": "name",
  link: { "native": { "cc": "gcc" } },
)
```

### Comparison with JSON

| Feature | JSON Format | moon.pkg Format |
|---------|-------------|-----------------|
| Comments | ❌ Not supported | ✅ Supported |
| Trailing comma | ❌ Not supported | ✅ Supported |
| Readability | Low (verbose) | High (concise) |

## moon.mod.json (Module Configuration)

### Required Fields

```json
{
  "name": "username/project-name",
  "version": "0.1.0"
}
```

### Dependencies

```json
{
  "deps": {
    "moonbitlang/x": "0.4.6",
    "username/other": { "path": "../other" }
  }
}
```

### Metadata

```json
{
  "license": "MIT",
  "repository": "https://github.com/...",
  "description": "...",
  "keywords": ["example", "test"]
}
```

### Source Directory

```json
{
  "source": "src"
}
```

### Target Specification

```json
{
  "preferred-target": "js"
}
```

### Warning Configuration

```json
{
  "warn-list": "-2-4",
  "alert-list": "-alert_1"
}
```

## moon.pkg.json (Package Configuration)

### Main Package

```json
{
  "is-main": true
}
```

### Dependencies

```json
{
  "import": [
    "moonbitlang/quickcheck",
    { "path": "moonbitlang/x/encoding", "alias": "lib" }
  ],
  "test-import": [...],
  "wbtest-import": [...]
}
```

### Conditional Compilation

```json
{
  "targets": {
    "only_js.mbt": ["js"],
    "only_wasm.mbt": ["wasm"],
    "not_js.mbt": ["not", "js"],
    "debug_only.mbt": ["debug"],
    "js_release.mbt": ["and", ["js"], ["release"]]
  }
}
```

Conditions: `wasm`, `wasm-gc`, `js`, `debug`, `release`
Operators: `and`, `or`, `not`

### Link Options

#### JS Backend

```json
{
  "link": {
    "js": {
      "exports": ["hello", "foo:bar"],
      "format": "esm"
    }
  }
}
```

format: `esm` (default), `cjs`, `iife`

#### Wasm Backend

```json
{
  "link": {
    "wasm-gc": {
      "exports": ["hello"],
      "use-js-builtin-string": true
    }
  }
}
```

### Pre-build

```json
{
  "pre-build": [
    {
      "input": "a.txt",
      "output": "a.mbt",
      "command": ":embed -i $input -o $output"
    }
  ]
}
```

`:embed` converts files to MoonBit source (`--text` or `--binary`)

## Warning Numbers

Common ones:
- `1` Unused function
- `2` Unused variable
- `11` Partial pattern matching
- `12` Unreachable code
- `27` Deprecated syntax

Check all: `moonc build-package -warn-help`

## Workspace (moon.work)

Multiple modules can share a single build context via a workspace.

### Workflow

```bash
# 1. Create modules
moon new --user myuser mod1
moon new --user myuser mod2

# 2. Initialize workspace (creates moon.work)
moon work init

# 3. Add modules to workspace
moon work use mod1 mod2
```

This generates `moon.work`:

```
members = [
  "./mod1",
  "./mod2",
]
```

### Cross-module imports

Add a path dependency in the consumer's `moon.mod.json`:

```json
{
  "deps": {
    "myuser/mod2": { "path": "../mod2" }
  }
}
```

Then import in `moon.pkg`:

```moonbit
import {
  "myuser/mod2" @mod2,
}
```

Use in code:

```moonbit
///|
fn main {
  println(@mod2.hello())
}
```

Run with:

```bash
moon run mod1/cmd/main
```

### Workspace commands

| Command | Description |
|---------|-------------|
| `moon work init` | Create `moon.work` manifest |
| `moon work use <dirs>` | Add modules to workspace |
| `moon work sync` | Sync dependency versions across members |

## References

- Module: https://docs.moonbitlang.com/en/stable/toolchain/moon/module
- Package: https://docs.moonbitlang.com/en/stable/toolchain/moon/package
