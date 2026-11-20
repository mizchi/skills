# モジュール間の設計原則を検査する

jev-lint 本体の開発版には、この5原則を配布する非ブロッキングの組み込みルール、入力生成コマンド、検出後の確認ヒントがある（`docs/advisories.md`）。このディレクトリでは旧実験のルール・閾値と記録を固定し、教師データの再生成に使う。

[5ルール](../rules/architecture.yml) は、同じ契約の実装、呼び出し側、Git 差分、依存経路を一組にした Text ブロックを判定する。候補ごとに固定コミット、元ファイル名、行番号またはパッチをたどれる。既存の8ルールと独立して計測できる。

| ルール | 入力生成器が集める根拠 | Jev に問うこと |
| --- | --- | --- |
| `liskov-substitution` | 文書化された TS interface、同じ型に対応する2実装、メソッドの呼び出し例 | 置換すると、許された入力で事前条件が強くなるか、結果・エラー・状態の保証が崩れるか |
| `interface-segregation` | 必須メンバー、空実装・例外を含む実装、その型の利用箇所 | 利用者が別の役割の操作を実装させられているか |
| `parnas-information-hiding` | import された配列・辞書・Set 等の定義と、別ファイルからその表現を使う行 | 内部表現を変えると、本来その決定から独立な利用側も変更する必要があるか |
| `common-closure` | 同じパッケージ対の実装を変えた複数コミットと、各コミットの両側のパッチ | 同じ方針を複数箇所で維持するために、異なる変更でも同期修正が繰り返されたか |
| `acyclic-dependencies` | パッケージ import の閉路、向き、種別、実際の import 行、解決できた定義と用途 | 責任を移すとどの辺を切れるか、コードに裏付けがあるか |

循環の有無はグラフ探索で確定する。実行時依存だけのグラフに型依存、テスト依存を順に加え、各辺が初めて閉路に入った時点で最短の戻り道を1本採る。同じ経路の回転をまとめる。Jev の低スコアでも、観測された閉路は inventory に残る。

## 実行

Node 24 と pnpm lockfile を使う。入力は Git オブジェクトから生成するため、作業ツリーの変更は採り込まない。出力先には新しいディレクトリまたはファイルを指定する。

```sh
pnpm install --frozen-lockfile
cd tools/refactor-audit
repo="$HOME/ghq/github.com/mizchi/vlmkit"
work="$(mktemp -d)"
just architecture-inputs "$repo" "$PWD/architecture/vlmkit.json" "$work/input"
just architecture-plan "$work/input"

# 保存済みの実回答で JSONL を再生成して照合する
just architecture-dataset "$work/input" "$PWD/architecture/vlmkit-run.json" "$work/teacher.jsonl.gz"
cmp architecture/vlmkit-teacher.jsonl.gz "$work/teacher.jsonl.gz"
just architecture-replay
just test
```

実際に再判定する場合は `. ~/.profile` と `export TYPESAFE_API_KEY` を実行し、`just architecture-check "$work/input" "$work/run.json"` を使う。校正は `just architecture-calibrate "$work/calibration.json"`。各入力のファイル名にはルール、候補 ID、リビジョン、本文の SHA-256 を反映させている。異なる根拠に古い回答を結び付けるとデータ生成は失敗する。

他のリポジトリには [vlmkit.json](vlmkit.json) を基に設定を作る。`repository` は出典、`revision` は40桁の SHA。`packages` は package.json があるディレクトリ（`*` は1階層）、`sourceDirs` は各パッケージ相対のソースディレクトリ、`historyDepth` は first-parent 上で調べる非マージコミット数。`paths` で TypeScript のローカル import 解決を補える。`cases` は任意で、配布ブリッジや異言語の実装のように型から結べない組を、同じリビジョンの `[ファイル, 開始行, 終了行]` で指定する。

