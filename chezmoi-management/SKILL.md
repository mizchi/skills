---
name: chezmoi-management
description: mizchi 個人の chezmoi dotfiles 運用メモ。ソース位置、ディレクトリ命名規則、日常の diff/apply フロー、スキル追加手順、APM と chezmoi の境界、pre-commit (prek + secretlint)、トラブルシュートをまとめる。~/.claude/, ~/.config/, ~/.zshrc を触るとき・新マシン初期化時・新規スキル追加時に参照する。
---

# chezmoi Management (mizchi personal)

自分の dotfiles 管理運用メモ。chezmoi 本家 docs は十分なので、ここは **具体的に自分の環境でどう回っているか**だけ書く。

## 前提環境

| 項目 | 値 |
|---|---|
| ソースディレクトリ | `~/.local/share/chezmoi/` |
| リモート | `https://github.com/mizchi/chezmoi-dotfiles.git` |
| ブランチ | `main` |
| pre-commit | [prek](https://github.com/j178/prek) + [secretlint](https://github.com/secretlint/secretlint) |
| apply 後フック | `run_after_apm-install.sh` → `apm install --global --target claude` |

## レイアウト早見表

```
~/.local/share/chezmoi/
├── dot_apm/          → ~/.apm/      (APM config)
├── dot_claude/       → ~/.claude/   (Claude Code)
│   ├── CLAUDE.md.tmpl
│   ├── settings.json.tmpl
│   ├── rules/
│   └── skills/       → ~/.claude/skills/   (自作スキル)
├── dot_codex/        → ~/.codex/
├── dot_config/       → ~/.config/   (helix, mise, sheldon, starship, zellij, zsh)
├── dot_zshrc         → ~/.zshrc
└── run_after_apm-install.sh  (scripts/run_after_* は apply 後に毎回実行される)
```

### ファイル名 prefix の意味

| prefix | 意味 | 例 |
|---|---|---|
| `dot_` | 先頭 `.` | `dot_zshrc` → `.zshrc` |
| `executable_` | `+x` 権限 | `executable_setup.sh` → `setup.sh` (755) |
| `private_` | `0600` 権限 | `private_key` → `key` (600) |
| `.tmpl` | Go template | `CLAUDE.md.tmpl` → ホスト名等で展開された `CLAUDE.md` |
| `run_once_` | 初回のみ実行 | `run_once_install_brew.sh` |
| `run_after_` | apply 後に毎回実行 | `run_after_apm-install.sh` |

## 日常フロー

### ① 何が違うか見る

```bash
chezmoi diff                   # source と dest の差分
chezmoi status                 # 大雑把な状態（MM/M /?? など）
```

**`chezmoi diff` の方向感覚**: 出力は `- dest` / `+ target` の順（git diff の old=現在 / new=適用後 規約に従う）。
- `-` 行 = dest (現在の実ファイル) にある内容 — apply で **削除される**
- `+` 行 = target (source.tmpl 展開後の期待状態) にある内容 — apply で **追加される**
- `chezmoi apply` は dest を target に合わせる方向（source → dest）

混乱したら `cat <source>` と `cat <dest>` を両方見て確定するのが早い。

`chezmoi status` の列は `[source][dest]`:
- `M` = modified, `A` = added, `D` = deleted, `?` = untracked (source には無い)
- `MM` → 両方変更あり（手動編集した dest を source に取り込む必要あり）
- ` M` → source は変わってないが dest だけ変更された（迷子変更）
- `DA` → source で削除扱いだが dest に存在（`node_modules/` 等のゴミ）

### ② dest（実体）を編集した → source に取り込む

```bash
chezmoi add ~/.zshrc                    # 新規ファイル追加
chezmoi re-add                          # managed な dest の変更を一括で source に反映
chezmoi re-add ~/.claude/CLAUDE.md      # 個別
```

### ③ source（リポジトリ側）を編集した → dest に反映

```bash
chezmoi diff                            # 先に見る
chezmoi apply                           # 全体
chezmoi apply ~/.claude/CLAUDE.md       # 個別
chezmoi apply --verbose                 # 何をやってるか表示
```

### ④ source をエディタで開く

```bash
chezmoi edit ~/.zshrc                   # source 側を開く (エディタ閉じた後に apply する？は -a フラグ)
chezmoi edit -a ~/.zshrc                # 編集後 apply も実行
chezmoi cd                              # source dir に cd
```

## 新マシン初期化

```bash
# chezmoi 本体: brew install chezmoi など

chezmoi init https://github.com/mizchi/chezmoi-dotfiles.git --apply
# ↑ clone + apply までやる。run_after_apm-install.sh が走って
#   apm install --global --target claude で外部スキルが入る

# pre-commit 有効化（新マシンで一度だけ）
cd $(chezmoi source-path)
prek install
```

## スキル追加フロー（自分向け定型）

1. `~/.claude/skills/<name>/` で開発・動作確認 (nix-setup のときは `nix build` まで通す)
2. `chezmoi add ~/.claude/skills/<name>` で source に反映
   - `+x` 属性のスクリプトは自動で `executable_` prefix が付く
3. `cd ~/.local/share/chezmoi && git status` で追加ファイルを確認
4. `git add dot_claude/skills/<name>/` + commit + `git push origin main`

### 既存スキルを編集した場合

`chezmoi add` でも `chezmoi re-add` でも上書きされる。普段は `re-add` の方が余計な差分が出にくい:

```bash
chezmoi re-add ~/.claude/skills/nix-setup/SKILL.md
```

## APM vs chezmoi の境界

`~/.claude/skills/` は **2 系統が混在**:

| 種別 | 入り方 | 管理場所 |
|---|---|---|
| APM-managed (外部 repo) | `apm install --global` が apply 後に取得 | `~/.local/share/chezmoi/dot_apm/apm.yml` |
| chezmoi-managed (自作) | `chezmoi add` で source にコピー | `~/.local/share/chezmoi/dot_claude/skills/<name>/` |

**現在 APM 経由で入っているもの** (`dot_apm/apm.yml` 抜粋):

- `moonbitlang/moonbit-agent-guide/*` (moonbit-agent-guide, moonbit-refactoring, moonbit-c-binding)
- `mizchi/moonbit-practice/skills/moonbit-practice`
- `mizchi/flaker/skills/flaker-setup`
- `ast-grep/agent-skill/ast-grep`
- `mizchi/tui.mbt/skills/tuimbt-practice`

**判断基準**:
- 外部公開・他リポジトリから使われる可能性あり → upstream repo に置いて APM 登録
- 自分環境でしか使わない運用メモ・実験中のスキル → chezmoi 管理

両方の場所に同じ名前のディレクトリがあると **APM 側が install 時に上書きする**可能性があるので名前衝突に注意。

**新規 skill を chezmoi に追加する前に APM との名前衝突を確認**:

```bash
# APM 側に同名がないか確認
grep "<skill-name>" ~/.local/share/chezmoi/dot_apm/apm.yml
# or
chezmoi cd && grep -r "<skill-name>" dot_apm/
```

## tmpl ファイル編集

`CLAUDE.md.tmpl` や `settings.json.tmpl` は Go template:

```bash
chezmoi edit ~/.claude/CLAUDE.md     # 実体ではなく source の .tmpl が開く
chezmoi execute-template < foo.tmpl  # 手動で展開結果を確認
chezmoi data                         # 展開で使えるデータを一覧（ホスト名、OS 等）
```

テンプレ変数の例: `{{ .chezmoi.os }}`, `{{ .chezmoi.hostname }}`

**注意**: `.tmpl` 管理ファイル (`CLAUDE.md.tmpl`, `settings.json.tmpl` 等) に対して `chezmoi re-add` を実行すると、展開後の dest 内容で source の `.tmpl` 構文を上書きしてしまう。`.tmpl` ファイルを更新したい場合は `chezmoi edit`（自動で `.tmpl` 側が開く）を使うか、`~/.local/share/chezmoi/dot_claude/CLAUDE.md.tmpl` を直接編集する。

**re-add 前の事前確認**: 対象ファイルが `.tmpl` 管理かを `chezmoi source-path` で必ず確認する:

```bash
chezmoi source-path ~/.claude/CLAUDE.md
# → /Users/mz/.local/share/chezmoi/dot_claude/CLAUDE.md.tmpl
# 末尾 .tmpl なら re-add せず手動編集。.tmpl でなければ re-add OK
```

### tmpl 変数のデフォルト値を変えたいとき

tmpl 自体をハードコードに書き換えるのではなく、`~/.config/chezmoi/chezmoi.toml` の `[data]` セクションに変数を置く:

```toml
[data]
  claude_default_mode = "auto"
  github_username = "mizchi"
```

`{{ .claude_default_mode | default "acceptEdits" }}` のような tmpl 構造はそのまま保ち、ホスト別に `[data]` で値だけ切り替える方が柔軟（マシン間で設定を変える余地を残せる）。

## pre-commit (prek + secretlint)

コミット前に `prek` 経由で `secretlint` が走り、API キー・トークンが含まれた差分は reject される。

**よくある誤検出**:
- 例示の sha256 / hex 文字列（長さが aws key / github token と似ていると引っかかることがある）
- `.envrc` のコメントに書いた見本値

対処:
```bash
# 本当に誤検出なら .secretlintrc.json でルールを除外
# 検出が正しいなら該当行を修正して git add ... && git commit
```

`.secretlintrc.json` の除外書式（抜粋）:

```json
{
  "rules": [
    {
      "id": "@secretlint/secretlint-rule-preset-recommend",
      "options": {
        "allows": [
          "/sha256-[a-f0-9]{64}/",
          "fake-token-for-example",
          "skill-examples/*"
        ]
      }
    }
  ]
}
```

`allows` は正規表現（`/.../` で囲む）か文字列一致。ファイル単位除外は `disabledRules` + `includes`/`excludes` で可能。

`--no-verify` は使わない（意味が無くなる）。

## トラブルシュート

### `chezmoi status` に `DA` が大量に出る (`node_modules/` 等)

`.chezmoiignore` に追記:
```
node_modules
**/.DS_Store
```

### source と dest が競合している

```bash
chezmoi merge ~/.zshrc          # 3-way merge (vimdiff 系)
chezmoi forget ~/.something     # source から削除（dest は残す）
chezmoi destroy ~/.something    # 両方削除（破壊的）
```

`chezmoi merge` のバックエンドは `~/.config/chezmoi/chezmoi.toml` の `[merge]` セクションで指定:

```toml
[merge]
  command = "nvim"
  args = ["-d", "{{ .Destination }}", "{{ .Source }}", "{{ .Target }}"]
```

未設定時は `git config merge.tool` を参照。どちらも未設定なら vimdiff にフォールバック。

### apply したら壊れた → 前のリビジョンに戻す

chezmoi 自身に undo は無い。source 側の git で戻す:
```bash
chezmoi cd
git log --oneline -5
git reset --hard <rev>
cd -
chezmoi apply
```

### どのファイルが managed か

```bash
chezmoi managed                 # 管理対象ファイルの一覧
chezmoi unmanaged ~/            # 未管理ファイル
chezmoi managed ~/.claude       # パス絞り込み
```

### apply が遅い

`run_after_apm-install.sh` の `apm install` が毎回走っている。スキル更新がないなら apply 実行時に環境変数でスキップ:
```bash
SKIP_APM=1 chezmoi apply    # スクリプト側が対応している場合のみ（未対応なら無視）
```

対応していなければ無視。

## 参考コマンド早見

```bash
chezmoi diff                    # 差分
chezmoi status                  # 状態
chezmoi apply [-v]              # 適用
chezmoi add <path>              # 新規取り込み
chezmoi re-add [<path>]         # 既存の取り込み直し
chezmoi edit [-a] <path>        # source を編集 (-a で直後に apply)
chezmoi merge <path>            # 競合の 3-way merge
chezmoi forget <path>           # source から外す
chezmoi managed [<path>]        # 管理対象一覧
chezmoi unmanaged <path>        # 未管理ファイル
chezmoi cd                      # source-path に cd
chezmoi source-path             # source ディレクトリ表示
chezmoi execute-template <     # テンプレ展開テスト
chezmoi data                    # テンプレで使える変数一覧
chezmoi doctor                  # セットアップ診断
```
