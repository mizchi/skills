---
name: nix-setup
description: Set up Nix flakes for development environments. Includes ready-to-use flake.nix templates for MoonBit, Rust, TypeScript (with pnpm), Python+uv, each preloaded with just / ast-grep / apm. Covers installation on sandboxed environments like Claude Code web, the buildNpmPackage idiom, direnv integration, and GitHub Actions. Use when starting a new project with Nix, adding a flake to an existing project, bootstrapping Nix in a container or CI image, or troubleshooting a broken Nix setup.
---

# Nix Setup Skill

Reference for setting up development environments that assume Nix flakes (flakes + `nix-command`). Per-language templates are collected under `assets/` so you can drop them in with a single `cp`.

## When to use

- "Create a nix dev shell" / "Write a flake.nix"
- "Add nix to a new project"
- "Make nix work on claude code web / in a container"
- General questions about `flake.nix` / `flake.lock` / `.envrc`
- Troubleshooting `nix develop` / `nix build`

## What's in `assets/`

```
assets/
├── setup_nix.sh              # Installer that sets up single-user Nix with sandbox disabled (for container / CCW)
├── apm.nix                   # Nix derivation for microsoft/apm (Agent Package Manager)
├── moonbit/{flake.nix,.envrc}        # moonbit-overlay + moon
├── rust/{flake.nix,.envrc}           # rust-overlay + stable pinned + cargo-nextest/watch
├── typescript/{flake.nix,.envrc}     # nodejs_24 + pnpm (top-level)
├── python-uv/{flake.nix,.envrc}      # python3 + uv
├── haskell/{flake.nix,.envrc}        # GHC + cabal + HLS + hlint + ormolu
├── ocaml/{flake.nix,.envrc,.gitignore}  # OCaml 5 + dune + merlin + ocaml-lsp + utop
├── oxcaml/{flake.nix,.envrc,.gitignore} # Jane Street OxCaml (opam source build)
└── home-manager/             # multi-host home-manager flake (macos + ccweb)
    ├── flake.nix
    ├── common.nix
    ├── macos.nix             # aarch64-darwin: full desktop
    ├── ccweb.nix             # x86_64-linux: minimal sandbox
    └── .gitignore            # Excludes private.nix / *.secret.nix
```

Every template ships with **`just`**, **`ast-grep`**, and **`apm`** (shared operational tools).

The templates assume you place `flake.nix` + `apm.nix` side-by-side at the project root. If you want to swap out the language side, `apm.nix` is reusable as-is.

**`apm.nix` is optional**: you can delete it for projects that don't use the APM skill. In that case, remove both `apm = import ./apm.nix ...` and the `apm` entry inside `packages` from `flake.nix`. If you only want to keep `just` / `ast-grep`, leave it alone.

## Quick install

### macOS / Linux (recommended)

Use the [Determinate Systems installer](https://github.com/DeterminateSystems/nix-installer). `experimental-features = nix-command flakes` is enabled out of the box, and uninstalling is easy.

```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

### Claude Code web / other sandbox environments

For environments that lack systemd, have only root, or forbid nested namespaces, use `assets/setup_nix.sh`.

- `build-users-group =` (empty) for single-user mode
- `sandbox = false` so chroot is not required
- Writes `experimental-features = nix-command flakes` to both `/etc/nix/nix.conf` and `$HOME/.config/nix/nix.conf`
- Drops `/etc/profile.d/nix.sh` so PATH works in subsequent shells

```bash
cp ~/.claude/skills/nix-setup/assets/setup_nix.sh .
bash setup_nix.sh
. "$HOME/.nix-profile/etc/profile.d/nix.sh"  # apply to the current shell too
nix --version
```

## Minimal flake skeleton

```nix
{
  description = "...";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          packages = [ /* ... */ ];
          shellHook = ''...'';
        };
      });
}
```

`nix develop` drops you into `devShells.default`. With `direnv`, write `use flake` to `.envrc` and run `direnv allow`.

## Shared tools (included in every template)

| Tool | Purpose | Why it's always included |
|------|---------|--------------------------|
| `just` | Task runner | `justfile` is the project standard |
| `ast-grep` | Structural search / lint | Enforces statically the rules you can't write with grep |
| `apm`  | Agent dependency manager | Distributes skills/prompts reproducibly via `apm.yml` |

## Using the per-language templates

Installing a template is just a matter of **placing `flake.nix` + `apm.nix` side-by-side at the project root**:

```bash
# Example: MoonBit project
cp ~/.claude/skills/nix-setup/assets/apm.nix .
cp ~/.claude/skills/nix-setup/assets/moonbit/flake.nix .

