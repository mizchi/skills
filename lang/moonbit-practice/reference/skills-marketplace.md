# MoonBit Skills Marketplace

Use this reference when publishing a MoonBit executable to
[skills.mooncakes.io](https://skills.mooncakes.io/) or authoring its agent-facing
`SKILL.md`.

> Verified against MoonBit v0.10.12. **`moon runwasm` is deprecated** — registry
> packages now run with `moonx`, local packages with
> `moon run <pkg> --target wasm`.

## Mental model

Keep these two layers distinct:

1. A MoonBit executable package supplies the command implementation. It must
   compile to `wasm` and is run by `moonx`.
2. A package-local `SKILL.md` supplies agent metadata and operating
   instructions. The Marketplace exposes it next to the prebuilt Wasm asset.

Publishing an executable without `SKILL.md` can still create a Marketplace
entry, but its name/description metadata and agent instructions are empty.
Conversely, a well-written `SKILL.md` does not make a stub executable useful;
test the published command's real workflow.

## Package layout

Place `SKILL.md` in the executable package directory, beside `moon.pkg`.

**This layout assumes `moon.mod` does not set `source`** — the module root is the
source root:

```text
moon.mod            (no `source` line)
cmd/tool/
├── moon.pkg
├── main.mbt
├── main_wbtest.mbt
└── SKILL.md
```

If your `moon.mod` sets `source = "src"` (as `assets/moon.mod` does), the command
package must live **under** it — a top-level `cmd/` is invisible to the build:

```text
moon.mod            source = "src"
src/cmd/tool/
├── moon.pkg
├── main.mbt
└── SKILL.md
```

Pick one and keep the manifest and the tree consistent; the package's import path
follows from it (see reference/configuration.md, "`source` also decides every
package's import path").

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
moonx author/module/cmd/tool check input.foo
```

Document supported commands, output formats, exit codes, host capabilities,
security policy, and explicit limitations.
````

Keep instructions imperative and concise. Include examples that can be copied
verbatim. State whether paths resolve from the current working directory and
whether shell quoting is required. Do not claim a capability merely because
the package compiles for Wasm.

Optionally validate the frontmatter with any agentskills-compatible validator —
for example the `quick_validate.py` shipped with the `skill-creator` skill, if that
skill is installed:

```bash
python "$HOME/.claude/skills/skill-creator/scripts/quick_validate.py" cmd/tool
```

Skip this step when no validator is on hand; it checks frontmatter shape, not
behaviour, and nothing downstream depends on it.

## Run coordinates

Use an unpinned coordinate for the latest version already in the local index:

```bash
moonx author/module/cmd/tool <args>
```

Pin reproducible automation to the published module version:

```bash
moonx author/module@1.2.3/cmd/tool <args>
```

`@latest` refreshes the registry index before resolving; an unpinned coordinate
updates the index only when the module is missing locally. `moonx` downloads the
Marketplace Wasm asset, verifies its SHA-256 checksum, caches it under
`$MOON_HOME/registry/cache/assets`, and forwards everything after the coordinate
— including hyphen-prefixed values — to the guest command. An explicit `--` is
accepted but not required.

`moonx` defaults to the Wasm backend and is a second entry point into the `moon`
executable, not a separate binary.

## Filesystem, environment, and network policy

Moonrun without a policy preserves legacy allow-all behavior for its own host
surfaces. A Marketplace page calling a command "sandboxed" does not by itself
make filesystem access deny-by-default.

For agent use or untrusted repositories, provide a policy explicitly:

The policy file is **JSON** (not TOML):

```json
{
  "fs": {
    "read": ["inputs"],
    "write": ["outputs"]
  },
  "env": { "from_host": ["HOME"] },
  "net": { "connect": ["api.example.com:443"] }
}
```

```bash
moonx --experimental-policy moonrun-policy.json \
  author/module/cmd/tool check inputs/main.foo
```

`{}` denies every policy-covered surface. To keep the legacy allow-all behaviour
while still passing a file, use explicit wildcards (`"*"`, `"*:*"`,
`"process": { "spawn": true }`) — or simply run without a policy.

Policy mode is deny-by-default for omitted or empty `fs`, `env`, and `net`
surfaces; process spawning stays off unless `process.spawn` is `true` or a
`process.allow` rule matches (the two cannot be combined). Rules match the
program name exactly plus an optional `args_prefix`; allowing a shell, package
runner, or other extensible tool grants far more than the visible prefix. Policy-relative roots are
resolved relative to the policy file, while paths used by the guest command
are resolved from the process current working directory. Grant the smallest
read/write roots needed. Do not place secret values directly in the policy;
allow selected host variable names instead.

The policy covers `moonbitlang/async` and Moonrun-owned `__moonbit_*_unstable`
FFI, including `moonbitlang/x/fs` on Wasm. It does not cover WASI imports.

It also applies only to **guest execution**. `moonx`'s own work — refreshing the
registry index, downloading and checksumming the Marketplace asset — happens before
the policy-bearing child is spawned and is not governed by it, so a deny-all `net`
policy does not break a cold-cache run.

### Package and remote dependencies

Treat URI syntax and host capability as separate concerns. A Wasm command can
support `package://` without network access by mapping the URI to a
pre-extracted local cache, reading the cached source, and registering it under
the original package URI so package-relative imports retain their identity.

Expose a repeatable cache option and document its exact layout and miss
behavior:

```bash
moonx author/module/cmd/tool check \
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
moon run cmd/tool --target wasm -- --help
moon run cmd/tool --target wasm -- check testdata/input.foo
```

(Local packages go through `moon run --target wasm`; `moonx` is for registry
coordinates.)

The path argument is a **filesystem path to the package directory**, not an import
path: with `source = "src"` the command above is `moon run src/cmd/tool
--target wasm`. Everything after `--` goes to the program.

Publish targets the **linear-memory `wasm`** backend — that is what `moonx` runs by
default and what the Marketplace serves. `wasm-gc` is a different backend: check it
if you also support it, but the asset users get is `wasm`, so that is the target
your tests must cover.

`moon info` regenerates `.mbti` interface files. An executable package exposes no
public API, so it is a no-op there — run it for the library packages the command
depends on, not for `cmd/tool` itself.

Also exercise the restrictive policy, in both directions — an allowed path must
succeed and a path outside the granted roots must be denied:

```bash
moon run cmd/tool --target wasm --experimental-policy moonrun-policy.json \
  -- check inputs/main.foo        # expected: succeeds
moon run cmd/tool --target wasm --experimental-policy moonrun-policy.json \
  -- check /etc/hosts             # expected: denied by policy
```

Bump the module version before publishing; published versions are immutable.

**Order matters when `SKILL.md` embeds a pinned coordinate.** That file ships
*inside* the artifact, so a pinned example in it has to be updated to the new
version before the dry-run, or it will ship pointing at the previous release — and
it goes stale again on every later version. Prefer an unpinned coordinate in the
shipped `SKILL.md` and keep pinned examples in your repo's own docs.

Then validate the complete artifact:

```bash
moon publish --dry-run -v
unzip -l _build/publish/author-module-1.2.3.zip | rg 'cmd/tool/(SKILL.md|moon.pkg)'
moon publish
```

Package contents are filtered by `.moonignore` (or `.gitignore` when absent), so
check that `SKILL.md` is not swept up by an ignore rule — dot-prefixed paths and
`_build/` are excluded by default. mooncakes.io also rejects a module name that
differs from an existing one only by letter case.

After publication, verify both metadata and instructions:

```bash
curl -fsSL https://skills.mooncakes.io/api/v0/skills/author/module@1.2.3/cmd/tool
curl -fsSL https://skills.mooncakes.io/assets/author/module@1.2.3/cmd/tool/SKILL.md
moonx author/module@1.2.3/cmd/tool --help
```

The Marketplace may need time to build the optimized Wasm asset. Diagnose the
executable locally before treating an absent remote asset as a code failure.

## Sources

- [MoonBit Skills Marketplace](https://skills.mooncakes.io/)
- [Marketplace skill loading and run-command construction](https://github.com/moonbitlang/mooncakes.io/blob/main/src/page/skills/state.mbt)
- [Moonrun policy semantics](https://github.com/moonbitlang/moon/blob/main/crates/moonrun/README.md#experimental-policy)
- [Agent Skills specification](https://agentskills.io/specification)
