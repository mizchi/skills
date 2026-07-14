# MoonBit Skills Marketplace

Use this reference when publishing a MoonBit executable to
[skills.mooncakes.io](https://skills.mooncakes.io/) or authoring its agent-facing
`SKILL.md`.

## Mental model

Keep these two layers distinct:

1. A MoonBit executable package supplies the command implementation. It must
   compile to `wasm` and is run locally by `moon runwasm`.
2. A package-local `SKILL.md` supplies agent metadata and operating
   instructions. The Marketplace exposes it next to the prebuilt Wasm asset.

Publishing an executable without `SKILL.md` can still create a Marketplace
entry, but its name/description metadata and agent instructions are empty.
Conversely, a well-written `SKILL.md` does not make a stub executable useful;
test the published command's real workflow.

## Package layout

Place `SKILL.md` in the executable package directory, beside `moon.pkg`:

```text
moon.mod
cmd/tool/
├── moon.pkg
├── main.mbt
├── main_wbtest.mbt
└── SKILL.md
```

Define an executable package with the DSL config:

```pkl
pkgtype(kind: "executable")
```

If the full native/JS command depends on capabilities unavailable to the Wasm
target, keep target entry points separate:

```pkl
pkgtype(kind: "executable")

options(
  targets: {
    "main.mbt": ["native", "js"],
    "main_wasm.mbt": ["wasm", "wasm-gc"],
    "main_wasm_wbtest.mbt": ["wasm", "wasm-gc"],
  },
)
```

Prefer a real synchronous Wasm workflow over a placeholder that merely prints
"unsupported". Keep shared parsing and business logic pure, then isolate host
IO in the entry point.

## Define SKILL.md

Use YAML frontmatter with only `name` and `description`. Put both capability
and trigger conditions in `description`; agents decide whether to load the
body from this field.

````markdown
---
name: tool
description: Use tool to inspect and transform local Foo files in WebAssembly. Use when an agent needs deterministic Foo validation without installing a native binary.
---

# tool

Run:

```bash
moon runwasm author/module/cmd/tool -- check input.foo
```

Document supported commands, output formats, exit codes, host capabilities,
security policy, and explicit limitations.
````

Keep instructions imperative and concise. Include examples that can be copied
verbatim. State whether paths resolve from the current working directory and
whether shell quoting is required. Do not claim a capability merely because
the package compiles for Wasm.

Validate the skill with an agentskills-compatible validator when available:

```bash
python path/to/skill-creator/scripts/quick_validate.py cmd/tool
```

## Run coordinates

Use an unpinned coordinate for the latest version:

```bash
moon runwasm author/module/cmd/tool -- <args>
```

Pin reproducible automation to the published module version:

```bash
moon runwasm author/module@1.2.3/cmd/tool -- <args>
```

`moon runwasm` downloads the Marketplace Wasm asset, verifies its SHA-256
checksum, caches it under `MOON_HOME`, and passes arguments after the package
coordinate to the guest command.

## Filesystem, environment, and network policy

Moonrun without a policy preserves legacy allow-all behavior for its own host
surfaces. A Marketplace page calling a command "sandboxed" does not by itself
make filesystem access deny-by-default.

For agent use or untrusted repositories, provide a policy explicitly:

```toml
[fs]
read = ["inputs"]
write = ["outputs"]

[env]
from_host = ["HOME"]

[net]
connect = ["api.example.com:443"]
```

```bash
moon runwasm --experimental-policy moonrun-policy.toml \
  author/module/cmd/tool -- check inputs/main.foo
```

Policy mode is deny-by-default for omitted `fs`, `env`, and `net` surfaces;
process spawning also requires explicit enablement. Policy-relative roots are
resolved relative to the policy file, while paths used by the guest command
are resolved from the process current working directory. Grant the smallest
read/write roots needed. Do not place secret values directly in the policy;
allow selected host variable names instead.

The policy covers `moonbitlang/async` and Moonrun-owned `__moonbit_*_unstable`
FFI, including `moonbitlang/x/fs` on Wasm. It does not cover WASI imports.

### Package and remote dependencies

Treat URI syntax and host capability as separate concerns. A Wasm command can
support `package://` without network access by mapping the URI to a
pre-extracted local cache, reading the cached source, and registering it under
the original package URI so package-relative imports retain their identity.

Expose a repeatable cache option and document its exact layout and miss
behavior:

```bash
moon runwasm author/module/cmd/tool -- check \
  --package-cache .tool-cache input.pkl
```

If the Wasm HTTP backend is unavailable, report an actionable cache-miss error
instead of claiming package download support. Under a restrictive Moonrun
policy, allow reads for both the input tree and the selected package cache; if
the command discovers its default cache through `HOME` or `XDG_CACHE_HOME`,
also allow only those required environment variable names.

## Test and publish

Run the Wasm command through the same process boundary users will invoke:

```bash
moon fmt
moon info
moon check --target wasm --deny-warn
moon check --target wasm-gc --deny-warn
moon test --target wasm
moon runwasm cmd/tool -- --help
moon runwasm cmd/tool -- check testdata/input.foo
```

Also test a restrictive policy when the command uses host IO.

Bump the module version before publishing; published versions are immutable.
Then validate the complete artifact:

```bash
moon publish --dry-run -v
unzip -l _build/publish/author-module-1.2.3.zip | rg 'cmd/tool/(SKILL.md|moon.pkg)'
moon publish
```

After publication, verify both metadata and instructions:

```bash
curl -fsSL https://skills.mooncakes.io/api/v0/skills/author/module@1.2.3/cmd/tool
curl -fsSL https://skills.mooncakes.io/assets/author/module@1.2.3/cmd/tool/SKILL.md
moon runwasm author/module@1.2.3/cmd/tool -- --help
```

The Marketplace may need time to build the optimized Wasm asset. Diagnose the
executable locally before treating an absent remote asset as a code failure.

## Sources

- [MoonBit Skills Marketplace](https://skills.mooncakes.io/)
- [Marketplace skill loading and run-command construction](https://github.com/moonbitlang/mooncakes.io/blob/main/src/page/skills/state.mbt)
- [Moonrun policy semantics](https://github.com/moonbitlang/moon/blob/main/crates/moonrun/README.md#experimental-policy)
- [Agent Skills specification](https://agentskills.io/specification)