nix develop           # builds on the first run
# If you're a direnv user:
echo 'use flake' > .envrc && direnv allow
```

### MoonBit

- Uses `moonbit-overlay.packages.${system}.moon-patched_latest`
- **The overlay is pinned to a known-working revision** (`50118f5c3c0298b5cb17cc6f1c346165801014c8`). The latest HEAD sometimes depends on packages marked as broken on nixpkgs-unstable (e.g. tcc), so evaluation can fail for stretches. Verify before updating.
- Runs `moon update` automatically when `moon.mod.json` is present (first time only)
- Reference: vibe-lang's `flake.nix`

### Rust

- Toolchain management via `rust-overlay`
- Default is `stable.latest.default` + rust-analyzer / clippy / rustfmt
- Pin to a specific version: `rust-bin.stable."1.91.0".default`
- `rust-toolchain.toml` integration: `rust-bin.fromRustupToolchainFile ./rust-toolchain.toml`
- WASM targets: `targets = [ "wasm32-wasip1" "wasm32-unknown-unknown" ]`

### TypeScript

- `nodejs_24` + `pkgs.pnpm` (top-level)
- **`nodePackages.*` was removed from nixpkgs in 2025** — `nodePackages.pnpm` no longer works
- Point `PNPM_HOME` at a project-local path (`$PWD/.pnpm`) to avoid polluting `$HOME`
- To switch to npm / yarn, drop `pkgs.pnpm` and use the `npm` bundled with `pkgs.nodejs_24`, or add `pkgs.yarn`

### Python + uv

- `pkgs.python3` + `pkgs.uv`
- uv manages Python versions itself, so the nix side is just a fallback
- `UV_PROJECT_ENVIRONMENT=$PWD/.venv`, `UV_CACHE_DIR=$PWD/.uv-cache` keep $HOME clean

### Haskell

- `pkgs.haskellPackages.{ghc,cabal-install,haskell-language-server,hlint,ormolu,ghcid}`
- Uses **the nixpkgs default (`haskellPackages`)**. To pin the GHC version, swap in `pkgs.haskell.packages.ghc98` or similar.
- If you need stricter reproducibility, consider `haskell.nix` (IOHK), though the learning curve and complexity jump considerably.
- To use stack, add `pkgs.stack` and switch to pinning GHC via `stack.yaml`'s `resolver`.
- On macOS, `stdenv.cc.cc.lib` is not on PATH, which trips up some FFI cases → append things like `buildInputs = [ pkgs.zlib ]`.

### OCaml

- `pkgs.ocamlPackages.{ocaml,dune_3,findlib,merlin,ocaml-lsp,ocamlformat,utop}` + `pkgs.opam`
- nixpkgs default OCaml 5.x series. Pin with `pkgs.ocaml-ng.ocamlPackages_5_2`, etc.
- **opam management**: shellHook sets `OPAMROOT=$PWD/.opam` to confine state to the project, running `opam init` + `opam switch create default --empty` automatically on the first run. Subsequent runs only `eval` `opam env`.
- Using an empty switch lets the nix-provided ocaml be used directly, avoiding dual compiler management.
- `.gitignore` includes `.opam/` so state can't be accidentally committed.
- Additional libraries land project-local via `opam install <pkg>`.
- `merlin` is a dependency of `ocaml-lsp`. Installing both gives complete editor integration.

### OxCaml (Jane Street's fork)

- Not in nixpkgs. Follows the officially recommended "opam + source build" flow; the nix side only provides `opam` and the build toolchain (`autoconf`, `automake`, `m4`, `pkg-config`, `gmp`, `libffi`).
- On the first run of shellHook:
  1. Create `$OPAMROOT/.opam`
  2. Create the `oxcaml-dev` switch as empty
  3. Pin the upstream repo with `opam pin add -ny git+https://github.com/oxcaml/oxcaml`
  4. Set the invariant with `opam switch set-invariant --packages oxcaml-dev`
