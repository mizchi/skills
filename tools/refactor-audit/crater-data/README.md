# crater のリファクタリング教師データ v1

crater のコミット `6a1c6a840f72a129d8254b65ee5f743e59107bad` を対象に、jev-lint 0.8.0 と `jev-1.14.0` で判定したスナップショット。モジュール630ファイルと直近20コミットを670リクエストで処理し、全2,902件に回答を得た。実行日は2026-11-19、jev-lint が記録した費用は0.345741942米ドル。

| ファイル | 内容 |
| --- | --- |
| [teacher.jsonl.gz](v1/teacher.jsonl.gz) | 1行が1入力×1ルール。コードまたはコミット本文・差分、質問、判定基準、スコア、ラベルを同梱した JSON Lines |
| [reviewed.jsonl](v1/reviewed.jsonl) | 前回の指摘と対照例をソースで照合した14件。肯定7件・否定7件。各行に抜粋、Git blob、行範囲、判断理由を収録 |
| [manifest.json](v1/manifest.json) | 展開後のデータの SHA-256、実行記録のハッシュ、ルール別件数、レビューとの照合結果 |
| [モジュールの実行記録](records/modules.json)・[履歴の実行記録](records/history.json) | jev-lint が出力した実測値、判定に使ったルールの識別子・閾値・費用。オフライン replay に使用 |

## 教師ラベルの意味

`teacher` の `labelSource: jev` はモデルによる弱いラベル。`score >= 0.7` が `bad`、それ以外は `clean`。この閾値は未校正。50件の陽性の内訳は、パーキンソン15、ハイラム14、カーニハン11、最小権限8、驚き最小2。単一責任630件、グッドハート20件、キャンベル20件では陽性が0件だった。この3ルールの陽性を学習するには別の事例が要る。

`reviewed` の `labelSource: assistant-source-review` は今回アシスタントが根拠を読んで付けたラベル。Jev の出力を模倣する学習と、個別の設計判断を検証する評価にそれぞれ使える。パッケージ間の描画依存、描画単位の共有状態、JS の export 契約には独自の問いを付けた。Jev の既存8ルールで直接測った事例だけを `manifest.comparisons` に載せている。

前回の指摘を中心に選んだ8件の対応例では、レビューとJevが6件一致した（TP 1、TN 5、FP 0、FN 2）。レンダラーの書き換え可能な計測カウンターはハイラムで0.79、最小権限で0.61。失敗とプロバイダ欠落の両方を空文字にするフォント処理はカーニハンで0.50だった。比較の単位は同じファイルまたはコミットに対する同じルールで、レビューには根拠抜粋を、Jev にはスキャンの入力を使っている。8件は例示用に選んだため、リポジトリ全体の精度推定には使えない。

## 分割と入力

| split | 件数 | 陽性 |
| --- | ---: | ---: |
| train | 1,538 | 27 |
| validation | 191 | 1 |
| test | 1,173 | 22 |

MoonBit はパッケージ、履歴はコミットを分割単位とし、同じグループの異なるルールは同じ split に置いた。レビューの対象パッケージ・対象コミットを test に予約し、残りはグループ名の SHA-256 で分割した。単一リポジトリの評価であり、過去の差分と現在の実装、別パッケージ間では内容が重なる可能性がある。陽性が少ないため、評価時はルール別の件数も参照する。

モジュールの `input` は jev-lint が選択した Text ブロック。コミットの `input` はメッセージ、変更ファイル一覧、stat、diff を格納した JSON 文字列。1行ずつ単独で学習に使えるようにした。バッチ単位の API 通信を再生する形式ではない。テキスト上限を超えた21ファイルと、差分を切り詰めた5コミットには `truncated: true` が付く。ソースの範囲・宣言数の数え方は [crater の測定範囲](../crater-report.md) を参照。

## 再現

リポジトリのルートで `pnpm install --frozen-lockfile` を実行し、以下を実行する。Node.js 24、Git、just を使用。保存データの検証と再生成は API キーなしで動作する。

```sh
cd tools/refactor-audit
just crater-verify
work="$(mktemp -d)"
just crater-dataset "$HOME/ghq/github.com/mizchi/crater" "$work/v1"
gzip -dc "$work/v1/teacher.jsonl.gz" > "$work/teacher.jsonl"
```

`crater-verify` は配布ファイルを照合し、両方の実行記録を0リクエストで再集計する。`crater-dataset` は指定コミットの Git オブジェクトと保存した実判定から新しい出力先を作り、確定ハッシュと照合する。作業ツリーのブランチや未コミット変更に依存しない。Git の差分に含まれる省略オブジェクト ID はこの実行に合わせて8桁に固定した。独立した depth 25 の bare clone から、圧縮済みデータもバイト一致することを確認済み。

モデル自体を再度測る場合は、上記コミットをチェックアウトしたクリーンな作業コピーを `repo` に指定する。新しい判定結果は別の出力先に保存する。固定モデル名でも再推論のスコアは変動し得る。

```sh
source ~/.profile
export TYPESAFE_API_KEY
export JEV_LINT_MODEL=jev-1.14.0
repo="$HOME/ghq/github.com/mizchi/crater"
test "$(git -C "$repo" rev-parse HEAD)" = 6a1c6a840f72a129d8254b65ee5f743e59107bad
work="$(mktemp -d)"
just moon-inventory "$repo" "$work/inputs"
just check "$work/inputs" "$work/modules.json"
just history "$repo" '6a1c6a84~20..6a1c6a84' "$work/history.json"
```

`check` と `history` は候補があると終了コード1を返す。抽出したソース・差分の出典は [mizchi/crater](https://github.com/mizchi/crater/tree/6a1c6a840f72a129d8254b65ee5f743e59107bad)。原典のライセンスを [LICENSE.crater](LICENSE.crater) に収録した。
