# スキルの鮮度検査

`jev-lint@0.8.0` と公式の上流情報を組み合わせ、古くなった説明を検出する。
[監視リスト](skill-upstream-watchlist.json)は10グループ・38スキルを対象にする。
[全76スキルの棚卸し](skill-freshness-audit-2026-11-16.md)とは範囲が異なる。
低変動の原則まで、毎日のAPI検証が済んだとは扱わない。

## 実行

Node 24+と、依存パッケージの `engines` を満たすpatch版を使う。

```sh
pnpm install --frozen-lockfile
just --justfile skill-freshness.justfile test
just --justfile skill-freshness.justfile plan
# TYPESAFE_API_KEY を環境変数で渡す
just --justfile skill-freshness.justfile check
```

`plan` は上流を取得し、比較対象・欠落参照を検査する。モデルへの問い合わせはない。
`check` はnpmの公開metadata、GitHub release・対象ファイル・branch、公式文書を
取得してdigestを比較する。Actionsは実YAMLの正確なrefとcomposite内の依存も調べ、
内蔵Nodeが24未満なら失敗する。プロジェクトのNode設定とは別の検査である。
pnpmのJSON形式は固定したpnpmによる読み取り専用の `pnpm audit --json` でも確認する。
監査対象パッケージ名やadvisory本文は上流証拠へ含めない。

変更があるグループは、取得した公式の証拠と明示した節を `jev-lint docs` で比較する。
モデルの記憶だけでAPIの正誤を判断させない。長い出典は話題に関連する箇所を抜粋し、
URL・revision・全文digest・抜粋の有無をレポートに残す。
`comparisons` が意味比較の範囲、`skills` と `targets` が変更監視の範囲である。
38スキルすべての全APIを意味比較するという意味ではない。

上流digestの変更は、意味比較が一致しても要確認になる。新しいリリースの存在だけで
過去の動作記録を誤りとはしない。本文は自動書き換え・自動承認しない。
公式文書の取得失敗、未知のschema、未回答、無関係な比較、証拠不足、実行中の入力変更は
正常終了にならない。古い成功レポートを使って取得失敗を隠すこともない。

| 終了コード | 意味 |
| --- | --- |
| 0 | 取得・比較が完了し、承認済みの内容から変更なし。または正常なplan |
| 1 | 上流・対象・設定に変更、矛盾候補、またはActionのruntime違反 |
| 3 | 設定・取得・判定・証拠対応の検証が未完了 |

レポートは `.cache/skill-freshness/current/report.json`。同じ場所にsnapshot、
取得した証拠、manifest、回答を記録する。planは別の `plan/` に出力する。
矛盾候補は人が出典と本文を読んで確認する。問い合わせの記録は、jev-lint自身の
parserで証拠・質問・回答件数との対応も検証する。

## 更新を確認して基準を受け入れる

1. レポートの出典差分と候補を確認し、公開版・beta・未リリースmainを区別する。
2. 対象の英語本文・日本語版・参照・同梱コードを直す。
3. 対応する型チェック、CLI、smoke、ローカルリンク検査を実行する。
4. `just --justfile skill-freshness.justfile accept` を明示的に実行する。
5. `.jev-lint/freshness-baseline.json` の差分と検証記録をレビューし、commitする。

`accept` は全グループを再判定し、取得失敗・未判定・矛盾・runtime違反が残れば
基準を書き換えない。一部だけの実行では承認できない。通常実行やCIでの自動更新はしない。
`--group otel` で対象を絞れる。`--force` は変更のないグループも再判定する。

[初期基準](../.jev-lint/freshness-baseline.json)は82出典・66ファイル・32比較を記録する。
基準は上流と対象のdigest、設定、検査実装・jev-lintの質問、モデル名・判定範囲に
結び付ける。通常実行では毎回上流を取得し、一致する承認済み判定だけを再利用する。
出典・スキル・設定・検査実装のどれかが変われば再検査する。

## CI

[Skill freshness workflow](../.github/workflows/skill-freshness.yml) は毎日
06:23 JST（21:23 UTC）と手動実行で上流を検査し、14日間レポートを保存する。
PR/pushではネットワークやモデルを使わないコントラクト検査を実行する。
上流取得にはread-onlyの `GITHUB_TOKEN`、モデルにはrepository secret
`TYPESAFE_API_KEY` を使う。キー値をファイルやコマンド引数へ書かない。
workflowをdefault branchへ反映すると定期実行が有効になる。

ローカルの回帰検査はHTTP失敗・無効設定・未知の出力・基準の自動承認防止・
新しい上流・不足リソースを扱う。意味判定の小さな対照群は、誤り4件・正常5件・
証拠不足1件を3回測定している。`pnpm freshness:controls` で回答と証拠の対応を再検査する。
これは全APIの正しさや、モデルの誤判定がゼロであることを保証する測定ではない。

## 対応する実行検証

| 対象 | 再実行方法・範囲 |
| --- | --- |
| OTel | `otel-node/assets/smoke` で `pnpm install --frozen-lockfile`、`pnpm check`、`pnpm test`。メモリexporterと伝播・終了処理 |
| Pi | `pi-coding-agent/assets/smoke` で同じ3コマンド。モデルを呼ばないsession・tool・credential構築 |
| vlmkit | `vlmkit/assets/smoke` でinstall、`pnpm exec playwright install chromium`、`pnpm test`。HTMLの3viewport比較 |
| SQLite | `node-sqlite-vec/assets/smoke` でinstall、`pnpm test` と `pnpm test:vitest`。node:testとVitestでvec0検索 |
| Cloudflare | `cloudflare-deploy/assets/smoke` でinstall、typecheck、build、`pnpm exec cf deploy --dry-run`。公開しない |
| MoonBit | `just --justfile moonbit.justfile test`。コンパイラと直接FFIの確認。外部adapterとは別 |
| フロントエンド監査 | `pnpm test:frontend-audit`、`pnpm test:audit-report`、`pnpm frontend:sync:check`。単体配置・空白パス・未知値の扱い |

フロントエンド監査コードの正本は `scripts/frontend-audit.mjs` と
`dep-lib-review/scripts/audit-report.mjs`。編集後に `pnpm frontend:sync` で各スキルへ
複製し、`--check` で差分を検知する。各入口の [収集契約](../frontend-review-triage/references/collection-contract.md)に
収集範囲と未測定の扱いを記載している。
