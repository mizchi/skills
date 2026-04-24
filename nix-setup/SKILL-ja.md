---
name: nix-setup
description: Set up Nix flakes for development environments. Includes ready-to-use flake.nix templates for MoonBit, Rust, TypeScript (with pnpm), Python+uv, each preloaded with just / ast-grep / apm. Covers installation on sandboxed environments like Claude Code web, the buildNpmPackage idiom, direnv integration, and GitHub Actions. Use when starting a new project with Nix, adding a flake to an existing project, bootstrapping Nix in a container or CI image, or troubleshooting a broken Nix setup.
---

# Nix Setup Skill

Nix flake (flakes + `nix-command`) 前提の開発環境セットアップ リファレンス。各言語の雛形を `assets/` にまとめ、`cp` 一発で使えるようにしてある。

## When to use

- "nix の dev shell を作って" / "flake.nix 書いて"
- "新しいプロジェクトに nix 入れたい"
- "claude code web / コンテナで nix 使えるようにして"
- `flake.nix` / `flake.lock` / `.envrc` に関する質問全般
- `nix develop` / `nix build` のトラブル調査

## What's in `assets/`

```
assets/
├── setup_nix.sh              # 単一ユーザー Nix を sandbox 無効で入れるインストーラ (container / CCW 向け)
├── apm.nix                   # microsoft/apm (Agent Package Manager) の Nix derivation
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
    └── .gitignore            # private.nix / *.secret.nix を除外
```

全テンプレートに **`just`**, **`ast-grep`**, **`apm`** が入っている（共通運用ツール）。

テンプレは「プロジェクトルートに `flake.nix` + `apm.nix` を並置する」前提。言語側を差し替えたくなったら `apm.nix` は使い回せる。

**`apm.nix` はオプション**: APM skill を使わないプロジェクトなら削除して良い。その場合 `flake.nix` から `apm = import ./apm.nix ...` と `packages` 内の `apm` を両方消す。`just` / `ast-grep` だけ残したいならそのまま。

## Quick install

### macOS / Linux (推奨)

