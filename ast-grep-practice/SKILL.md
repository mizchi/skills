---
name: ast-grep-practice
description: ast-grep をプロジェクト lint ツールとして運用するためのガイド。sgconfig.yml 設定、fix/rewrite ルール、constraints、transform、テスト、CI 統合、既存 linter との使い分けを扱う。汎用 linter で表現できないルールを ast-grep で書くときに使用。
---

# ast-grep Practice

汎用 lint ツール（ESLint, oxlint, Biome, clippy 等）で表現できないパターンを ast-grep で補完する。自然言語プロンプトより再現可能な静的ルールを常に優先する。

## インストール

```bash
# npm (プロジェクトローカル推奨)
npm install -D @ast-grep/cli
npx ast-grep --help

# または cargo
cargo install ast-grep --locked

# または brew
brew install ast-grep
```

**パッケージマネージャ選定**: プロジェクトの `package.json` に `packageManager` が設定されていればそれに従う（pnpm / yarn 等）。無ければ npm でローカル install する。CI も同じツールに揃える（混在させると lockfile / バイナリ参照経路が割れる）。グローバル install は dev マシンだけにし、CI と repo 内 script は必ずローカル参照にする。

## クイックスタート

最小構成で動作確認する:

```bash
mkdir -p rules rule-tests
cat > sgconfig.yml << 'EOF'
ruleDirs:
  - rules
testConfigs:
  - testDir: rule-tests
EOF

cat > rules/no-console-log.yml << 'EOF'
id: no-console-log
language: TypeScript
severity: warning
rule:
  pattern: console.log($$$ARGS)
message: console.log を残さない。
fix: ''
EOF

cat > rule-tests/no-console-log-test.yml << 'EOF'
id: no-console-log
valid:
  - logger.info('ok')
invalid:
  - console.log('debug')
  - "console.log('a', 'b')"
EOF

ast-grep test --skip-snapshot-tests  # テスト実行
ast-grep scan src/                    # プロジェクトスキャン
```

## 原則

- まず既存 linter でカバーできないか確認する
- ast-grep は「構造的パターン」が必要なときに使う
- ルールは TDD で開発する: テストファースト → ルール実装 → CI 統合
- `fix` を書けるなら書く。検出だけのルールより自動修正付きルールを優先する

## 既存 linter との使い分け

| ケース | ツール |
|--------|--------|
| unused import, no-console, naming convention | ESLint / oxlint / Biome |
| type error, unreachable code | TypeScript compiler / clippy |
| formatting | Prettier / Biome / rustfmt |
| 特定の関数呼び出しパターンの禁止 | ast-grep |
| deprecated API の検出と自動書き換え | ast-grep (fix) |
| 特定コンテキスト内での禁止パターン | ast-grep (inside/has) |
| プロジェクト固有の構造制約 | ast-grep |

ast-grep を使うべきサイン:
- 既存ルールの設定だけでは表現できない
- AST の親子・兄弟関係に依存する
- 自動書き換え（migration）が必要

## プロジェクト設定

### sgconfig.yml

```yaml
ruleDirs:            # 必須: ルールファイルの格納先
  - rules
testConfigs:         # 任意: テスト設定
  - testDir: rule-tests
utilDirs:            # 任意: 共有ユーティリティルール
  - rule-utils
languageGlobs:       # 任意: 非標準拡張子のマッピング (TS/JS/Python 等は不要)
  html: ['*.vue', '*.svelte', '*.astro']
```

### ディレクトリ構成

```
project/
  sgconfig.yml
  rules/
    no-direct-env-access.yml
    prefer-result-type.yml
  rule-tests/
    no-direct-env-access-test.yml
    prefer-result-type-test.yml
    __snapshots__/
  rule-utils/
    is-async-function.yml
```

`ast-grep scan` は `sgconfig.yml` のある場所から `ruleDirs` 内の全ルールを実行する。

## ルールファイル構造