`inventory.json` の `consumers` は interface ごとの宣言メンバーと利用ファイルごとの観測メソッド、`cycles` は循環経路、`insufficient` は判断に必要な役割や呼び出し例が欠けた候補を示す。入力1件に対応する候補 ID とファイルは `candidates` から引ける。

### 解析範囲

- 自動収集は TypeScript コンパイラが追える interface、型の付いたオブジェクトリテラル、明示的に implements するクラス、プロパティ経由の直接呼び出しが中心。LSP は各実装を先頭の実装と対にする。契約文書の有無は interface・メンバーの JSDoc で一次判定する。テストだけに書かれた契約は設定の `contract`・`example` で補える。
- 依存グラフは指定したソース範囲の ESM import、再 export、文字列リテラルの動的 import と import 型を扱う。計算したパス、CommonJS require、外部パッケージ内の依存は範囲外。未解決の相対パスから辺は作らない。
- 共通閉鎖ではテスト・非 JS/TS ファイルを除き、同時変更が2回以上ある全パッケージ対を列挙する。Jev に提示するのは直近3コミット、各側の先頭2ファイルの差分各1,700文字まで。省略を明示する。共起数や閉路数そのものは設計違反数を表さない。

## vlmkit での検証

現行スナップショット `468888c5` の745ソースファイル（テスト込み）、20コミットと、過去の配布ブリッジ1例を対象にした。jev-lint 0.8.0 / jev-1.14.0。根拠不足の6契約を除く88件で実回答を取得し、モデルが18件を候補として返した。実行記録の本判定費用は $0.01058。

| ルール | 閾値 | 判定数 | 指摘候補 |
| --- | ---: | ---: | ---: |
| リスコフの置換 | 0.52 | 48 | 8 |
| インターフェース分離 | 0.47 | 1 | 0 |
| パーナスの情報隠蔽 | 0.56 | 23 | 10 |
| 共通閉鎖 | 0.80 | 15 | 0 |
| 非循環依存 | 0.61 | 1 | 0 |

- 配布版の JSON コマンドで MoonBit のビルドにフォールバックしてしまう修正前のケースは **0.62**、ブリッジ全体を注入する現行版は **0.34**。根拠を固定して追加で3回測ると修正前は **0.59–0.64**、現行版は **0.36–0.39** だった。これは両リビジョンのソースを根拠にした判定で、配布物の実行テストはこの監査には含まれない。
- 情報隠蔽では、公開オプションにも同じ4フィールドが宣言された `DEFAULT_INSETS` を **0.82** で指摘した。公開データの形を内部都合と取り違えた例。調整用辞書をまとめたケースは **0.53** で見逃し、3回の再測定でも **0.54–0.60** と閾値をまたいだ。利用側の式と定義だけでは設計意図が十分伝わらないケースがある。
- 依存グラフにはルート CLI から MCP をロードする辺と、MCP のテストからルートへ戻る辺がある。実行時依存だけの閉路はこの範囲で0件。テストを含むこの閉路は inventory に1件残り、Jev の責任移動候補は0件だった。

[校正ケース](controls/case-coverage.json) は各ルールにつき陽性、紛らわしい陰性、関連のない変更を加えた陰性の3例。ルール別閾値を選んだ後の [校正記録](controls/calibration.json) は各3回すべて期待ラベルと一致した。これは校正に使用した15例での結果で、全体の適合率・再現率は未測定。実コードから選んだ [5件のレビューラベル](vlmkit-reviewed.json) と [追加3回の記録](vlmkit-reviewed-run.json) も保存した。

[全判定の記録](vlmkit-run.json) と [根拠付き教師データ](vlmkit-teacher.jsonl.gz) はオフラインで利用できる。教師ラベルは Jev によるもの。展開した JSONL の SHA-256 は `1250ca2fb2934173dd1a276a146024748d9fbf8c082d48153806e6021be92081`。収録した vlmkit ソースは [MIT](../vlmkit-data/LICENSE.vlmkit)。
