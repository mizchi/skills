# ast-grep CLI リファレンス

SKILL.md の補足。コマンド・フラグ詳細・終了コード・出力形式。

## サブコマンド一覧

| コマンド | 用途 |
|---|---|
| `ast-grep scan` | プロジェクト全体に登録ルールを適用（CI 用） |
| `ast-grep test` | rule-tests/ を実行（分類 + スナップショット） |
| `ast-grep run` | YAML なしのワンショット pattern 検索・rewrite |
| `ast-grep new` | 新規ルール / テストの雛形生成 |
| `ast-grep lsp` | Language Server として起動（エディタ統合） |
| `ast-grep completions` | shell 補完スクリプト出力 |

## scan の主要フラグ

```bash
ast-grep scan [PATH...]
```

| フラグ | 意味 |
|---|---|
| `--rule <FILE>` | 単一ルールファイル指定（sgconfig 不要） |
| `--config <FILE>` | sgconfig.yml のパス指定 |
| `--filter <REGEX>` | ルール id を正規表現で絞り込み |
| `--inline-rules <YAML>` | コマンドライン上で YAML 直書き |
| `--update-all` | 全 violation に fix を適用（破壊的） |
| `--interactive` | 対話的に 1 件ずつ承認 |
| `--format json` | JSON 出力（CI 連携用） |
| `--report-style <pretty\|rich\|short>` | コンソール出力形式 |
| `--error <severity>` | 指定 severity 以上で非ゼロ終了。`--error` 単独なら hint も含む |

### `--error` の挙動

| 指定 | 意味 |
|---|---|
| なし（デフォルト） | `error` severity が 1 件でもあれば非ゼロ終了 |
| `--error` | `hint` / `warning` / `error` 全部で非ゼロ終了 |
| `--error=warning` | `warning` 以上で非ゼロ終了 |
| `--error=error` | `error` のみで非ゼロ終了（デフォルトと同じ） |

CI で `warning` も落としたい場合は `--error` を付ける。段階導入したい場合はデフォルトで開始 → 段階的に厳しくする。

### exit code

- `0` — 違反なし、または閾値以下の違反のみ
- `1` — 検出された violation が `--error` 閾値を超えた
- それ以外 — 設定エラー / 構文エラー（exit 4 等）

## test の主要フラグ

```bash
ast-grep test
```

| フラグ | 意味 |
|---|---|
| `--skip-snapshot-tests` | 分類テストのみ実行（スナップショット差分は無視）。CI 用 |
| `-U` / `--update-all` | スナップショットを生成・更新 |
| `--interactive` | スナップショット差分を 1 件ずつ承認 |
| `--filter <REGEX>` | テスト id 絞り込み |
| `--config <FILE>` | sgconfig.yml 指定 |

## run（ワンショット書き換え）

```bash
ast-grep run \
  --pattern 'oldFunc($$$ARGS)' \
  --rewrite 'newFunc($$$ARGS)' \
  --lang typescript \
  src/
```

| フラグ | 意味 |
|---|---|
| `--pattern <CODE>` | 検索パターン |
| `--rewrite <CODE>` | 書き換え後テンプレート |
| `--lang <LANG>` | 対象言語（typescript / rust / go / python 等） |
| `--update-all` | 確認なしで一括適用 |
| `--interactive` | 1 件ずつ確認 |
| `--debug-query <ast\|cst>` | パターンの AST / CST をダンプ（kind 名調査に必須） |

### kind 名の調べ方

```bash
# AST 表示（名前付きノード）
ast-grep run --pattern 'YOUR_CODE' --lang typescript --debug-query=ast

# CST 表示（全ノード、anonymous 含む）
ast-grep run --pattern 'YOUR_CODE' --lang typescript --debug-query=cst
```

複雑なパターンを書く前に必ず実行して構造を確認。

## --format json の出力構造

```json
[
  {
    "text": "console.log('debug')",
    "range": {
      "byteOffset": {"start": 100, "end": 120},
      "start": {"line": 5, "column": 2},
      "end": {"line": 5, "column": 22}
    },
    "file": "src/users.ts",
    "ruleId": "no-console-log",
    "severity": "warning",
    "message": "production コードに console.log を残さない。",
    "note": "...",
    "labels": [...]
  },
  ...
]
```

PR コメント生成、SARIF 変換、独自レポート作成等で使用。

## sgconfig.yml と --config

複数の sgconfig を使い分ける場合や、リポジトリ外から実行する場合は `--config <PATH>` で明示指定。デフォルトはカレントから親方向に `sgconfig.yml` を探索。

## CI 統合の注意点

- `npx ast-grep` か `pnpm exec ast-grep` 等、プロジェクトと同じパッケージマネージャ経由で呼ぶ
- グローバル install を CI で使うとバージョン揺れの原因
- `--format json` で JSON を保存し、別ステップで GitHub PR コメントに整形する手もある
- snapshot test は CI で skip し、開発者責務にする（`references/testing.md` 参照）