```yaml
id: no-direct-env-access
language: TypeScript
severity: warning
rule:
  pattern: process.env.$KEY
  not:
    inside:
      kind: function_declaration
      has:
        pattern: getEnv
      stopBy: end
message: process.env を直接参照しない。getEnv() を経由する。
note: 環境変数の型安全なアクセスを保証するため。
fix: getEnv('$KEY')
files:
  - "src/**"
ignores:
  - "src/config.ts"
```

### フィールド

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `id` | Yes | ルール識別子 |
| `language` | Yes | 対象言語 |
| `rule` | Yes | マッチ条件 |
| `severity` | No | `hint`, `warning`, `error` |
| `message` | No | 1 行の説明 |
| `note` | No | 詳細説明・修正ガイド |
| `fix` | No | 自動修正テンプレート |
| `constraints` | No | メタ変数の追加制約 |
| `transform` | No | メタ変数のテキスト変換 |
| `files` | No | 対象 glob |
| `ignores` | No | 除外 glob |
| `url` | No | ドキュメント URL |

### 抑制コメント

```typescript
// ast-grep-ignore
someCode()

// ast-grep-ignore: no-direct-env-access
process.env.NODE_ENV
```

## メタ変数の注意点

パターンマッチの落とし穴:

- `$OBJ.$PROP` は **ドットアクセスのみ** マッチする。`obj['key']`（ブラケットアクセス）にはマッチしない
- `$VAR` は単一の AST ノード 1 つにマッチ
- `$$$VARS` はゼロ個以上の AST ノードにマッチ（可変長引数、複数文、等）
- `$_` はワイルドカード（キャプチャしない）。同名でも異なる内容にマッチ可能
- メタ変数はノード全体を占める必要がある: `obj.on$EVENT` や `"hello $NAME"` は動かない

## fix (自動修正)

### fix を付けるかどうかの判断

`fix` は便利だが、付けると自動適用されるので意味論を変える危険がある。次の場合は **付けない**（検出のみにする）:

- 書き換えで型安全性が変わる（例: `as any` → `as unknown` は型推論結果が変わる）
- 副作用や評価順序が変わる可能性（短絡評価の有無、例外発生タイミング）
- 文脈依存で正しい置換が一意に決まらない（API 移行の引数順入れ替え等、レビューが必須）
- 削除系で、削除対象が同一文の他の式と絡んでいる

迷ったら fix なしで note に「手動移行手順」を書く。fix を付けるのは「全置換しても安全」と確信できる場合に限る。

### 基本

```yaml
rule:
  pattern: console.log($ARG)
fix: logger.info($ARG)
```

メタ変数はそのまま `fix` テンプレート内で使える。マッチしなかったメタ変数は空文字になる。

### 削除

```yaml
rule:
  pattern: console.log($$$ARGS)
fix: ''
```

`fix: ''` でマッチしたノードを削除する。ただし空行が残ることがある。**ステートメント終端 `;` や末尾カンマも一緒に消したい場合は必ず `expandEnd` を併用する**（後述「範囲拡張」）。空行が残るのが許容範囲なら expandEnd 不要。判断基準: 削除後にフォーマッタ（Prettier 等）が走るプロジェクトなら空行は自動整理されるので expandEnd 不要、走らないなら expandEnd 推奨。

### `any:` で複数パターンを束ねるときの fix

`any:` 配下の各分岐で **同一の fix テンプレート** が使えるなら 1 ルールに統合して良い:

```yaml
rule:
  any:
    - pattern: $ARR.filter($P).length === 0
    - pattern: $ARR.filter($P).length == 0
fix: '!$ARR.some($P)'   # 両分岐で共通のメタ変数 + 同一テンプレート
```

**分岐ごとに fix が異なる場合は必ずルールを分割する**（`any:` 内で分岐ごとの fix は書けない）。例: `=== 0` → `!some()`、`!== 0` → `some()` は別ルールにする。同じ目的でもルール分割は許容される（id を `*-empty` / `*-nonempty` などで揃えると見通しが良い）。

### 複数行

```yaml
rule:
  pattern: |
    def foo($X):
      $$$S
fix: |-
  def bar($X):
    $$$S
```

