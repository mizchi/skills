# MoonBit with Nix

Use Nix for a project that already uses it or when the user selects it.
Keep the existing environment otherwise; Devbox remains opt-in.

## Toolchain and project builders

Checked 2026-11-16: [moonbit-overlay](https://github.com/moonbit-community/moonbit-overlay)
distributes complete versioned toolchains. Use
`moonbit-overlay.packages.${system}.latest` directly, or
`pkgs.moonbit-bin.latest` with its overlay. `latest` is fixed by the input's
lock revision. Current supported hosts are `aarch64-darwin` and `x86_64-linux`.
The old `moon-patched_latest`, `moonPlatform.bundleWithRegistry` and
`buildMoonPackage` examples do not describe the current distribution API.

Project dependency resolution is separate:
[moon-nix](https://github.com/moonbit-community/moon-nix) exposes
`lib.mkMoonNix { inherit pkgs; toolchain = ...; }` and `buildProject`.
Pin and test its revision before use; do not infer compatibility from the
compiler version alone.

## Development shell

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    moonbit-overlay.url = "github:moonbit-community/moonbit-overlay";
  };
  outputs = { nixpkgs, moonbit-overlay, ... }:
    let
      system = "aarch64-darwin"; # or x86_64-linux
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      devShells.${system}.default = pkgs.mkShell {
        packages = [ moonbit-overlay.packages.${system}.latest ];
      };
    };
}
```

Commit `flake.lock`. Enter with `nix develop`; run `moon version --all` before
copying compiler-specific syntax. The Nix toolchain wrapper sets its own SDK
root; do not point it at a different globally installed core.
Use `use flake` in `.envrc` only when the project already uses direnv or requests it.

## Verified DSL package build

The [smoke flake](../assets/nix-smoke/flake.nix) uses the current
`moon.mod` / `moon.pkg` DSL and a pinned v0.10.20 toolchain. Its dependency-free
native executable is built with `stdenv.mkDerivation`, calling
`moon build --target native --release --deny-warn`, then installing the emitted
executable. The Nix check executes that binary and asserts output `42`.

```sh
nix build path:./moonbit-practice/assets/nix-smoke#checks.aarch64-darwin.output --no-link
nix develop path:./moonbit-practice/assets/nix-smoke --command moon version --all
```

Both commands passed on aarch64-darwin with Nix 2.33.0 / Determinate Nix 3.15.1
and compiler v0.10.20+65efd5b93. Linux is declared but was not executed here.
For another project, change the output path and verify it from `moon build`.
For dependencies, provide vendored/resolved inputs in the Nix build or validate
a compatible project builder. An offline sandbox cannot run an unpinned
network registry update as a dependency-resolution substitute.

## Project-builder compatibility control

At moon-nix commit `026f5a4e9fc7bf78699d69fdb70318c26ac8f07c`, a minimal
`pkgtype(kind: "executable")` project failed evaluation with
`must declare is-main`. The builder's executable check still reads `raw.is-main`.
Do not rewrite modern project manifests to legacy JSON or claim that a
DSL-capable parser necessarily supports the current executable declaration.
The verified smoke build above keeps the compiler's current DSL intact.
Revalidate this control before adopting a newer builder.

For C FFI, keep target-specific `native-stub` declarations and system libraries
explicit in the derivation; see [ffi-native.md](ffi-native.md). Nix support for a
host platform is separate from the MoonBit backend being compiled.
