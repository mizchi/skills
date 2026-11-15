---
title: ".mbtx Single-File Script Mode"
---

# .mbtx Single-File Script Mode

Updated for [MoonBit v0.10.19](https://www.moonbitlang.com/updates/2026/11/05/index).
A script combines configuration and code without a `moon.mod` or `moon.pkg`.
The current header parser is also covered by the upstream
[Moon tests](https://github.com/moonbitlang/moon/blob/main/crates/moonbuild-rupes-recta/src/mbtx.rs).
Older script documentation may still show an undelimited import block.

## Configuration header

Put configuration between `---` delimiters at the beginning of the file. The
header uses the module/package configuration DSL, not YAML. Keep MoonBit
functions after the closing delimiter.

```moonbit
---
import {
  "moonbitlang/core/env",
  "moonbitlang/core/queue" @q *,
}
permission(env: { "set": { "MODE": "example" } })
---

fn main raise {
  assert_eq(Queue([1, 2]).length(), 2)
  assert_eq(@q.Queue([3, 4, 5]).length(), 3)
  assert_true(@env.get_env_var("MODE") is Some("example"))
}
```

An import can combine an alias and `*`. Both `Queue` and `@q.Queue` are then
available. Core imports do not specify versions. External imports can pin a
module version, for example `"owner/module@0.1.2/package" @pkg`; use one version
for all packages from that module. Pin automation dependencies to versions that
actually exist. An unversioned dependency depends on the local registry index;
refresh it with `moon update` when needed.

Explicitly import every package used. Do not depend on implicit core imports.
A missing import is an error on the current compiler, rather than a warning.
Use a full module for cross-file packages and custom export/link configuration;
sharing the header DSL does not imply that every package option is meaningful
for a standalone script.

## Run and check

```bash
moon check script.mbtx
moon run script.mbtx                  # Wasm by default
moon run script.mbtx --target js
moon run script.mbtx --target native -- arg1 arg2
moon run script.mbtx --target js --release --build-only

# Source on stdin or supplied inline
moon run - < script.mbtx
moon run -c 'fn main { println("hello") }'

# Registry/standalone Wasm runner
moonx script.mbtx arg1 arg2
moonx owner/module/cmd/tool@0.1.2 arg1 arg2
```

`moonx` supports only linear-memory Wasm. Select JS or Native through
`moon run`; use the backend supported by the script's I/O dependencies.
Pass `--` before program arguments when also using runner flags.

Build artifacts are placed in `_build` beneath the script's directory, with
external packages downloaded under `.mooncakes`. Use `--target-dir` or inspect
build output for the exact artifact path instead of assuming a generated JS
filename across compiler versions.

## Test and policy

Check `moon test --help`: the verified v0.10.20 development CLI accepts an
explicit `.mbtx` path, generates a test entrypoint, and does not execute the
script's main during tests. Package-wide tests do not automatically include
standalone scripts. The v0.10.19 release also introduces experimental
`moon testcli`; use the installed CLI's help for its fixture format.

Runtime permissions belong in `permission(...)` in the header. The old leading
`// policy:` comments are migration material, not the form to write in new
scripts. An explicit `--experimental-policy policy.json` overrides the embedded
policy; external policy files remain JSON. See
[skills-marketplace.md](skills-marketplace.md) for policy scope and limitations.

Treat embedded permission requests as code to review, especially before reading
host environment variables. Grant only the required capabilities. Script
execution policy does not constrain the runner's dependency downloads.

For a complete executable check of alias/import-all and the permission header,
run `just --justfile moonbit.justfile test-script` from this repository.
