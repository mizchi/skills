# crater のモジュール棚卸し

対象は `mizchi/crater` の `main`、`6a1c6a840f72a129d8254b65ee5f743e59107bad`。2026-11-19 に `git pull --ff-only` で upstream と一致することを確認した。最初に整理を試す場所は、公開状態の所有者が明確な `renderer/renderer` と、描画依存を局所化できる `webdriver/webdriver` の2か所。

## 集中している場所

`moon.work` の144パッケージを対象に、チェックインされた実装630ファイル・209,434行を集計した。公開宣言は生成済みインターフェースがある141パッケージで3,322件。列の「依存先」「依存元」は workspace 内の直接 import のパッケージ数で、テスト専用 import を除く。

| パッケージ | 実装ファイル | 実装行 | 公開宣言 | 非公開 Ref | 依存先 | 依存元 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| webdriver/webdriver | 171 | 52,183 | 108 | 1 | 24 | 3 |
| renderer/renderer | 37 | 11,510 | 74 | 21 | 5 | 14 |
| dom/dom | 10 | 3,875 | 296 | 0 | 1 | 13 |
| dom/scheduler | 8 | 3,240 | 289 | 0 | 5 | 7 |
| layout/block | 8 | 13,204 | 6 | 4 | 6 | 3 |
| layout/flex | 3 | 10,544 | 8 | 1 | 9 | 3 |
| core/node | 3 | 492 | 24 | 3 | 1 | 26 |

`layout/block` は実装規模が2番目でも、パッケージ公開宣言は6件に収まる。ここでの関心は実装内部の分割。`core/node` は492行でも26パッケージが直接依存するため、境界の変更が広く波及する。

## 具体的なレビュー候補

