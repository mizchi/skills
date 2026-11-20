# mizchi/idealis でのアドバイザリー評価

公開 `main` の `d147550c80d814e23f5d76f8ded25e30bf190da4` を Git オブジェクトから展開し、jev-lint 開発版の組み込み13ルールを既定の閾値で評価した。モデルは `jev-1.14.0`。idealis の作業ブランチ・作業ツリーは入力に含めていない。

| 入力 | 判定数 | 候補 |
| --- | ---: | ---: |
| TypeScript 28・Rust 55・Go 9ファイルに対する6ルール | 456 | 4 |
| 契約・利用例3組、パッケージの変更履歴6組 | 9 | 1 |
| Git 履歴に対する Goodhart と Campbell | 72 | 0 |

本体の設計5原則用コレクターで `src`・`cli` だけを走査すると、モデルに渡せる入力は0件だった。`Model` の実装と利用者を発見したものの、宣言箇所だけでは動作の保証を読み取れず、収集器が根拠不足として記録した。そこで公開型、AGENTS.md、実装、呼び出し位置を3組指定した。モジュール間の循環は7 crate の Cargo マニフェストでローカル依存5辺を確認し、閉路0件。ADP にモデル判定は発生していない。CCP は直近の first-parent 非マージ20コミットで製品パッケージが2回以上同時変更された6組を判定した。各組の先頭3コミット、各側2ファイルまで、各パッチ先頭1,700文字を使った。[入力指定](architecture.json)・[パッケージと変更ペア](package-history.json)

**公開 API の範囲。** TS は package.json の15個の JS エントリから実装まで解決し、公開名は延べ175、定義元は24ファイル。Wasm バイナリそのものは数えていない。外部型をインストールしていないため5か所の import は未解決。Rust は固定 nightly の rustdoc でホストの公開宣言・再公開・固有メソッドをたどり、Wasm 用に明示された C ABI の関数もソースから追加した。Go は adapter のルートパッケージのトップレベル宣言とエクスポートされた型のメソッドを収集した。Rust の全 trait 実装、Go の全フィールド、ターゲットや feature の全組合せは網羅していない。テスト専用ディレクトリや evals はモジュール集計の対象外。大きなファイルのモデル入力には jev-lint の上限がある。

**履歴。** 前回と同じ `REV~20..REV` は、idealis のマージ履歴では39コミットに展開される。マージ3件を除いた36件を各2ルールで判定した。1コミットの2判定が入力上限に達し、前回と同じ短縮手順で再判定した。省略を明示した短い差分での回答を別記録に残した。[初回](records/history.json)・[再判定](records/history-retry.json)

## 候補5件の追試

| 対象 | Jev | 照合した内容 |
| --- | ---: | --- |
| `composeModels` のリスコフ置換 | 0.59（閾値0.53） | 同じ子状態から異なる初期観測を許すモデルを合成した。右側だけ進めると左の観測は保持され、片方の初期状態からだけ到達する不変条件違反がある。標準のキーで順序 a,b は complete、順序 b,a は violation。観測を含めた対照キーでも violation。再推論3回とも閾値を超え、平均0.61。 |
| `idealis-core/src/wasm.rs` のカーニハン | 0.76 | 固定リビジョンからビルドした Wasm の公開 ABI に不完全な JSON と必須フィールドを欠く JSON を渡した。EOF と version 欠落を区別して返した。 |
| `idealis-smt/src/wasm.rs` の同ルール | 0.76 | 同じ入力で原因を区別して返した。 |
| `ralloy/src/wasm.rs` の同ルール | 0.73 | こちらも原因を区別し、入れ子の error.message に理由が残った。 |
| Go adapter の internal/counter の同ルール | 0.79 | 評価用の故障注入 SUT。実装で同一IDの加算を2回流すと通常モードは1、deduplication 故障モードは2。比較ハーネスはケースIDと故障モードを記録している。 |

Wasm の3件では通常のプロトコルエラーで原因消失を確認できなかった。出力のシリアライズで `expect` が失敗する経路は未再現。Go の意図的な故障は製品バグ件数から除いた。モデルはファイルに対して「どの故障経路か」を特定しないので、この3件を一律に偽陽性と判定するには追加の根拠が要る。

検出結果の5件それぞれに、実際に表示された `nextCheck` と汎用の「関連コードを確認する」を付け、前回固定した評価ルールで各3回判定した。具体的ヒントは5/5で全3回が閾値0.70以上、汎用ヒントは0/5。同型のWasmラッパーが3件を占める。この値はヒントから切り分けを始められるかについてのモデル評価である。[ヒントの評価記録](records/hints.json)・[教師データ10行](teacher.jsonl)

## 再現

`mizchi/skills` と、アドバイザリー実装を含む `mizchi/jev-lint` を ghq の隣接チェックアウトに置く。Node 24、TypeScript 5.9.3、Git、just を使う。入力再生成には rustdoc の nightly-2026-08-27 と Cargo.lock の依存を用意する。

```sh
cd tools/refactor-audit/idealis-data
repo="$HOME/ghq/github.com/mizchi/idealis"
work="$(mktemp -d)/idealis"
just verify
just composition "$repo"
just inputs "$repo" "$work"
just wasm "$work"
```

`verify` はキー不要で、未回答と再判定を照合し、ヒント評価から教師データを再生成してバイト一致を検証する。`inputs` は固定コミットから全101入力を作り直し SHA-256 を照合する。教師データは各候補の検出スコア、評価入力、具体／汎用ヒント、3回のモデル評価を格納する。ソースのライセンスは [MIT](LICENSE.idealis)。

実推論を繰り返す場合は `TYPESAFE_API_KEY` を環境から設定し、各ディレクトリで次を実行する。採用済みの記録は別に保存しておく。

```sh
tool="$HOME/ghq/github.com/mizchi/jev-lint"
data="$PWD"
(cd "$work/modules" && node "$tool/src/cli.ts" check . --config "$tool/advisory/modules.yml" --cache none --model jev-1.14.0 --record "$work/modules.json")
(cd "$work/architecture" && node "$tool/src/cli.ts" check . --config "$tool/advisory/review.yml" --cache none --model jev-1.14.0 --record "$work/architecture.json")
(cd "$repo" && node "$tool/src/cli.ts" commits d147550c~20..d147550c --config "$tool/advisory/history.yml" --cache none --model jev-1.14.0 --record "$work/history.json")
# 保存済みの5候補から評価当時のヒントと対照を作り、もう一度実測
node "$data/hints.mjs" "$tool/src/cli.ts" "$work/modules" "$work/architecture" "$work/hints"
(cd "$work/hints" && node "$tool/src/cli.ts" calibrate . --no-config -R "$tool/experiments/advisory/hint-review.yml" --cache none --labels labels.json --repeat 3 --model jev-1.14.0 --record "$work/hints.json")
```