インデントは元コードの位置に合わせて保持される。

### 範囲拡張 (FixConfig)

末尾のカンマなどを含めて削除したい場合:

```yaml
fix:
  template: ''
  expandEnd:
    regex: ','
```

### CLI での簡易書き換え

```bash
ast-grep run --pattern 'oldFunc($$$ARGS)' --rewrite 'newFunc($$$ARGS)' --lang typescript .
# --update-all で確認なしに一括適用
```

## constraints

メタ変数に追加条件を付ける。`$ARG` のみ対象（`$$$ARGS` は不可）。ルールマッチ後にフィルタされる。

**constraints と構造制約 (has/inside/not) の使い分け**:
- **メタ変数の中身** に条件を付けたい → `constraints`（例: `$METHOD` が `get` / `set` / `delete` のいずれか）
- **パターンの外側・内側の構造** に条件を付けたい → `has` / `inside` / `not` / `precedes` / `follows`（例: 特定の親要素の内側、特定の子要素を持つ）
- パターン自体に具体的リテラルを書ける場合はそれが最もシンプル（`pattern: new Set($X)` で Set 存在を担保）

`rule` の直下に `pattern` と `has` / `not` を併記すると **AND 評価** される（pattern にマッチ かつ has が真）。`pattern` 単独で表現しきれない構造制約はこの形で付け足す。

```yaml
rule:
  pattern: $OBJ.$METHOD($$$ARGS)
constraints:
  METHOD:
    regex: '^(get|set|delete)$'
  OBJ:
    kind: identifier
```

使えるフィールド: `kind`, `regex`, `pattern`

注意: `not` 内の制約付きメタ変数は期待通り動作しないことがある。

## transform

マッチしたメタ変数をテキスト変換してから `fix` で使う。

### replace (正規表現置換)

```yaml
transform:
  NEW_NAME:
    replace:
      source: $NAME
      replace: 'get(\w+)'
      by: 'fetch$1'
fix: $NEW_NAME($$$ARGS)
```

### substring (部分文字列)

```yaml
transform:
  INNER:
    substring:
      source: $STR
      startChar: 1
      endChar: -1
```

負のインデックスは末尾から。Python のスライスと同じ。

### convert (ケース変換)

```yaml
transform:
  SNAKE:
    convert:
      source: $NAME
      toCase: snakeCase
      separatedBy: [caseChange]
```

対応ケース: `camelCase`, `snakeCase`, `kebabCase`, `pascalCase`, `upperCase`, `lowerCase`, `capitalize`

### rewrite (実験的)

メタ変数内のノードを rewriter ルールで再帰的に書き換える。

```yaml
transform:
  REWRITTEN:
    rewrite:
      source: $$$BODY
      rewriters: [migrate-api-call]
      joinBy: "\n"
```

## utils (ユーティリティルール)

`utilDirs` に定義した共通ルールを `matches` で参照する。

```yaml
# rule-utils/is-async-function.yml
id: is-async-function
language: TypeScript
rule:
  any:
    - kind: function_declaration
      has:
        field: async
        regex: async
    - kind: arrow_function
      has:
        field: async
        regex: async
```

```yaml
# rules/async-no-try-catch.yml
id: async-no-try-catch
language: TypeScript
rule:
  all:
    - matches: is-async-function
    - has:
        pattern: await $EXPR
        stopBy: end
    - not:
        has:
          kind: try_statement
          stopBy: end
message: async 関数に try-catch がない。
severity: warning
```

## テスト

テストには 2 系統ある。混同しない:
- **分類テスト** (`test --skip-snapshot-tests`): `valid` / `invalid` に並べたコードが正しく分類されるかだけを確認。CI で回すのはこちら。
- **スナップショットテスト** (`test` / `test -U`): invalid コードへのマッチ位置や fix 適用結果を snapshot として固定し、回帰を検出。初回は `-U` で生成、以降は人間レビュー。CI 前に一度通す。

### テストファイル形式

