# APM Skill を公開する（作者向け）

自作 skill を GitHub repo として公開し、他者が `apm install` で取得できるようにする手順。

## Repo 構成

### 単一 skill 配布

```
my-awesome-skill/
├── skills/
│   └── my-awesome-skill/
│       ├── SKILL.md              # 必須
│       ├── references/           # 任意
│       ├── scripts/              # 任意
│       └── assets/               # 任意
├── README.md
├── CHANGELOG.md
└── LICENSE
```

利用者のインストールコマンド: `apm install mizchi/my-awesome-skill/skills/my-awesome-skill`

### 複数 skill（monorepo）

```
my-skill-pack/
├── skills/
│   ├── skill-a/SKILL.md
│   └── skill-b/SKILL.md
├── README.md
└── LICENSE
```

利用者は `apm install mizchi/my-skill-pack/skills/skill-a` のようにパス指定。

## SKILL.md 必須 frontmatter

```yaml
---
name: my-awesome-skill      # lowercase + hyphen, 1-64 chars, ディレクトリ名と一致
description: Use when <状況>. <1-1024 chars, 未来の利用者が「今使うべきか」判断できる文>
license: MIT                # 任意、SPDX identifier
---
```

APM には `apm-skill.yml` のような別 manifest は **無い**。SKILL.md frontmatter が唯一の契約。

### `description` の書き方

- 利用者の Claude が「この skill を読むべきか」を決める唯一の材料
- "Use when..." で始めると triggering condition が明確になる
- 抽象すぎず具体すぎず（agentskills.io/specification の `description` フィールド仕様参照）

## バージョン管理

semver + git tag で publish する:

```bash
# 初回リリース
git tag v1.0.0
git push origin v1.0.0

# GitHub Release を作ると発見性が上がる（必須ではない）
gh release create v1.0.0 --notes-file CHANGELOG.md
```

利用者は `#v1.0.0` で pin できる:

```yaml
dependencies:
  apm:
    - mizchi/my-awesome-skill/skills/my-awesome-skill#v1.0.0
```

ピンなし (`#main` / なし) だと install 時に HEAD を取る → breaking change で壊れやすい。公開 skill は tag を切る運用推奨。

## 依存 skill の宣言

skill が他 skill に依存する場合、repo root に `apm.yml` を置く:

```yaml
# my-awesome-skill/apm.yml
name: my-awesome-skill
version: 1.0.0
dependencies:
  apm:
    - owner/base-skill/skills/base#v2.0.0
```

これは skill が install されるときに一緒に解決される想定（APM 実装依存）。確実に動作させたいなら、README に「この skill は base-skill を要求する」と明記し、利用者側 `apm.yml` にも列挙してもらうのが堅い。

## README / CHANGELOG

APM 仕様上は必須ではない。ただし慣習:

**README.md:**
- 用途（description の補足）
- インストールコマンドの具体例
- 最低動作環境（Claude Code / Codex 等、target 指定）
- よくある質問

**CHANGELOG.md:**
- [Keep a Changelog](https://keepachangelog.com/) + semver
- version ごとに Added / Changed / Fixed / Removed / Deprecated

## 公開前の検証

```bash
# 依存解決が壊れていないか
apm install --dry-run owner/repo/skills/skill-name

# supply chain 確認
apm audit

# 依存ツリー
apm deps tree

# 実際に install してみる（sandbox repo を作って検証）
cd /tmp && mkdir apm-test && cd apm-test
cat > apm.yml <<EOF
name: test
version: 1.0.0
dependencies:
  apm:
    - mizchi/my-awesome-skill/skills/my-awesome-skill#HEAD
EOF
apm install
ls -1 .claude/skills/
```

## 名前の衝突を避ける

APM では `skill name` はディレクトリ名と一致し、install 時にそれが target の `skills/<name>/` に展開される。他の skill と名前衝突すると install 時に後勝ちで上書きされる。

- 汎用名（`test`, `utils`, `helper`）は避ける
- scope prefix を付ける（`mizchi-empirical-tuning` 等）か、リッチな説明的名前にする
- 既存の有名 skill 名（`moonbit-practice`, `ast-grep` 等）を避ける

## 公開チェックリスト

- [ ] `SKILL.md` frontmatter の `name` / `description` / `license`
- [ ] `name` が lowercase + hyphen、連続ハイフンなし、ディレクトリ名と一致
- [ ] description に "Use when..." が含まれ、triggering condition が明確
- [ ] README に用途とインストールコマンド
- [ ] CHANGELOG に初回 entry
- [ ] LICENSE ファイル
- [ ] git tag `v0.1.0` or `v1.0.0` を切る
- [ ] `apm install --dry-run` で取得が通る
- [ ] `apm audit` で警告なし
