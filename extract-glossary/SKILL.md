---
name: extract-glossary
description: 指定されたリポジトリ、複数リポジトリ、または GitHub organization から、ドメイン固有の専門用語、業界用語、社内・プロダクト用語、リポジトリ実装マップ、技術構成、オンボーディング向け Mermaid 構成図を抽出・生成するときに使う。ユーザーが「用語集を作る」「ドメイン辞書を作る」「オンボーディング資料にする」「repo/org を見て専門用語をまとめる」「AI が再確認しなくてよい知識ベースを作る」と依頼したら起動する。
---

# extract-glossary

指定されたコードベースから、人間のオンボーディング資料兼 AI の再確認防止用ナレッジを作るためのスキル。
成果物は「用語辞書」「リポジトリ実装マップ」「技術構成」「小さな Mermaid 図」に分ける。

## 目的

- 新規参加者が、業界用語・組織内用語・実装固有名を短時間で読めるようにする。
- AI エージェントが同じ用語や構成を毎回聞き返さず、既存資料を参照して作業できるようにする。
- コードベースの説明を、推測ではなく README/docs/schema/IaC/code 上の根拠に結びつける。

## 入力として受け取るもの

以下のどれでもよい。

- ローカル checkout のパス: `../repo`, `~/ghq/github.com/org/repo`
- GitHub URL: `https://github.com/org/repo`
- 複数リポジトリのリスト
- GitHub organization 名と絞り込み条件
- 出力先: 既存 repo の docs、`.claude/skills/<domain>-glossary/`、任意の Markdown ファイル群

入力が曖昧な場合は、まず候補 repo と出力先を確認する。ただしローカルや GitHub から合理的に特定できる場合は探索を始める。

## 成果物の標準構成

スキルとして作る場合は以下を基本にする。

```text
<domain>-glossary/
├── SKILL.md
├── references/
│   ├── glossary.md
│   ├── repository-map.md
│   └── architecture.md
└── assets/
    └── architecture-diagrams.md
```

通常の docs として作る場合も、同じ分割を保つ。

| ファイル | 役割 |
| --- | --- |
| `glossary.md` | 用語辞書。業界用語、ドメイン用語、組織内略称、実装固有名を分ける。 |
| `repository-map.md` | repo ごとの責務、主要ディレクトリ、見るべき入口、外部依存をまとめる。 |
| `architecture.md` | 技術スタック、データフロー、インフラ、デプロイ、運用上の注意をまとめる。 |
| `architecture-diagrams.md` | Mermaid 図。巨大な一枚図ではなく、用途別の小さな図に分ける。 |
| `SKILL.md` | AI がどの reference をいつ読むべきかだけを書く。詳細を詰め込みすぎない。 |

## 調査手順

### 1. スコープを確定する

1. 対象 repo/org と対象 branch/commit を確認する。
2. local checkout がある場合は `git remote -v` と `git rev-parse HEAD` を確認する。
3. GitHub 上の repo を見る場合は default branch と URL を確認する。
4. 成果物には、機械固有のローカルパスではなく GitHub URL を載せる。

ローカルパスを使って調査してもよいが、最終成果物では以下のように変換する。

```text
/Users/me/ghq/github.com/org/repo/docs/foo.md
-> https://github.com/org/repo/blob/<branch-or-sha>/docs/foo.md
```

### 2. コーパスを作る

優先して読むもの:

- `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/`, `adr/`, `design/`, `architecture/`
- `openapi.yaml`, GraphQL schema, Protocol Buffers, SQL schema, migration, DB docs
- Terraform, Packer, CDK, SAM, Helm, Kubernetes, GitHub Actions, deploy docs
- package manifests: `package.json`, `go.mod`, `Cargo.toml`, `composer.json`, `pyproject.toml`, etc.
- entrypoints and routing: `main.*`, `routes.*`, controller/resolver/handler files

避けるもの:

- `node_modules`, `vendor`, generated code, build artifacts, minified files, lockfile details
- 大量ログや fixture を主情報源にすること
- 名前だけから断定すること

探索にはまず `rg --files` と `rg` を使う。

### 3. 用語候補を抽出する

用語は必ず分類する。