- **The actual compiler build is not run automatically** (takes 5-20 min / ~1 GB). Users run this explicitly:
  ```bash
  opam install oxcaml-dev
  opam install dune merlin ocaml-lsp-server ocamlformat utop
  ```
- Supported: arm64 macOS / arm64 Linux / x86_64 Linux. x86_64 macOS works but is unofficially supported.
- The ocaml template uses "the same opam infrastructure but a different switch", so you can flip between the two templates.

## How `apm.nix` works

microsoft/apm is distributed not as an npm package but as a **PyInstaller-bundled native binary**.

- `_internal/` ships a Python 3.12 runtime + dependent libraries
- The `apm` binary alone references `_internal` as a sibling directory, so you can't extract it and use it standalone
- On Linux, `autoPatchelfHook` rewrites the links to glibc / libstdc++ / zlib so they point into the nix store
- Everything is placed under `$out/libexec/apm/`, and `$out/bin/apm` is a `makeWrapper` wrapper pointing there
- **`dontStrip = true` + `dontPatchELF = true` are required** — PyInstaller appends a PKG archive to the tail of the Mach-O / ELF. stdenv's default strip / patchelf cut off the tail, so without disabling those the binary fails at runtime with `Could not load PyInstaller's embedded PKG archive`.

Version update procedure:

```bash
# 1. Fetch the SHA256s for the new release
for a in darwin-arm64 darwin-x86_64 linux-arm64 linux-x86_64; do
  curl -sSL "https://github.com/microsoft/apm/releases/download/vX.Y.Z/apm-${a}.tar.gz.sha256"
done

# 2. Replace version and sources.*.sha256 in assets/apm.nix
```

## Handling npm tools with Nix (as of 2026)

The right path after `nodePackages.*` was removed:

1. **`pkgs.pnpm` / top-level packages** — try this first. Use it if it's in nixpkgs.
2. **`buildNpmPackage` + `importNpmLock`** — build an official package with a lockfile yourself. Fully pinned.
3. **`NPM_CONFIG_PREFIX="$PWD/.npm-global"` in shellHook** — impure but project-scoped. An escape hatch when chasing hashes is too expensive.
4. **`npx` / `pnpm dlx`** — for CLIs you rarely use.

**Avoid**: writing `npm install -g` directly in shellHook (pollutes user $HOME), referencing `nodePackages.*` (removed), adopting `dream2nix` / `node2nix` for new projects (maintenance is slowing).

### `buildNpmPackage` skeleton

```nix
my-cli = pkgs.buildNpmPackage {
  pname = "my-cli";
  version = "1.2.3";
  src = pkgs.fetchFromGitHub {
    owner = "owner"; repo = "my-cli"; rev = "v1.2.3";
    hash = "sha256-...";
  };
  # To switch to a lockfile-based build:
  # npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
  npmDepsHash = "sha256-...";
  dontNpmBuild = true;   # no build needed for a pure CLI
};
```

## home-manager (optional)

When you want to manage your whole user environment (zsh / git / starship / CLI packages) declaratively in Nix, use `assets/home-manager/`. When combining with chezmoi, `chezmoi forget` things like `dot_zshrc` first to transfer ownership to home-manager.

### File layout

- `flake.nix` — two outputs: a macOS desktop profile (`macos`) and one for Claude Code web / ephemeral Linux (`ccweb`)
- `common.nix` — shared across hosts (zsh, git, starship, direnv, fzf, basic CLI)
- `macos.nix` — aarch64-darwin specific (heavy tools like helix, neovim)
- `ccweb.nix` — minimal x86_64-linux config (kept thin, aiming for cold start < 2 min)

### Usage

```bash
# 1. Copy
cp -r ~/.claude/skills/nix-setup/assets/home-manager ~/.config/home-manager
cd ~/.config/home-manager