テストファイル内の `id` がルールファイルの `id` と一致している必要がある。ファイル名は自由（慣例は `{rule-id}-test.yml`）。

```yaml
# rule-tests/no-direct-env-access-test.yml
id: no-direct-env-access
valid:
  - getEnv('NODE_ENV')
  - "function setup() { return getEnv('PORT') }"
invalid:
  - process.env.NODE_ENV
  - process.env.PORT
```

### テスト実行

```bash
# 分類テスト (valid/invalid が正しいか)
ast-grep test --skip-snapshot-tests

# スナップショット生成・更新
ast-grep test -U

# スナップショット対話的レビュー
ast-grep test --interactive
```

テスト結果:
- `.` : パス
- `N` : ノイジー (false positive — valid コードにマッチ)
- `M` : ミッシング (false negative — invalid コードにマッチしない)

### ワークフロー

1. `rule-tests/` にテストファイルを書く (Red)
2. `rules/` にルールを書く (Green)
3. `ast-grep test --skip-snapshot-tests` で確認
4. `ast-grep test -U` でスナップショット生成
5. スナップショットをレビューして commit

## CI 統合

### justfile

```just
ast-grep-test:
  ast-grep test

ast-grep-lint:
  ast-grep scan

check: format-check typecheck ast-grep-lint test
```

### GitHub Actions

dev 環境とツールを揃える（プロジェクトで pnpm を使うなら CI も pnpm、npm なら npm）:

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 24, cache: npm }   # pnpm プロジェクトなら pnpm/action-setup@v4 + cache: pnpm

- run: npm ci   # pnpm なら pnpm install --frozen-lockfile

- name: ast-grep rule tests
  run: npx ast-grep test --skip-snapshot-tests

- name: ast-grep scan
  run: npx ast-grep scan --error
```

**severity と終了コード**:
- `ast-grep scan` はデフォルトで `error` severity が 1 件でもあれば非ゼロ終了
- `--error` を付けると `warning` / `hint` でも非ゼロ終了させられる（CI で warning も落としたい場合）
- `--error=error` のように severity を指定して段階的に厳しくすることも可能
- `--format json` で構造化出力（別ツール連携用）

## kind 名の調べ方

kind 名は言語の Tree-sitter grammar に依存する。

```bash
# AST ダンプ（名前付きノードのみ、ルール記述に使う）
ast-grep run --pattern 'YOUR_CODE' --lang typescript --debug-query=ast

# CST ダンプ（全ノード、anonymous トークン含む）
ast-grep run --pattern 'YOUR_CODE' --lang typescript --debug-query=cst
```

言語別の頻出 kind カタログは [references/kind-catalog.md](references/kind-catalog.md) 参照（TypeScript / Rust / Go / Python を網羅）。

## 実践的なルール例

### TypeScript: `as any` キャストの禁止（検出のみ、fix 無し）

```yaml
id: no-as-any
language: TypeScript
severity: error
rule:
  pattern: $EXPR as any
message: as any は型システムを無効化する。as unknown 経由か型ガードを使う。
note: |
  自動 fix を付けない理由: `as any` → `as unknown` への機械置換は型推論結果が
  変わるため、呼び出し側で新たなコンパイルエラーを生む。検出のみにして手動移行。
```

`as any` のように「型アサーション」にマッチさせる場合、`$EXPR as any` が `as_expression` ノードとして動く。`$EXPR` がマッチするのは左辺全体なので、`JSON.parse(raw) as any` にも `(value as any)` にもマッチする。

### TypeScript: deprecated API の書き換え

```yaml
id: migrate-old-api
language: TypeScript
severity: error
rule:
  pattern: oldClient.fetch($URL, $OPTS)
fix: newClient.request($URL, $OPTS)
message: oldClient.fetch は廃止。newClient.request に移行する。
```

### 特定 import の禁止

```yaml
id: no-lodash-import
language: TypeScript
severity: warning
rule:
  pattern: import $_ from 'lodash'
