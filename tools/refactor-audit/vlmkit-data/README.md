# vlmkit の公開 API と Jev 判定

対象は mizchi/vlmkit v0.27.0、コミット `468888c59ff07097892993b1e304882271a4a861`。crater と同じ8ルール、jev-lint 0.8.0、jev-1.14.0、閾値 0.7 で計測した。crater のデータで評価器を開発した場合の外部評価用として、vlmkit の全行に `split: test` を付けた。

## 配布設定から見た公開面

10個の公開 npm パッケージの ESM エントリと型を TypeScript ソースに対応付けた。公開経路は305、公開名は延べ4,558。経路をまたいで同じ「定義ファイル・行・公開名」を1件にすると2,438件になり、そのうち1,545件（63.4%）は9パッケージの `exports["./*.ts"]` だけから到達する。明示エントリは17経路、wildcard は288経路。これは固定コミットの package.json と vite.config.ts から計算した値で、npm tarball の実測や利用者数は含まない。

| パッケージ | 公開経路 | 重複除去後の公開名 | wildcard のみの公開名 |
| --- | ---: | ---: | ---: |
| @mizchi/vlmkit-markup | 148 | 1,176 | 965 |
| @mizchi/vlmkit-core | 59 | 482 | 292 |
| @mizchi/vlmkit-judge | 27 | 434 | 209 |
| @mizchi/vlmkit-ai | 20 | 171 | 91 |

全パッケージの数値は [manifest.json](v1/manifest.json) にある。定義の再公開で複数パッケージに現れる名前は全体集計でも重複を除いた。

TypeScript は private パッケージ、ルートの CLI / API サーバー、worker を含む414ファイル・153,697行。モジュール内で持続し得る非公開変数・コンテナ216件に対して、同じシンボルへの代入や変更操作を確認できたのは19件。たとえば markup-core-runtime.ts には実行バックエンド、結果キャッシュ、直接ロード失敗の記憶が集まる。外部依存の型はインストールせず、組み込み・外部パッケージの静的 import 等535箇所は未解決。MoonBit は markup 配下3パッケージ・19実装ファイル・5,415行を対象とし、ソース上のパッケージ公開宣言を読んだ。

## モデルの指摘とソース照合

| ルール | 判定数 | 陽性 |
| --- | ---: | ---: |
| 単一責任 | 433 | 0 |
| 最小権限 | 293 | 0 |
| 驚き最小 | 293 | 0 |
| ハイラム | 293 | 2 |
| パーキンソン | 433 | 4 |
| カーニハン | 433 | 3 |
| グッドハート | 20 | 0 |
| キャンベル | 20 | 0 |

実行記録の費用合計は $0.46957。ソース2,178判定は約28秒。履歴は直近20コミットを対象とし、入力上限を超えた15コミット・30判定のみ、メッセージ・変更ファイル一覧・stat・差分を短縮して再実行した。履歴40件はすべて閾値未満で、抜粋外の変更については判断できない。

- **見逃し（ハイラム 0.05）**。ai の index.ts では STOP_WORDS と SYNONYMS を内部調整用と明記している。wildcard の nlp.ts 経由で取得でき、呼び出し元が変更すると同一プロセスのキーワード照合に反映される。判定入力には nlp.ts の定義と公開経路が入り、barrel 側の意図と reasoning.ts の利用箇所は別ファイルにあった。
- **検出（カーニハン 0.84）**。resolveHtmlSource は入力の欠落、URL の拒否、fetch の例外をすべて null にする。compare ルートは baseline / current のどちらが失敗しても同じ400応答を返す。
- **誤検知（パーキンソン 0.70）**。version.ts のコメントは過去のバージョン番号の三重管理を説明している。現在の CLI と MCP は同じ定数を参照し、配布時の manifest との一致はテストで確認している。

3例は意図的に選んだ診断例で、全体の正解率は未測定。[レビュー行](v1/reviewed.jsonl) に固定リビジョンでの blob、ファイル、行番号、根拠を収録した。

## オフラインでの再現

Node 24 とリポジトリの pnpm lockfile を使う。Git checkout には対象コミットとその前20コミットの履歴が必要。出力には新規ディレクトリを指定する。

```sh
pnpm install --frozen-lockfile
cd tools/refactor-audit
repo="$HOME/ghq/github.com/mizchi/vlmkit"
work="$(mktemp -d)"
just vlmkit-verify
just vlmkit-dataset "$repo" "$work/dataset"
just vlmkit-inventory "$repo" "$work/evidence"
```

[教師 JSONL](v1/teacher.jsonl.gz) はルール、質問、判定入力、Jev のスコアとラベルを1行にまとめた。教師ラベルは機械判定で、ソース照合は別ファイルに保存した。再生成は追跡ソース、[初回のモジュール判定](records/modules.json)、[初回の履歴判定](records/history.json)、[短縮して再実行した履歴判定](records/history-retry.json) から行う。未回答と再回答のキーを突合し、ルールのハッシュと閾値、生成結果の SHA-256 を検証する。固定記録の再生と再生成に API キーは不要。収録した vlmkit ソース抜粋のライセンスは [MIT](LICENSE.vlmkit)。

API を再計測する場合は上記の evidence を生成後、次を実行する。モデルの再回答は固定記録と異なる可能性がある。初回履歴に未回答がある場合だけ、同じ短縮手順で再実行する。

```sh
. ~/.profile
export TYPESAFE_API_KEY JEV_LINT_MODEL=jev-1.14.0 TYPESAFE_BASE_URL=https://api.typesafe.ai
just check "$work/evidence" "$work/modules.json"
just history "$repo" '468888c59ff07097892993b1e304882271a4a861~20..468888c59ff07097892993b1e304882271a4a861' "$work/history.json"
node vlmkit-data/retry-history.mjs "$repo" "$work/history.json" "$work/history-retry.json"
```