# 2. Edit `username` / `email` at the top of flake.nix
$EDITOR flake.nix

# 3. Apply
home-manager switch --flake .#macos     # macOS
home-manager switch --flake .#ccweb     # Linux for Claude Code web, etc.
```

### Notes when managing in a public repo

This template contains **zero secrets** (`username` / `email` are flake.nix variables; no hostnames, tokens, or known_hosts). Safe to put on public GitHub.

Keep your own secrets (SSH config, internal hosts, API tokens) via one of:

1. Create `./private.nix` and load it via `imports`. Exclude it in `.gitignore` (already included in the template).
2. Commit it encrypted with `sops-nix` / `agenix`.

### Cold start estimates on Claude Code web

| Step | With cache.nixos.org | Bare |
|------|---------------------|------|
| `setup_nix.sh` | 20-40 s | same |
| flake evaluation + substitute | 30-90 s | 2-8 min |
| activation (symlink expansion) | few seconds | same |
| **Total** | **1-2 min** | **4-12 min** |

The more heavy packages you add to `ccweb.nix`, the longer cold start gets. Keep shared bits in `common.nix` and only write additional packages in `ccweb.nix`.

## Adding to an existing repo

Unlike new projects (`cp assets/<lang>/flake.nix .`), existing repos have the following traps.

### 1. Save existing files before `cp`

The template `cp` will clobber existing `.envrc` / `flake.nix` / `.gitignore`. Follow save → merge:

```bash
# Save the existing one
[ -f .envrc ] && cp .envrc .envrc.pre-nix

# Drop the template in
cp ~/.claude/skills/nix-setup/assets/typescript/flake.nix .
cp ~/.claude/skills/nix-setup/assets/typescript/.envrc .

