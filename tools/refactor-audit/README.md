# refactor-audit

TypeScript ライブラリの公開 API とモジュール状態を棚卸しし、設計の見直し候補を jev-lint で調べる。入口は公開サブパスを宣言するマニフェスト。出力の `inventory.json` から公開名、定義ファイル、行番号、状態への書き込みをたどれる。

## 実行

リポジトリのルートで `pnpm install --frozen-lockfile` を実行する。Node.js 24 以上と just を使う。以下は Hono のローカル checkout を調べる例。

```sh
cd tools/refactor-audit
repo="$HOME/ghq/github.com/honojs/hono"
work="$(mktemp -d)"
just inventory "$repo/jsr.json" "$work/hono"
just plan "$work/hono"
just history-plan "$repo" 'HEAD~20..HEAD'
just test
```

`inventory` の出力先には新しいディレクトリを指定する。入力の `exports` はソースファイルを表す文字列、またはサブパスからソースファイルへの明示的な対応表。対象は `.ts`、`.tsx`、`.mts`、`.cts`。ビルド成果物への条件付き export やワイルドカードを持つパッケージは、対象パッケージ直下に同じ形式の対応表を用意し、そのパスを渡す。

```json
{"exports": {".": "./src/index.ts", "./parser": "./src/parser.ts"}}
```

## 指標の読み方

- `entries[].symbols` は各サブパスから import できるトップレベルの名前。型も含む。同じ定義が二つのサブパスで公開されていれば、利用者が依存できる経路は2件になる。クラスのメソッド数はこの件数に含まれない。
- `modules[].moduleExports` はファイル単位の export 数。`publicBindings` は、そのモジュールの定義が外部に届く経路。TypeScript の型チェッカーで別名、デフォルト、スター、名前空間の再公開を解決する。対象はエントリから到達するパッケージ内の実装ファイル。
- `hiddenState` はトップレベルの非公開名のうち、再代入可能な変数、および配列・オブジェクト・既知のコンテナを初期値に持つ変数。`writeLines` は同じシンボルへの代入・増減・プロパティ更新・既知の変更メソッド呼び出しの行。固定テーブルも候補に含む。別名を経由した変更、別ファイルでの変更、クロージャやクラスの状態は追跡範囲外。
- `internalTypeReferences` は公開 interface・型エイリアスが直接参照した `@internal` 型。内部型を直接 import できなくても、コールバックの引数を通じてその構造が利用者に伝わる。
- `issues` は未解決の静的 import・再公開などの調査事項。構文解析とシンボル解決を行い、完全な型検査は別途プロジェクトのビルドで行う。JSON の型定義は [audit.d.mts](audit.d.mts) にある。

## 8つのレビュー観点

| 観点 | 判定に使う兆候 |
| --- | --- |
| 単一責任 | 同居する二つの方針について、変更理由と利用者を別々に説明できる |
| 最小権限 | 公開コールバックが、契約上必要な操作を超える変更権限を受け取る |
| 驚き最小 | 名前や仕様が約束する効果に実装が反する。例えば peek で要素を消費する |
| ハイラム | 公開経路から内部の制御や表現を観測・操作できる |
| パーキンソン | 同じライフサイクルの表現・処理を二重に維持している。組織の人員配分は測定対象外 |
| カーニハン | 原因の消失や順序依存で障害経路の再構成が難しく、提示されたコメント・テストから理由を読み取れない |
| グッドハート | 差分で、固定された代理指標を改善するために利用者の結果を悪化させた |
| キャンベル | 差分で、従来と同じ指標名や合格基準を保ちつつ、不利な観測値を集計から外した |

公開 API の3ルールは公開定義を含むモジュールに、単一責任・パーキンソン・カーニハンは全対象モジュールに適用する。各質問には公開経路、モジュールのソース、同名で同居するテストの冒頭最大2,400文字を渡す。jev-lint の Text ブロック上限は48,000文字。テストの不在や抜粋外のコードだけを根拠に判定しない。履歴の2ルールはコミットメッセージと差分を使う。

## MoonBit ワークスペースでの実行

