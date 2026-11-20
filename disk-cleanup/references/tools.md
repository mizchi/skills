# Tool-owned caches and installed versions

Inspect the actual installed CLI's help and cache location. Select only relevant
tools already used on this machine. Installing many cleanup utilities can consume
more space than the first cleanup recovers.

## Usage analyzers

| Tool | Useful role |
| --- | --- |
| [gdu](https://github.com/dundee/gdu) | Parallel disk-usage analysis, particularly useful on SSDs |
| [dua](https://github.com/Byron/dua-cli) | Aggregate usage and interactive drill-down; `dua interactive` has deletion controls, so keep that within the authorized scope |
| [dust](https://github.com/bootandy/dust) | Readable CLI directory ranking |
| `du`, `df` | Installed fallback; `df` gets availability immediately, while `du` walks the selected tree |

Run analyzers on a selected subtree and use their installed version's filesystem
boundary options. Faster traversal is still traversal: neither output depth nor
an interactive UI makes an unbounded home scan cheap. The bundled survey is the
time-limited fallback when these tools are absent.

## Native pruning

| Owner | Inspect / preview | Scoped cleanup |
| --- | --- | --- |
| pnpm | `pnpm --version`, `pnpm store path`, `pnpm store --help` | `pnpm store prune` removes unreferenced store entries; it is different from project `pnpm prune` |
| uv | `uv cache dir`, `uv cache --help` | `uv cache prune` for unused entries; `uv cache clean PACKAGE` for a selected package |
| Docker / BuildKit | `docker system df`, `docker buildx du` for the selected builder | `docker buildx prune --filter 'until=720h'`; older builder CLI: `docker builder prune --filter 'until=720h'` |
| Homebrew | `brew cleanup --dry-run`, `brew outdated` | `brew cleanup`; use `--prune=30` only after checking installed help and the intended cache-age policy |
| mise | `mise ls`, `mise prune --dry-run` | After checking project pins, `mise prune --tools TOOL` |
| Rust / Cargo | Exact target path, manifest, fingerprints; inspect `cargo sweep --help` if installed | A verified inactive target directory, or cargo-sweep's age-based cleanup |
| ccache | `ccache --show-stats`, `ccache --show-config` | `ccache --cleanup` enforces the configured limits; it is not a 30-day filter |
| Xcode | Selected DerivedData directory and activity; `xcrun simctl list devices unavailable` | Old inactive DerivedData; `xcrun simctl delete unavailable` only when simulator removal is requested |

These commands are mutations unless in the inspection/preview column. Some have
no dry-run; record the cache scope and command before execution. For a CLI that
prompts, a noninteractive confirmation flag can be used once that precise cleanup
is authorized; it must not enlarge the scope. Keep container volumes, databases,
SDKs, Rust toolchains, and simulators outside a generic build-cache purge.

### pnpm and uv details

Remove eligible old `node_modules` consumers before pruning the relevant store.
Shared hard links and clones mean directory size is not a promise of recoverable
space. Discover each selected store version/configuration; one prune does not
prove every historical store was covered.

If a project's pinned package manager cannot start, do not edit its
`packageManager` or install an arbitrary version just for cache cleanup. Use the
intended existing executable; for a user-wide store, run it from a neutral working
directory after checking the resolved store path. Preserve lockfiles and offline
installation requirements. [pnpm store documentation](https://pnpm.io/cli/store)
describes store pruning and global-store project references.

Use uv's cache commands rather than deleting cache internals manually. Cache
operations coordinate with other uv processes; do not bypass locks with `--force`
to save time. `uv cache prune --ci` has CI-specific retention semantics and should
not replace the ordinary workstation command by default.
[uv cache documentation](https://docs.astral.sh/uv/concepts/cache/).

### Docker and Cargo details

Docker age filters apply to build-cache usage. Select the builder and preserve
volume/container data; `docker system prune -a --volumes` is not a substitute for
build-cache cleanup. If the daemon is stopped, report that inspection is unavailable
rather than starting or resetting a VM. Host free space may also require the VM's
supported disk-reclamation mechanism after cache removal.
[Buildx](https://docs.docker.com/reference/cli/docker/buildx/prune/) and
[builder pruning](https://docs.docker.com/reference/cli/docker/builder/prune/).

[cargo-sweep](https://github.com/holmgr/cargo-sweep) provides age-based Cargo
artifact cleanup. Check its installed help for the time and dry-run flags, and
limit it to selected inactive projects. Do not recursively sweep every target
directory on the machine, especially a shared target used by active builds.
For C/C++, [ccache cleanup](https://ccache.dev/manual/latest.html) respects its
configured cache limits; a size cap can prevent regrowth when recurring cache
management is requested.

## Update, validate, prune

Consolidate selected installed versions only when updates are requested:

1. Inventory the owner and active executable (`command -v`, version, manager
   inventory). Check project pins in `mise.toml`, `.tool-versions`,
   `rust-toolchain.toml`, `packageManager`, and flakes before declaring a version
   unused. An installation directory's mtime is not a usage registry.
2. Choose the replacement and compatibility range; reuse the existing owner.
   Avoid introducing a second global manager for the same tool. Do not uninstall
   a Nix-managed executable through Homebrew, mise, or raw directory removal.
3. Update/activate that selected installation and verify command resolution,
   version, and a relevant smoke check. Preserve the old working version until
   the replacement works and rollback retention is satisfied.
4. Inspect the owner's prune preview; remove the now-obsolete versions, prune
   caches, then measure free space. Retain versions required by inactive but
   still supported project pins.

For example, scope `brew upgrade FORMULA` before reviewing `brew cleanup --dry-run
FORMULA` and applying `brew cleanup FORMULA`. For mise, review
`mise prune --dry-run --tools TOOL` before its matching mutation. A manager's
tracked-configuration list can miss projects it has not visited; inspect known
project pins as well. See [Homebrew's manual](https://docs.brew.sh/Manpage) and
[mise prune](https://mise.jdx.dev/cli/prune.html).

For Nix, use the [profile-aware sequence](nix.md). For a Node project,
`pnpm dedupe` changes its dependency resolution/lockfile: it is a separate project
change with compatibility checks, not a user-wide cache-cleanup command.

Prefer the owning manager's content store, GC, and hard-linking support over
generic file deduplication. Hash-identical source files or installed mutable
files must not be hard-linked or deleted globally merely because they match.