1. **renderer の計測とレンダー状態を分ける。** 非公開トップレベル `Ref` は全体45宣言中21宣言がこのパッケージにある。加えて `perf_child_loop_us` など5個の計測カウンターは `pub let … : Ref[Int64]` として公開され、利用者が書き換えられる。5名とも追跡中の MoonBit 実装・テストでの名前の出現は JS/native の宣言だけだった。外部利用は別途確認が要る。計測値が必要なら値のスナップショットに絞れる。内部状態ではビューポートのカットオフやカウンターがレンダー開始時に初期化されるので、1回の描画に属する状態をまとめる境界がすでにある。[公開インターフェース](https://github.com/mizchi/crater/blob/6a1c6a840f72a129d8254b65ee5f743e59107bad/renderer/renderer/pkg.generated.mbti#L73)・[状態の定義](https://github.com/mizchi/crater/blob/6a1c6a840f72a129d8254b65ee5f743e59107bad/renderer/renderer/viewport_skeleton.mbt#L8)・[初期化](https://github.com/mizchi/crater/blob/6a1c6a840f72a129d8254b65ee5f743e59107bad/renderer/renderer/render_root.mbt#L328)
2. **WebDriver から画面キャプチャの実装を取り出す。** 1パッケージに実装全体の24.9%が集まる。171ファイルのうち `@tui_paint_png.`、`@tui_paint_export.`、`@glyph.` の直接参照はすべて `bidi_browsing_context_actual_paint.mbt` にある。`@tui_paint_viewport.` を使うのもこのファイルと差分描画の2ファイル。プロトコルの応答型を保ったまま、フレームバッファ生成と PNG 符号化を別パッケージに移せるか試す価値がある。公開関数の総数より、WebDriver 本体から何個の描画依存を外せたかで効果を検証できる。[描画の呼び出し](https://github.com/mizchi/crater/blob/6a1c6a840f72a129d8254b65ee5f743e59107bad/webdriver/webdriver/bidi_browsing_context_actual_paint.mbt#L747)・[PNG 変換](https://github.com/mizchi/crater/blob/6a1c6a840f72a129d8254b65ee5f743e59107bad/webdriver/webdriver/bidi_browsing_context_actual_paint.mbt#L1102)
3. **差分レイアウトの呼び出し単位を明示する。** `compute_tree_incremental` は node map と統計をグローバルに置き、`core/node` に clean 判定と dispatcher を設定し、計算後に復元する。コードには `layout/block` と `layout/tree` の循環を避ける意図が書かれている。順序を変更する前に、2本のツリーを交互に計算するテストでキャッシュの所有者を固定すると、この依存逆転を維持したまま呼び出し単位の状態へ移しやすい。[設定と復元](https://github.com/mizchi/crater/blob/6a1c6a840f72a129d8254b65ee5f743e59107bad/layout/tree/incremental_compute.mbt#L429)・[設計理由](https://github.com/mizchi/crater/blob/6a1c6a840f72a129d8254b65ee5f743e59107bad/core/node/node.mbt#L202)

## JS の配布契約で確認した不一致

`@mizchi/crater` のルートには51個の実行時 export がある。型宣言の `getAriaSnapshot`、`getAriaSnapshotJson`、`getAccessibilityTree` は3個ともルートから取得できない。ローカルの `dist/crater.js` では3個とも関数であり、`dist/index.js` と `dist/index.d.ts` が追跡中の配布原稿とバイト一致することも確認した。修正箇所はルートの再エクスポート。型で公開した関数名すべてを配布入口から import するテストで再発を検知できる。`./wasm` には実行時 export が2個、`./gfx-web-runtime` には5個ある。[型宣言](https://github.com/mizchi/crater/blob/6a1c6a840f72a129d8254b65ee5f743e59107bad/js/index.d.ts#L453)・[ESM の入口](https://github.com/mizchi/crater/blob/6a1c6a840f72a129d8254b65ee5f743e59107bad/js/index.js#L2)・[配布処理](https://github.com/mizchi/crater/blob/6a1c6a840f72a129d8254b65ee5f743e59107bad/js/scripts/copy-dist.mjs#L37)

## 履歴と測定範囲

グッドハートの法則の対照になるのが `e7f8a0a6`。特定ページが6–7%高速化しても別ページが2.7–5.1%遅くなることを記録し、キャッシュ案を棄却している。この変更では設計判断に複数の指標が使われた。[判断と計測条件](https://github.com/mizchi/crater/blob/6a1c6a840f72a129d8254b65ee5f743e59107bad/benchmarks/BASELINE.md#L1235)

- 集計はターゲット別の実装をそれぞれ含み、行数にはコメント、空行、FFI 内の埋め込みコードも含む。テスト接尾辞のファイルと workspace 外の conformance 2パッケージを除く。ベンチマークは workspace に含まれる。
- 公開宣言は `pkg.generated.mbti` のトップレベル `pub` 行で、再公開・実装・メソッドを含む。フィールドや enum の各ケースは別に数えない。ベンチマーク3パッケージには生成済みファイルがない。非公開 Ref は実装ソースで型を明記したトップレベルの `let … : Ref[…]` に限定した。
- jev-lint の dry-run は全630ファイルを照合済み。モジュール6ルールで2,862判定対象、直近20コミットの履歴2ルールで40判定対象。合計670リクエスト、約0.3735米ドルの見積もり。21ファイルの入力が Text ブロックの48,000文字上限を超える。このレポートの指摘例は静的集計とソース・配布物の照合による。後続の Jev 実行では全2,902件に回答があり、50件が閾値以上だった。実行記録、根拠付き評価例、再現手順は [教師データ v1](crater-data/README.md) にある。
- 実行時間は棚卸し0.81秒、モジュール判定計画0.35秒、履歴判定計画1.55秒。各1回、ローカル checkout での実測。

## 再現

skills の `tools/refactor-audit` ディレクトリで、上記コミットをチェックアウトした crater を指定する。

```sh
repo="$HOME/ghq/github.com/mizchi/crater"
work="$(mktemp -d)"
just moon-inventory "$repo" "$work/crater"
just plan "$work/crater" > "$work/modules-plan.json"
just history-plan "$repo" '6a1c6a84~20..6a1c6a84' > "$work/history-plan.json"
```
