---
title: "MoonBit Nix Development"
---

# MoonBit Nix Development

moonbit-overlay を使って再現可能な開発環境とパッケージビルドを構築する。

## Prerequisites

- Nix with flakes enabled
- Optional: direnv

## Quick Setup

### flake.nix (minimal devShell)

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    moonbit-overlay.url = "github:moonbit-community/moonbit-overlay";
    moon-registry = {
      url = "git+https://mooncakes.io/git/index";
      flake = false;
    };
  };

  outputs = inputs:
    inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux" "aarch64-linux"
        "x86_64-darwin" "aarch64-darwin"
      ];

      perSystem = { system, ... }:
        let
          pkgs = import inputs.nixpkgs {
            inherit system;
            overlays = [ inputs.moonbit-overlay.overlays.default ];
          };
          moonHome = pkgs.moonPlatform.bundleWithRegistry {
            cachedRegistry = pkgs.moonPlatform.buildCachedRegistry {
              moonModJson = ./moon.mod.json;
              registryIndexSrc = inputs.moon-registry;
            };
          };
        in {
          devShells.default = pkgs.mkShellNoCC {
            packages = [ moonHome pkgs.git ];
            env.MOON_HOME = "${moonHome}";
          };
        };
    };
}
```

### .envrc (direnv)

```bash
use flake
```

### Usage

```bash
nix develop    # enter shell with moon, moonc, etc.
direnv allow   # or auto-enter with direnv
```

## Package Build (pure MoonBit)

`buildMoonPackage` は `moon build --target <target> --release` を実行し、`_build/<target>/release/build/` から `.exe` を `$out/bin/` にインストールする。

### package.nix

```nix
{
  lib, git, autoPatchelfHook, stdenv,
  moonPlatform, moonRegistryIndex,
}:
moonPlatform.buildMoonPackage {
  src = ./.;
  moonModJson = ./moon.mod.json;
  inherit moonRegistryIndex;

  doCheck = false;
  propagatedBuildInputs = [ git ];
  nativeBuildInputs = lib.optionals stdenv.isLinux [ autoPatchelfHook ];

  meta = {
    description = "My MoonBit app";
    mainProgram = "my-app";
    platforms = [
      "x86_64-linux" "aarch64-linux"
      "x86_64-darwin" "aarch64-darwin"
    ];
  };
}
```

### flake.nix (with package)

```nix
flake = {
  overlays.default = _final: prev: {
    my-app = prev.callPackage ./package.nix {
      moonRegistryIndex = inputs.moon-registry;
    };
  };
};

perSystem = { system, ... }: let
  pkgs = import inputs.nixpkgs {
    inherit system;
    overlays = [ inputs.moonbit-overlay.overlays.default ];
  };
  my-app = pkgs.callPackage ./package.nix {
    moonRegistryIndex = inputs.moon-registry;
  };
in {
  packages.default = my-app;
  apps.default = {
    type = "app";
    program = "${my-app}/bin/my-app";
  };
};
```

### default.nix (legacy)

```nix
{
  pkgs ? import <nixpkgs> { },
  moonRegistryIndex ? builtins.fetchGit {
    url = "https://mooncakes.io/git/index";
    ref = "main";
  },
  ...
}:
pkgs.callPackage ./package.nix { inherit moonRegistryIndex; }
```

## C Library Dependencies (native target)

`buildMoonPackage` は `moon build` を内部で実行するが、moon のリンカは `-L` パスを外部から受け取れない。C ライブラリ（duckdb, zlib 等）に依存する場合は `stdenv.mkDerivation` で2段階ビルドを行う。

### Step 1: Generate C source

```bash
moon build --target native --release src/cmd/my_app 2>/dev/null || true
# link fails but .c files are generated
```

### Step 2: Manual linking

```bash
cc -O2 -o my-app \
  -I"$MOON_HOME/include" \
  "$MOON_HOME/lib/libmoonbitrun.o" \
  "$BINARY.c" \
  "$BUILD_DIR/runtime.o" \
  $BUILD_DIR/.mooncakes/some/dep/lib*.a \
  -L"${lib-path}" -lmylib -lm \
  "$MOON_HOME/lib/libbacktrace.a"
```

### package.nix (with C deps)

```nix
{ lib, git, duckdb, zlib, stdenv, moonPlatform, moonRegistryIndex }:
let
  moonHome = moonPlatform.bundleWithRegistry {
    cachedRegistry = moonPlatform.buildCachedRegistry {
      moonModJson = ./moon.mod.json;
      registryIndexSrc = moonRegistryIndex;
    };
  };
in stdenv.mkDerivation {
  pname = "my-app";
  version = "0.1.0";
  src = ./.;

  nativeBuildInputs = [ moonHome ];
  buildInputs = [ duckdb.dev zlib.dev ];
  propagatedBuildInputs = [ git duckdb.lib zlib ];

  buildPhase = ''
    export MOON_HOME=$(mktemp -d)
    cp -rL ${moonHome}/* $MOON_HOME/
    chmod -R u+w $MOON_HOME
    export HOME=$TMPDIR

    C_INCLUDE_PATH="${duckdb.dev}/include:${zlib.dev}/include" \
    LIBRARY_PATH="${duckdb.dev}/lib:${zlib}/lib" \
    moon build --target native --release src/cmd/my_app 2>/dev/null || true

    BUILD_DIR="_build/native/release/build"
    cc -O2 -o my-app \
      -I"$MOON_HOME/include" \
      "$MOON_HOME/lib/libmoonbitrun.o" \
      "$BUILD_DIR/cmd/my_app/my_app.c" \
      "$BUILD_DIR/runtime.o" \
      $BUILD_DIR/.mooncakes/f4ah6o/duckdb/libduckdb.a \
      $BUILD_DIR/.mooncakes/mizchi/zlib/lib*.a \
      -L"${duckdb.dev}/lib" -L"${zlib}/lib" \
      -lduckdb -lz -lm \
      "$MOON_HOME/lib/libbacktrace.a" \
      ${lib.optionalString stdenv.isDarwin "-Wl,-rpath,${duckdb.lib}/lib"}
  '';

  installPhase = ''
    mkdir -p $out/bin
    install -Dm755 my-app $out/bin/my-app
  '';
}
```

## C FFI Stubs

MoonBit から C 関数を呼ぶ場合、`moon.pkg` に `native-stub` を設定する。

```
options(
  "is-main": true,
  "native-stub": ["my_ffi.c"],
)
```

生成された `.o` ファイルはリンク時に手動で含める:

```bash
$BUILD_DIR/cmd/my_app/my_ffi.o \
```

### FFI Warning (0055) 抑制

`Bytes` パラメータの `extern "C"` で unannotated_ffi warning が出る場合:

```
options(
  "warn-list": "-0055",
)
```

将来的には `#borrow` / `#owned` アノテーションを付けるべき。

## Key Points

- `moon-registry` input は `flake = false` にする（Git リポジトリで flake ではない）
- `buildMoonPackage` は `moon.mod.json` の `preferred-target` を読んでターゲットを決定
- `moonTarget` パラメータでオーバーライド可能
- `moonFlags` で追加の `moon build` フラグを渡せる
- `doCheck = false` でテストをスキップ（CI 側で別途実行する場合）
- warnings は errors として扱われる — deprecated API は修正が必要
- `nix flake check` でビルド検証
- `nix run .` でローカル実行
- `nix run github:user/repo` でリモートから直接実行