`just moon-inventory <checkout> <新しい出力先>` は `moon.work` の明示的なメンバーを対象に、追跡中の `moon.pkg` から通常の import を集計し、チェックイン済みの `pkg.generated.mbti` からパッケージの公開宣言数を取得する。続いて `just plan <出力先>` でファイル単位の6ルール、`just history-plan <checkout> <範囲>` で履歴の2ルールを計画できる。非公開の明示的なトップレベル Ref、実装行、依存元・依存先の定義と実例は [crater の測定結果](crater-report.md) にある。

## Hono での計測

Hono 4.11.7 のコミット `f7d272ab` の JSR 公開面を対象にした。97エントリ、公開名591件、到達可能な175モジュール、22,938行。公開定義を持つモジュールは130個だった。Node.js 組み込みモジュールの型情報への import 5箇所がこの checkout では未解決だった。

- `./bun` の公開型 `BunWebSocketHandler` は、`open`・`close`・`message` の各引数で `@internal BunServerWebSocket` を参照している。参照3件が同じ内部型に集まる。引数のどの操作を公開契約として維持するかがレビューの論点になる。
- 隠れた状態の候補50件のうち、29件に同一モジュール内の書き込み箇所がある。`src/jsx/dom/render.ts` では9候補中7件に書き込みがあり、残り2件はイベント名と名前空間の対応表だった。
- 新しい Node プロセスで各工程を3回実行した。中央値は棚卸し425 ms、モジュールの判定計画123 ms、直近20コミットの判定計画775 ms。モジュール915件と履歴40件は判定対象の件数。jev-lint の見積もりは合計196リクエスト、約0.082米ドル。

各回の値と解決できなかった import は [計測記録](hono-benchmark.json) にある。同じコミットで `just benchmark "$repo/jsr.json" 'HEAD~20..HEAD'` を実行すると再計測できる。

## 判定と校正

Hono の計測は dry-run。crater では [教師データ v1](crater-data/README.md) にモデルの実回答と根拠付きレビュー例を収録した。8ルールの閾値 0.7 は仮値で、リポジトリ全体の適合率・再現率は未測定。校正用に、モジュール8例と Git 差分6例にルール別の正解ラベルを付けた。モジュールは48組中6組、履歴は12組中4組が陽性。各ルールの偽陽性・偽陰性・無関係の対照は [case-coverage.json](controls/case-coverage.json) に記録した。

`TYPESAFE_API_KEY` を設定した環境では次の手順で判定結果を保存できる。記録先は絶対パスを指定する。`check` と `history` の終了コード1は候補ありを表す。

```sh
just controls "$work/module-controls.json"
range="$(node controls/history.mjs "$work/commits")"
just history "$work/commits" "$range" "$work/history-controls.json"
node ../../node_modules/jev-lint/dist/cli.js replay "$work/history-controls.json" --labels "$work/commits/labels.json"

just check "$work/hono" "$work/hono-verdicts.json"
just history "$repo" 'HEAD~20..HEAD' "$work/hono-history.json"
```

## vlmkit での外部評価

vlmkit v0.27.0 に同じ8ルールを適用した。305の公開経路で、重複を除いた2,438の公開名のうち1,545が wildcard 経由でのみ到達可能だった。実判定2,218行、ソース照合3例、再現手順は [vlmkit の結果と評価データ](vlmkit-data/README.md) にある。

## モジュール間の5原則

リスコフの置換、インターフェース分離、パーナスの情報隠蔽、共通閉鎖、非循環依存を [追加ルール](rules/architecture.yml) に収録した。入力生成器は固定コミットから複数のソース位置や変更差分をまとめる。実行方法、vlmkit の修正前後の結果、誤検知例は [モジュール間の監査](architecture/README.md) にある。

## idealis での外部評価

組み込みアドバイザリー13ルールを公開 main の固定コミットに適用した。537判定から5候補が出て、合成モデルの探索で初期状態の順序により不変条件違反を見落とす事例を再現した。入力を手で補った箇所、候補ごとの追試、ヒントの教師データを [idealis の評価記録](idealis-data/README.md) にまとめた。