| 分類 | 例 | 判断基準 |
| --- | --- | --- |
| 業界用語 | RTB, SSP, VAST, OAuth, ETL | 社外でも通じる標準・業界語。 |
| ドメイン用語 | Publisher, Campaign, Order, Placement | 事業領域の概念。社外語でもプロダクト内の意味を持つ。 |
| 組織内用語 | 略称、旧称、チーム固有名 | README/docs/code に出るが外部標準ではない。 |
| 実装固有名 | service 名、directory 名、table prefix | コードベース内の構成要素。 |
| インフラ用語 | ECS, Snowflake, Meilisearch, Packer | 技術基盤として理解が必要な語。 |

各用語には以下を持たせる。

- 用語
- 意味
- 分類
- 主な実装・参照 repo
- 根拠 URL
- 注意点または混同しやすい語
- 確度: `confirmed` / `inferred` / `needs-check`

`inferred` は名前・配置からの推定。断定文にしない。

### 4. リポジトリ実装マップを作る

repo ごとに以下をまとめる。

- 何を実装しているか
- 主要 component / directory
- 技術スタック
- 入口になる README/docs/source files
- 他 repo との通信・データ依存
- DB/schema/API/protocol の境界
- 調査時に最初に見るべきファイル

複数 repo の関係は、まず粗い repo-level の対応表を作り、次に重要 repo だけ component-level に分解する。

### 5. 技術構成・インフラ構成をまとめる

最低限、以下の観点を分けて書く。

- runtime request flow
- config / master data flow
- batch / ETL / report flow
- auth / identity / user data flow
- DB / search / cache / object storage
- cloud resources and IaC ownership
- deploy / rollback / observability
- local development prerequisites

クラウド構成は「どのサービスを使っているか」と「どの repo が管理しているか」を分ける。

## Mermaid 図の作り方

巨大な一枚図にしない。1 図 1 トピックにする。

推奨する小図:

| 図 | 目的 |
| --- | --- |
| repository overview | repo 間の大まかな責務と依存だけを見る。 |
| config/data path | 管理画面や DB の設定が runtime に届く流れを見る。 |
| request sequence | 実リクエストの runtime 通信を見る。sequenceDiagram を優先する。 |
| integration entries | 外部 partner、webhook、protocol endpoint など入口別に見る。 |
| infra ownership | Terraform/CDK/SAM などが何を管理するかを見る。 |
| data pipeline | log/report/warehouse/search/indexing の流れを見る。 |

図の制約:

- 1 図あたり 10 ノード前後、15 edge 前後を目安にする。
- Mermaid の `subgraph` を深くしすぎない。重なりや長い交差線が出たら分割する。
- edge label は短くする。説明は本文に逃がす。
- protocol/schema の詳細図は、ユーザーが明示的に求めた場合だけ作る。
- 生成物、schema、runtime 通信を同じ図に混ぜない。
- レンダリング結果が読みにくいなら、図を増やして分割する。

## 出典・URL ルール

- 成果物にはローカル絶対パスや `../repo` を載せない。
- 参照元は GitHub URL、公式 docs URL、またはユーザーが指定した永続 URL にする。
- local checkout で調査した場合も、remote URL と branch/commit から GitHub URL に変換する。
- private repo で URL が読めない可能性がある場合でも、読者が権限を持てば辿れる URL を載せる。
- 不確かな場合は `needs-check` とし、根拠の弱さを明示する。

## 品質チェック

提出前に以下を確認する。

```bash
# ローカルパス漏れ
rg -n -F '../' <output-dir>
rg -n '/Users/|/home/' <output-dir>

# Markdown の基本チェック
git diff --check

# Mermaid block 数と fence 対応
rg -n '(^```mermaid|^```$|^flowchart|^sequenceDiagram)' <diagram-file>

# mmdc があればレンダリング確認
command -v mmdc && mmdc -i <diagram-file> -o /tmp/diagrams.svg
```

`mmdc` がない場合は、その旨を最終報告に書く。

## 回答時の注意

- 「現時点の repo 上では」と「推定」を分ける。
- 業界用語と組織内用語を混ぜない。
- 成果物の用途が onboarding なら、読む順番と調査入口を必ず入れる。
- AI 用 skill にする場合、`SKILL.md` は薄く保ち、詳細は `references/` に逃がす。
- ユーザーが commit/push/PR を求めた場合だけ git publish flow に進む。