# Restore existing exports, etc.
# Merge by hand with .envrc.pre-nix as reference
```

### 2. `.envrc` merge policy

If the existing `.envrc` has things like `export DATABASE_URL=...`, put `use flake` **first** and leave existing `export`s after it (the devShell env is the base; repo-specific values override it).

```sh
# Correct order
use flake                              # start the devShell first
dotenv_if_exists .env.local            # secrets
export DATABASE_URL="postgres://..."   # preserve existing exports
```

Conversely, writing `export` first risks having it overwritten by `use flake`.

### 3. Lockfile migrations (npm → pnpm, etc.)

Mixing `package-lock.json` and `pnpm-lock.yaml` causes undefined behavior. If you migrate, do it **in a separate PR** from the Nix work:

```bash
git switch -c chore/pnpm-migration
rm package-lock.json && rm -rf node_modules
corepack enable && corepack prepare pnpm@10 --activate
pnpm install                          # re-resolve
pnpm why <critical-dep>               # check for major drift
pnpm build && pnpm test               # verify
git add pnpm-lock.yaml package.json && git rm package-lock.json
git commit -m "chore: migrate npm -> pnpm lockfile"
```

If `pnpm-lock.yaml` conflicts during rebase, **don't fix it by hand** — regenerate with `pnpm install` → `git add`.

### 4. Replacing `actions/setup-node` in CI

Rewrite existing ci.yml Node-related steps with the Nix-ification diff:

```diff
-      - uses: actions/setup-node@v4
-        with:
-          node-version: 24
-          cache: pnpm
-      - run: pnpm install --frozen-lockfile
-      - run: pnpm test
+      - uses: DeterminateSystems/nix-installer-action@main
+      - uses: DeterminateSystems/magic-nix-cache-action@main
+      - run: nix develop --command just ci
```

Define `pnpm install --frozen-lockfile && pnpm build && pnpm test` inside `just ci` (move it into the justfile). The trick to avoiding cold builds is to preserve the pnpm store separately via `actions/cache`.

### 5. Monorepo handling

For monorepos using `pnpm-workspace.yaml` / turborepo / Nx, placing a single `flake.nix` at the root shares `nix develop` across all workspaces. Keep per-package dev tools in `package.json` devDependencies and limit nix to the language runtime + cross-cutting tools (just / ast-grep).

### 6. Merging with existing `.gitignore`

Copying `assets/ocaml/.gitignore` or `assets/oxcaml/.gitignore` will overwrite an existing `.gitignore`. Merge is required.
- Always add `result` / `result-*` (Nix build artifacts)
- Add `.direnv/` (nix-direnv cache)

## direnv integration

Each language template ships with an `.envrc`. Copy it together with `flake.nix` and the devShell will be applied automatically on `cd`.

```bash
cp ~/.claude/skills/nix-setup/assets/apm.nix .
cp ~/.claude/skills/nix-setup/assets/rust/flake.nix .
cp ~/.claude/skills/nix-setup/assets/rust/.envrc .
direnv allow                             # approve once at the start
```

**`nix-direnv` is required** — bare direnv re-evaluates the flake on every cd, costing 10-60 s. `nix-direnv` caches the result + creates GC roots, bringing it down to < 100 ms. In `assets/home-manager/common.nix` it's already enabled via `programs.direnv.nix-direnv.enable = true`.

Patterns in the shipped `.envrc`s:

- **moonbit**: `use flake` only (minimal)
- **rust**: `use flake` + `watch_file rust-toolchain.toml` — auto-reload when the toolchain switches
- **typescript** / **python-uv**: `use flake` + `dotenv_if_exists .env.local` — load local API keys and the like

### Editor integration

Installing the VS Code `direnv.direnv` extension, or the direnv plugins for Helix / Neovim, makes the LSP server inherit the devShell PATH. rust-analyzer picks up the rustToolchain from `flake.nix`, `moon ide` grabs the overlay version of moon, etc.

### GC root cleanup

```bash
nix-direnv-prune     # detect and remove unused .direnv
```

About every six months. When `/nix/store` starts bloating.

## GitHub Actions

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: DeterminateSystems/nix-installer-action@main
      - uses: DeterminateSystems/magic-nix-cache-action@main

      - name: Run tests in dev shell
        run: nix develop --command just test
```

`magic-nix-cache-action` puts the Nix store on the free GitHub Actions cache. Plenty for personal projects. For large-scale cases, consider Cachix / attic.

## Troubleshooting

### `error: experimental Nix feature 'nix-command' is disabled`

```bash
mkdir -p ~/.config/nix
echo 'experimental-features = nix-command flakes' >> ~/.config/nix/nix.conf
```

### `error: cannot build on ... due to sandbox`

In container / rootless environments the sandbox doesn't work. Add `sandbox = false` to `/etc/nix/nix.conf` (`setup_nix.sh` does this).

### `error: attribute 'pnpm' missing` / `nodePackages.pnpm` not found

In nixpkgs `>= 24.11`, `nodePackages.*` has been removed. Use `pkgs.pnpm` (top-level).

### Permission errors on `/nix/store` on macOS

The Determinate installer is recommended. Doing it manually on Apple Silicon requires APFS volume splitting.

### autoPatchelfHook failure (`libstdc++.so.6 not found`)

Add `stdenv.cc.cc.lib` to `buildInputs`. The same fix used in `apm.nix`.

### Updating flake inputs

```bash
nix flake update              # all inputs
nix flake update nixpkgs      # individual
```

## References

- [Nix manual (flakes)](https://nix.dev/concepts/flakes.html)
- [nixpkgs JavaScript section](https://github.com/NixOS/nixpkgs/blob/master/doc/languages-frameworks/javascript.section.md)
- [DeterminateSystems/nix-installer](https://github.com/DeterminateSystems/nix-installer)
- [oxalica/rust-overlay](https://github.com/oxalica/rust-overlay)
- [moonbit-community/moonbit-overlay](https://github.com/moonbit-community/moonbit-overlay)
- [microsoft/apm](https://github.com/microsoft/apm)
