# ast-grep ルール YAML リファレンス

SKILL.md の補足。ルール YAML の各フィールド詳細、評価順序、edge ケースをまとめる。

## rule オペレータ

| オペレータ | 意味 |
|---|---|
| `pattern` | コード片とのマッチ（最も基本、メタ変数使用可） |
| `kind` | AST ノード種別で直接指定（`function_declaration` 等） |
| `regex` | 識別子名等に正規表現（単独より constraints / pattern 組合せで使うことが多い） |
| `all: [...]` | すべての子ルールにマッチ（AND） |
| `any: [...]` | いずれかの子ルールにマッチ（OR） |
| `not: {...}` | 子ルールにマッチしない |
| `has: {...}` | 子孫ノードに子ルールがマッチ |
| `inside: {...}` | 祖先ノードに子ルールがマッチ |
| `follows: {...}` | 兄弟として直前に現れる |
| `precedes: {...}` | 兄弟として直後に現れる |

`has` / `inside` / `follows` / `precedes` には `stopBy` で探索範囲を制御できる（`end` / `neighbor` / `{kind: X}`）。

## 評価順序と AND 評価

`rule` 直下に複数のオペレータを並べると **AND 評価** される:

```yaml
rule:
  pattern: Array.from(new Set($X)).length
  has:
    kind: new_expression
    pattern: new Set($X)
    stopBy: end
```

この 2 条件は両方真である必要がある。`all:` と等価。ただし pattern 単独で既に同条件を表現できる場合は has は冗長（構造条件を独立に明示したい意図があるなら残す）。

## メタ変数の束縛スコープ

**`pattern` と `has`/`inside` の両方に同じ `$X` を書いた場合、同一の部分木を指すよう束縛される**（`pattern: Array.from(new Set($X)).length` と `has.pattern: new Set($X)` の `$X` は共通）。異なる部分木を指したい場合は別名のメタ変数を使う（`$X` / `$Y`）。

## メタ変数の種類

- `$VAR` — 単一の AST ノード 1 つ
- `$$$VARS` — ゼロ個以上のノード（可変長引数 / 複数文）。**空マッチあり**（例: `new Set()` は `new Set($$$ARGS)` にマッチし `$$$ARGS` は空）
- `$_` — ワイルドカード（キャプチャせず、同名でも異なる内容にマッチ可）
- メタ変数はノード全体を占める必要がある: `obj.on$EVENT` や文字列内 `$NAME` は動かない

`$$$` が空にマッチすると fix テンプレート内の `$$$` も空に展開される。意図しない empty match を避けたい場合は `constraints` で個別変数の条件を付けるか pattern を絞る。

## constraints の挙動

メタ変数の中身に追加条件を付ける。**`$VAR`（単一）のみ対象**、`$$$VARS`（可変長）は不可。

```yaml
constraints:
  X:
    regex: '^[A-Z]'      # 正規表現
    kind: identifier     # AST kind
    pattern: someFunc    # パターン（別ルール相当）
```

### regex の複数行マッチ

`constraints.X.regex` は Rust の `regex` crate を使用。**デフォルトで `.` は改行にマッチしない**（`(?s)` フラグで変更可）。メタ変数の中身が複数行にまたがる（複数文、複数行の式）場合は `(?s).+` のように明示する。

### 「not 内の制約付きメタ変数」の注意

`not` 内に constraints を付けたメタ変数を置くと、期待と逆の挙動（制約が無視される等）になることがある。`not` は構造否定に留め、メタ変数条件は外側で付けるのが安全。

## fix の種類

### 文字列テンプレート（基本）

```yaml
fix: new Set($X).size
```

メタ変数をそのまま展開。マッチしなかったメタ変数（`$$$` の空等）は空文字。

### 空削除

```yaml
fix: ''
```

マッチノードを削除。空行が残る。

### FixConfig（範囲拡張）

```yaml
fix:
  template: ''
  expandEnd:
    regex: '[,;\n]'     # ノード末端から正規表現にマッチする範囲を追加で消す
```

末尾の `;` / `,` / 改行まで消したいときに使う。`expandStart` もある。`stopBy` で範囲を限定できる。

### 削除系 fix の判断フロー

1. 削除対象が単独文（`console.log(...);` の 1 行） → `fix: ''` + `expandEnd: {regex: '\n'}` で行ごと消す
2. 削除対象が式の一部（他の式と絡む、例: `foo(debug(), x)` の `debug()`） → fix を付けない（検出のみ、手動レビュー）
3. 削除でデバッグ意図等の情報が失われる → fix を付けない
4. フォーマッタ（Prettier 等）がコミット前に走る → `expandEnd` 不要、空行は自動整理される

## `any:` + fix の統合 / 分割

`any:` 配下の全分岐で **同一の fix テンプレ + 同一メタ変数** が使えるなら 1 ルールに統合して良い。分岐ごとに fix が異なる場合は必ずルールを分割する（`any:` 内で分岐ごとの fix は書けない）。

### transform による記号反転の裏技

`transform` を使えば `=== 0` / `!== 0` の差分を記号変換で吸収して 1 ルール化できる余地がある:

```yaml
rule:
  any:
    - pattern: $ARR.filter($P).length === 0
    - pattern: $ARR.filter($P).length !== 0
transform:
  BANG:
    replace:
      source: $ARR
      replace: '.*'
      by: ''   # 省略して分岐ごとに切替は素直にできない — 実際は分割推奨
```

実際には `any:` 分岐ごとに異なるメタ変数を束縛できないため、**素直に 2 ルール分割するのが推奨**（可読性・メンテ性も良い）。transform での統合は高度な使い方で、通常は不要。

## その他の fix 関連

- CLI `ast-grep run --pattern ... --rewrite ...` は YAML ルールなしのワンショット書き換え
- `ast-grep scan --update-all` は全 violation に fix を適用（ドライランは `--interactive`）
- fix は TDD でスナップショットに固定し、回帰検出する（`references/testing.md` 参照）

## url フィールド

```yaml
url: https://nodejs.org/api/deprecations.html#dep0005-buffer-constructor
```

ルール違反時に関連ドキュメントへ誘導。IDE / エディタ統合で活用されやすい。

## files / ignores

`files: ["src/**"]` で対象 glob 限定、`ignores:` で除外。両方指定時は files で絞った後 ignores で除外。テストコードで許容したいルール（例: `no-console-log`）は `files: ["src/**"]` で src に限定する。
