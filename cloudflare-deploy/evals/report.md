# cf 1.0 RC スキル評価

評価ループは機能面で収束した。初回の3点を修正後、各通常課題で2回連続して新たなスキル上の修正点がなく、全critical項目を満たした。未使用の静的サイト課題も6/6だった。

対象は cloudflare-deploy、cloudflare-mbt-worker-bundle、cloudflare-workers-cd-rollback、utels-project-bootstrap。2026-11-18 に新規コンテキストの実行者を用いて評価した。本文の読み直しだけで判定せず、隔離プロジェクト、実 cf CLI、ローカル HTTP、子プロセスの捕捉で動作を確認した。

## 固定した課題と採点

[scenarios.json](scenarios.json) に最初の3課題・18項目を保存した。各課題は6項目、そのうち3項目が critical。全点=1、部分達成=0.5、失敗=0。critical が1項目でも未達なら課題を失敗とする。途中で基準を緩めていない。

| 課題 | 対象 | 主な実行 |
|---|---|---|
| Worker | cloudflare-deploy | モード別設定、KV、secret、型生成、TypeScript、v1 build、prebuilt dry-run、ログ用コマンド |
| Pipeline | MoonBit bundle / CD rollback | 合成JSのFFI変換、split bundle破損検出、CIの停止条件、D1引数、25/75配分の保存・復元 |
| utels | utels-project-bootstrap | localhost登録、staging選択、stdin secret配送、子失敗、無効target、RC schema |

各課題を新しい実行者に渡し、指示上の不備、実行者の実装ミス、ハーネスの制約を分けて記録した。実行者には前回の結論や修正意図を渡していない。追加の静的サイト課題は、初回評価の結果を受け取る前に予約した別の6項目を使用した。

## 初回に見つけて修正した3点

1. secret ファイルを省略しても RC.1 の prebuilt deploy dry-run が終了0になることを確認した。secret宣言、非空値の事前検査、ビルド検査、遠隔配送の保証を区別する説明に修正した。再評価の実行者は独立した secret preflight と missing/empty の負例を実装した。
2. FFI参照文書が、bundle checker に未実装の「未解決runtime参照の検出」を保証していた。実装済みの合計サイズ、制御文字、設定markerの検査に説明を合わせ、asyncパスの動作確認を別に求めた。
3. CDテンプレートの部分一致が認証エラー100070を未作成Workerの10007と誤認した。実際のworkflowを実行する回帰テストで Red を確認し、数字の境界を持つ一致に変更して Green を確認した。修正後は Node 5件とRuby 6件・58 assertionsが成功した。

初回の18/18は、実行者が生成した成果物の課題達成率を示す。追加の負例と資料・実装の照合で上記3件も発見しており、18/18をスキルに不備がない証拠として扱っていない。課題達成とスキルの不備を別の指標にしている。

## 実行履歴

詳細な判定・修正規則は [ledger.yaml](ledger.yaml) に保存する。生のログ・生成物と各回346ファイルのSHA-256 manifestはローカルの `results/cloudflare-rc-eval-2026-11-18/` にあり、Gitの追跡対象外。

| 回 | 課題達成 | 新たなスキル上の修正点 | 状態 |
|---|---:|---:|---|
| 0 | description/body整合 4/4 | 0 | 静的確認 |
| 1 | 18/18 | 3 | 修正を反映 |
| 2 | 18/18 | 0 | 同じ固定課題で再評価 |
| 3 | Worker/Pipeline 12/12、未使用課題 6/6 | 0 | 各通常課題で2回連続の問題なしを確認 |

## 検証範囲と計測

cf 1.0.0-rc.1、Vite plugin 2.0.0-rc.1、Node 24.22.2を使用した。MoonBitは合成生成JSであり、本物のcompiler/runtime互換性を実証していない。Cloudflare/utelsの実アカウント、実migration、実deploy、live log配送は実行していない。引数dry-runとmock成功を実サービスの成功とは区別した。without-skill比較は行っていないため、スキル追加による成功率の向上幅は未計測。

ツール回数・所要時間は実行者の自己申告。委譲APIには独立したusage metadataがないため、時間・手数の厳密な収束は判定しない。停止条件は、各通常課題で2回連続して新たな修正が必要な指示上の問題がなく、critical全件を満たし、別の未使用課題も通ること。

第2回では node_modules 全体のsymlinkによりViteの無視対象キャッシュが共有先へ書かれた。スキルの不備とは分離して記録し、既存キャッシュは削除・復元せず保持した。最終確認には作業先ごとに依存全体のAPFS cloneを用意し、依存キャッシュへの書き込みを隔離した。最終Pipelineの一部テストはTMPDIR指定を漏らした可能性があり、自己削除するfixtureがOS一時領域を利用した点も実行者側の問題として記録した。

## 再実行

通常の回帰はリポジトリ直下で `just --justfile cloudflare.justfile check-cloudflare`、固定RCの型生成・ビルド・dry-runは `just --justfile cloudflare.justfile smoke-cloudflare`。スキルの行動評価を繰り返す場合は、scenarios.json の課題と採点を新規コンテキストの実行者に渡し、対象スキルのsnapshotと固有の作業先・依存コピーを用意する。新しい結果と一般化した修正規則をledgerへ追記する。