[Determinate Systems インストーラ](https://github.com/DeterminateSystems/nix-installer) を使う。`experimental-features = nix-command flakes` が最初から有効で、アンインストールも容易。

```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

### Claude Code web / 他の sandbox 環境

systemd が使えない、root しかいない、ネスト化 namespace を禁じられた環境向けに `assets/setup_nix.sh` を使う。

- `build-users-group =` (空) で single-user モード
- `sandbox = false` で chroot を要求しない
- `experimental-features = nix-command flakes` を `/etc/nix/nix.conf` と `$HOME/.config/nix/nix.conf` の両方に書く
- `/etc/profile.d/nix.sh` を置いて以降の shell でも PATH が通る

```bash
cp ~/.claude/skills/nix-setup/assets/setup_nix.sh .
bash setup_nix.sh
. "$HOME/.nix-profile/etc/profile.d/nix.sh"  # 現在の shell にも反映
nix --version
```

## Flake の最小骨格

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

`nix develop` で `devShells.default` に入る。`direnv` なら `.envrc` に `use flake` と書いて `direnv allow`。

## 共通ツール (全テンプレートに入れている)

| ツール | 用途 | なぜ毎回入れるか |
|-------|------|----------------|
| `just` | タスクランナー | `justfile` がプロジェクト標準 |
| `ast-grep` | 構造検索・lint | grep では書けないルールを静的に強制 |
| `apm`  | Agent 依存マネージャ | `apm.yml` でスキル/プロンプトを再現性ある形で配布 |

## 言語別テンプレの使い方

雛形の導入は **`flake.nix` + `apm.nix` をプロジェクトルートに並置** するだけ：

```bash
# 例: MoonBit プロジェクト
cp ~/.claude/skills/nix-setup/assets/apm.nix .
cp ~/.claude/skills/nix-setup/assets/moonbit/flake.nix .

nix develop           # 初回はビルド
# direnv 派なら:
echo 'use flake' > .envrc && direnv allow
```

### MoonBit

- `moonbit-overlay.packages.${system}.moon-patched_latest` を使う
- **overlay は既知の動作バージョンにピン留めしている** (`50118f5c3c0298b5cb17cc6f1c346165801014c8`)。最新 HEAD は nixpkgs-unstable で broken 扱いのパッケージ (例: tcc) に依存することがあり、評価すら通らない時期がある。更新は動作確認してから
- `moon.mod.json` があれば `moon update` を自動実行（初回のみ）
- 参考: vibe-lang の `flake.nix`

### Rust

- `rust-overlay` で toolchain 管理
- デフォルトは `stable.latest.default` + rust-analyzer / clippy / rustfmt
- 特定バージョンにピン: `rust-bin.stable."1.91.0".default`
- `rust-toolchain.toml` 連携: `rust-bin.fromRustupToolchainFile ./rust-toolchain.toml`
- WASM ターゲット: `targets = [ "wasm32-wasip1" "wasm32-unknown-unknown" ]`

### TypeScript

- `nodejs_24` + `pkgs.pnpm` (top-level)
- **`nodePackages.*` は 2025 年に nixpkgs から削除された** — `nodePackages.pnpm` は使えない
- `PNPM_HOME` をプロジェクトローカル (`$PWD/.pnpm`) に向けて `$HOME` 汚染を避ける
- npm / yarn に切り替える場合は `pkgs.pnpm` を外して `pkgs.nodejs_24` に付属する `npm` を使うか、`pkgs.yarn` を追加

### Python + uv

- `pkgs.python3` + `pkgs.uv`
- uv が自身で Python バージョン管理するので、nix 側はフォールバック扱い
- `UV_PROJECT_ENVIRONMENT=$PWD/.venv`, `UV_CACHE_DIR=$PWD/.uv-cache` で $HOME を汚さない

### Haskell

- `pkgs.haskellPackages.{ghc,cabal-install,haskell-language-server,hlint,ormolu,ghcid}`
- **nixpkgs 標準 (`haskellPackages`)** を使う構成。GHC バージョン固定は `pkgs.haskell.packages.ghc98` 等に差し替え
- さらに厳密な再現性が必要なら `haskell.nix` (IOHK) を検討。ただし学習コストと複雑度は跳ね上がる
- stack を使うなら `pkgs.stack` を追加し、`stack.yaml` の `resolver` で GHC を固定する方針に切替え
- macOS では `stdenv.cc.cc.lib` が PATH にないので一部 FFI で困る → `buildInputs = [ pkgs.zlib ]` などを追記

### OCaml

- `pkgs.ocamlPackages.{ocaml,dune_3,findlib,merlin,ocaml-lsp,ocamlformat,utop}` + `pkgs.opam`
- nixpkgs 標準の OCaml 5.x 系。固定版は `pkgs.ocaml-ng.ocamlPackages_5_2` 等
- **opam 管理**: shellHook が `OPAMROOT=$PWD/.opam` で state をプロジェクトローカルに閉じ込め、初回だけ `opam init` + `opam switch create default --empty` を自動実行。2 回目以降は `opam env` だけを `eval` する
- 空スイッチを使うことで nix 提供の ocaml がそのまま使われ、compiler の二重管理を避ける
- `.gitignore` に `.opam/` が含まれているので state を誤って commit しない
- 追加ライブラリは `opam install <pkg>` で project-local に落ちる
- `merlin` は `ocaml-lsp` の依存。両方入れておくとエディタ連携が完全

### OxCaml (Jane Street のフォーク)

- nixpkgs 未収録。公式推奨の「opam + ソースビルド」フローを踏襲し、nix 側は `opam` と build toolchain (`autoconf`, `automake`, `m4`, `pkg-config`, `gmp`, `libffi`) だけ提供
- shellHook の初回実行で:
  1. `$OPAMROOT/.opam` を作成
  2. `oxcaml-dev` スイッチを empty で作成
  3. `opam pin add -ny git+https://github.com/oxcaml/oxcaml` で upstream repo を pin
  4. `opam switch set-invariant --packages oxcaml-dev` で invariant 設定
- **実 compiler ビルドは自動実行しない**（5-20 分 / ~1 GB かかる）。ユーザが以下を明示実行:
  ```bash
  opam install oxcaml-dev
  opam install dune merlin ocaml-lsp-server ocamlformat utop
  ```
- サポート: arm64 macOS / arm64 Linux / x86_64 Linux。x86_64 macOS は動くが非公式サポート
- ocaml テンプレとは「同じ opam インフラを使うが別 switch」なので両テンプレを切り替えて使い分け可能

## `apm.nix` の仕組み

microsoft/apm は npm パッケージではなく **PyInstaller バンドルされたネイティブバイナリ**で配布される。

- `_internal/` に Python 3.12 ランタイム + 依存ライブラリが同梱される
- 単体 `apm` バイナリは `_internal` を同居ディレクトリで参照するので、切り出して使うことはできない
- Linux では `autoPatchelfHook` で glibc / libstdc++ / zlib へのリンクを nix store 内のものに書き換え
- `$out/libexec/apm/` に丸ごと配置し、`$out/bin/apm` はそこへの `makeWrapper` ラッパー
- **`dontStrip = true` + `dontPatchELF = true` が必須** — PyInstaller は Mach-O / ELF の末尾に PKG アーカイブを append する。stdenv の既定 strip / patchelf は末尾を削るので、これを無効化しないと実行時に `Could not load PyInstaller's embedded PKG archive` で落ちる

バージョン更新手順:

```bash
# 1. 新しいリリースの SHA256 を取得
for a in darwin-arm64 darwin-x86_64 linux-arm64 linux-x86_64; do
  curl -sSL "https://github.com/microsoft/apm/releases/download/vX.Y.Z/apm-${a}.tar.gz.sha256"
done

# 2. assets/apm.nix の version と sources.*.sha256 を差し替え
```

## npm ツールを Nix で扱う (2026 時点)

`nodePackages.*` 廃止後の正道：

1. **`pkgs.pnpm` / top-level packages** — まずこれ。nixpkgs 内にあれば使う。
2. **`buildNpmPackage` + `importNpmLock`** — lockfile のある公式パッケージを自前でビルド。完全にピン留めされる。
3. **`NPM_CONFIG_PREFIX="$PWD/.npm-global"` を shellHook で** — impure だがプロジェクトスコープ。hash 追従が重い場合の逃げ道。
4. **`npx` / `pnpm dlx`** — たまにしか使わない CLI。

**避けるべき**: `npm install -g` をそのまま shellHook に書く (ユーザー $HOME 汚染)、`nodePackages.*` を参照する (削除済み)、`dream2nix` / `node2nix` を新規採用する (メンテ停止気味)。

### `buildNpmPackage` の骨格

```nix
my-cli = pkgs.buildNpmPackage {
  pname = "my-cli";
  version = "1.2.3";
  src = pkgs.fetchFromGitHub {
    owner = "owner"; repo = "my-cli"; rev = "v1.2.3";
    hash = "sha256-...";
  };
  # lockfile ベースに切り替えるなら:
  # npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
  npmDepsHash = "sha256-...";
  dontNpmBuild = true;   # pure CLI なら build なし
};
```

## home-manager (オプション)

ユーザー環境全体（zsh / git / starship / CLI パッケージ）を Nix 式で宣言的に管理したい場合は `assets/home-manager/` を使う。chezmoi と併用する場合は `dot_zshrc` 等を `chezmoi forget` してから home-manager に所有権を移す。

### ファイル構成

- `flake.nix` — macOS desktop プロファイル (`macos`) と Claude Code web / ephemeral Linux 用 (`ccweb`) の 2 出力
- `common.nix` — 全ホスト共通（zsh, git, starship, direnv, fzf, 基本 CLI）
- `macos.nix` — aarch64-darwin 固有（helix, neovim 等の重量ツール）
- `ccweb.nix` — x86_64-linux 最小構成（cold start < 2 分を目標に薄く保つ）

### 使い方

```bash
# 1. コピー
cp -r ~/.claude/skills/nix-setup/assets/home-manager ~/.config/home-manager
cd ~/.config/home-manager

# 2. flake.nix 先頭の `username` / `email` を書き換え
$EDITOR flake.nix

# 3. 適用
home-manager switch --flake .#macos     # macOS
home-manager switch --flake .#ccweb     # Claude Code web 等 Linux
```

### 公開 repo で管理するときの注意

このテンプレは **秘密情報ゼロ** で書いてある（`username` / `email` は flake.nix の変数、ホスト名・トークン・known_hosts は含まない）。公開 GitHub に置いて OK。

自分専用の秘密（SSH 設定、内部ホスト、API トークン）は以下のいずれかで:

1. `./private.nix` を作って `imports` で読み込む。`.gitignore` で除外（テンプレに含めてある）
2. `sops-nix` / `agenix` で暗号化したまま commit

### Claude Code web での cold start 目安

| 工程 | cache.nixos.org あり | 素 |
|---|---|---|
| `setup_nix.sh` | 20-40 秒 | 同左 |
| flake 評価 + substitute | 30-90 秒 | 2-8 分 |
| activation (symlink 展開) | 数秒 | 同左 |
| **合計** | **1-2 分** | **4-12 分** |

`ccweb.nix` に heavy パッケージを追加するほど cold start が延びる。共通部分は `common.nix` に寄せて、`ccweb.nix` は追加パッケージだけを書く方針を守る。

## 既存 repo への導入

新規プロジェクト (`cp assets/<lang>/flake.nix .`) と違い、既存 repo では以下の罠がある。

### 1. `cp` 前に既存ファイルを退避

テンプレの `cp` はそのまま既存 `.envrc` / `flake.nix` / `.gitignore` を上書きする。退避 → マージの手順を踏む:

```bash
# 既存を保存
[ -f .envrc ] && cp .envrc .envrc.pre-nix

# テンプレを展開
cp ~/.claude/skills/nix-setup/assets/typescript/flake.nix .
cp ~/.claude/skills/nix-setup/assets/typescript/.envrc .

# 既存の export などを復元
# .envrc.pre-nix を参照しつつ手でマージ
```

### 2. `.envrc` のマージ方針

既存 `.envrc` に `export DATABASE_URL=...` 等があるなら、`use flake` を **先頭** に置いて既存 `export` を後ろに残す（devShell の env を土台に、repo 固有値で上書き）。

```sh
# 正しい順序
use flake                              # まず devShell を起動
dotenv_if_exists .env.local            # secrets
export DATABASE_URL="postgres://..."   # 既存 export を温存
```

反対に `export` を先に書くと `use flake` で上書きされる可能性がある。

### 3. lockfile 移行 (npm → pnpm 等)

`package-lock.json` と `pnpm-lock.yaml` の混在は不定動作の元。移行するなら **別 PR** にして Nix 化と分ける:

```bash
git switch -c chore/pnpm-migration
rm package-lock.json && rm -rf node_modules
corepack enable && corepack prepare pnpm@10 --activate
pnpm install                          # 再解決
pnpm why <critical-dep>               # major drift 確認
pnpm build && pnpm test               # 動作確認
git add pnpm-lock.yaml package.json && git rm package-lock.json
git commit -m "chore: migrate npm -> pnpm lockfile"
```

rebase 中に `pnpm-lock.yaml` が衝突したら **手で直さず** `pnpm install` で再生成 → `git add`。

### 4. CI の `actions/setup-node` 置換

既存 ci.yml の Node 関連ステップを Nix 化差分で書き換える:

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

`just ci` 側で `pnpm install --frozen-lockfile && pnpm build && pnpm test` を定義（justfile に移す）。pnpm store は別途 `actions/cache` で保持するのが cold-build を避けるコツ。

### 5. monorepo の扱い

`pnpm-workspace.yaml` / turborepo / Nx を使う monorepo は root に `flake.nix` を 1 つ置けば全 workspace で `nix develop` が共有される。各 package 固有の dev tool は `package.json` の devDependencies に留め、nix は言語ランタイム + 横断ツール (just / ast-grep) に絞る。

### 6. 既存 `.gitignore` との統合

`assets/ocaml/.gitignore` や `assets/oxcaml/.gitignore` をコピーすると既存の `.gitignore` を上書きする。マージ必要。
- `result` / `result-*` (Nix ビルド成果) を必ず追加
- `.direnv/` (nix-direnv キャッシュ) を追加

## direnv 連携

各言語テンプレには `.envrc` が同梱済み。`flake.nix` と一緒にコピーすれば `cd` 時に devShell が自動適用される。

```bash
cp ~/.claude/skills/nix-setup/assets/apm.nix .
cp ~/.claude/skills/nix-setup/assets/rust/flake.nix .
cp ~/.claude/skills/nix-setup/assets/rust/.envrc .
direnv allow                             # 最初だけ承認
```

**`nix-direnv` が必須** — 素の direnv だと cd のたびに flake 評価が走って 10-60 秒待たされる。`nix-direnv` はキャッシュ + GC root を作って < 100ms に縮める。`assets/home-manager/common.nix` では `programs.direnv.nix-direnv.enable = true` で有効化済み。

同梱 `.envrc` のパターン:

- **moonbit**: `use flake` のみ（最小）
- **rust**: `use flake` + `watch_file rust-toolchain.toml` — toolchain 切替時の自動 reload
- **typescript** / **python-uv**: `use flake` + `dotenv_if_exists .env.local` — ローカル API キー等の読込

### エディタ統合

VS Code の `direnv.direnv` 拡張 / Helix / Neovim の direnv プラグインを入れると LSP サーバーが devShell の PATH を継承する。rust-analyzer が `flake.nix` の rustToolchain を使う、`moon ide` が overlay 版の moon を掴む、といった一致が取れる。

### GC root の掃除

```bash
nix-direnv-prune     # 使われていない .direnv を検出して除去
```

半年に一度くらい。`/nix/store` が肥大化してきたら。

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

`magic-nix-cache-action` は GitHub Actions の無料キャッシュに Nix store を載せる。私製プロジェクトなら十分。大規模なら Cachix / attic を検討。

## トラブルシュート

### `error: experimental Nix feature 'nix-command' is disabled`

```bash
mkdir -p ~/.config/nix
echo 'experimental-features = nix-command flakes' >> ~/.config/nix/nix.conf
```

### `error: cannot build on ... due to sandbox`

container / rootless 環境では sandbox が効かない。`/etc/nix/nix.conf` に `sandbox = false` を書く（`setup_nix.sh` はこれをやる）。

### `error: attribute 'pnpm' missing` / `nodePackages.pnpm` が見つからない

nixpkgs `>= 24.11` では `nodePackages.*` が削除されている。`pkgs.pnpm` (top-level) を使う。

### macOS で `/nix/store` の権限エラー

Determinate インストーラが推奨。手動でやるなら Apple Silicon では APFS ボリューム分割が必要。

### autoPatchelfHook 失敗 (`libstdc++.so.6 not found`)

`buildInputs` に `stdenv.cc.cc.lib` を追加。`apm.nix` でやっているのと同じ対処。

### flake input の更新

```bash
nix flake update              # 全 input
nix flake update nixpkgs      # 個別
```

## 参考リンク

- [Nix manual (flakes)](https://nix.dev/concepts/flakes.html)
- [nixpkgs JavaScript section](https://github.com/NixOS/nixpkgs/blob/master/doc/languages-frameworks/javascript.section.md)
- [DeterminateSystems/nix-installer](https://github.com/DeterminateSystems/nix-installer)
- [oxalica/rust-overlay](https://github.com/oxalica/rust-overlay)
- [moonbit-community/moonbit-overlay](https://github.com/moonbit-community/moonbit-overlay)
- [microsoft/apm](https://github.com/microsoft/apm)