message: lodash の全体 import を禁止。lodash/xxx を使う。
fix: import $_ from 'lodash/xxx' // TODO: 正しいパスに修正
```

### TypeScript: React コンポーネント内の直接 fetch 禁止

```yaml
id: no-fetch-in-component
language: TypeScript
severity: warning
rule:
  pattern: fetch($$$ARGS)
  inside:
    any:
      - kind: function_declaration
        has:
          field: return_type
          pattern: JSX.Element
      - kind: arrow_function
        inside:
          kind: variable_declarator
          regex: '^[A-Z]'
    stopBy: end
message: コンポーネント内で直接 fetch しない。hooks か server action を使う。
```

### Rust: unwrap() の禁止

```yaml
id: no-unwrap
language: Rust
severity: warning
rule:
  pattern: $EXPR.unwrap()
  not:
    inside:
      kind: function_item
      regex: '#\[test\]'
      stopBy: end
message: テスト以外で unwrap() を使わない。? か expect() を使う。
note: unwrap() は panic するため、本番コードでは避ける。
```

### Rust: unsafe ブロックの検出

```yaml
id: flag-unsafe-block
language: Rust
severity: warning
rule:
  kind: unsafe_block
message: unsafe ブロック。安全性の根拠をコメントで示す。
```

### Rust: println! を log マクロに移行

```yaml
id: no-println-in-lib
language: Rust
severity: warning
rule:
  pattern: println!($$$ARGS)
  not:
    inside:
      kind: function_item
      regex: 'fn main'
      stopBy: end
message: ライブラリコードで println! を使わない。log::info! 等を使う。
fix: log::info!($$$ARGS)
files:
  - "src/lib.rs"
  - "src/**/mod.rs"
  - "src/**/*.rs"
ignores:
  - "src/main.rs"
  - "src/bin/**"
```

### Go: エラー無視の検出

```yaml
id: no-ignored-error
language: Go
severity: error
rule:
  kind: short_var_declaration
  has:
    kind: identifier
    regex: '^_$'
    field: left
  has:
    kind: call_expression
    field: right
    stopBy: end
message: エラーを _ で無視しない。適切にハンドリングする。
```

### Go: defer で Close する忘れ防止

```yaml
id: defer-close-after-open
language: Go
severity: warning
rule:
  kind: short_var_declaration
  has:
    pattern: os.Open($PATH)
    field: right
    stopBy: end
  not:
    precedes:
      pattern: defer $_.Close()
      stopBy:
        kind: return_statement
message: os.Open の直後に defer Close() を入れる。
```

### Python: bare except の禁止

```yaml
id: no-bare-except
language: Python
severity: warning
rule:
  kind: except_clause
  not:
    has:
      kind: identifier
      stopBy: neighbor
message: bare except を使わない。具体的な例外型を指定する。
```

### Python: print() をロガーに移行

```yaml
id: no-print-in-src
language: Python
severity: warning
rule:
  pattern: print($$$ARGS)
  not:
    inside:
      kind: function_definition
      regex: 'def main'
      stopBy: end
message: print() ではなく logger を使う。
fix: logger.info($$$ARGS)
files:
  - "src/**"
```

## References

### 本 skill 内の詳細

- [references/rule-yaml.md](references/rule-yaml.md) — ルール YAML 全フィールド・評価順序・メタ変数束縛スコープ・`any:` + fix の統合/分割・`$$$ARGS` 空マッチ等
- [references/testing.md](references/testing.md) — 分類テスト vs スナップショット、複数行コード記法、snapshot 運用
- [references/cli.md](references/cli.md) — サブコマンド・フラグ全般、`--error` / exit code / `--format json`
- [references/kind-catalog.md](references/kind-catalog.md) — 言語別 kind カタログ（TypeScript / Rust / Go / Python）

### 公式

- ast-grep docs: https://ast-grep.github.io/
- Rule reference: https://ast-grep.github.io/reference/yaml.html
- sgconfig: https://ast-grep.github.io/reference/sgconfig.html
- Playground: https://ast-grep.github.io/playground.html
- Rule catalog: https://ast-grep.github.io/catalog/
