# PRとpushのスキル意味検査

[Skill semantic review workflow](../.github/workflows/skill-review.yml) は、PR・mainへのpush・
手動実行で現在のSKILL本文と英日差分を検査する。校正用fixtureのreplayとは別の検査である。

```sh
pnpm test:skill-review
pnpm review:skills --base <full-base-sha> --head <full-head-sha> --dry-run
# TYPESAFE_API_KEY を環境変数で渡す
pnpm review:skills --base <full-base-sha> --head <full-head-sha>
pnpm review:skills --all --dry-run
```

入力はGitのcommitに固定する。未コミットの本文を調べるときは従来の
`pnpm lint:skills` / `pnpm lint:translations` を使う。

## 選択範囲

- 変更したスキルの本文全体と、存在する英日ペアを選択する。参照・同梱コードの変更も親の入口を選ぶ。
- 検査実装・ルール・依存・workflow変更時は全入口を選ぶ。
- 削除はレポートへ残す。日本語版だけ残った場合やSKILLがsymlinkの場合は失敗する。
- 対象がない場合は `not-applicable` とし、判定済みとは報告しない。

text規則はplanの全subjectと現在の回答を照合する。翻訳は文書全体と、本文をcontextにした
frontmatterの2比較を行い、jev-lint自身のparserで証拠と回答を照合する。
missing・証拠不足・未知の出力はexit 3、矛盾候補はexit 1、正常な完了またはplanはexit 0。
候補は出典と本文を読んで確認する。閾値の引き上げやignore追加で隠さない。

## PRの実行境界

`pull_request_target` でベースcommitの検査コード・ルール・lockfileを使う。
PRのheadはfetchしてcommit SHAを照合し、対象SKILLのblobだけをデータとして取り出す。
PRのcheckout、package.json、設定、scriptsは実行・採用しない。secretはモデル検査のstepだけに渡す。
権限は `contents: read` で、インストールはtrusted lockfileと `--ignore-scripts` を使う。

PRがこの検査実装自体を変更しても、そのPRを検査するのはベース版。
提案版の実装はsecretなしのcontractsテストで確認し、main反映後のpush検査で使用する。
検査snapshotとsourceは `.cache/skill-review/current/` に保存し、CIでは14日間artifactとして保持する。
新しい回答を得るため、このgateはtextの判定cacheを使わない。

[日次の上流監視](skill-freshness.md)は別のgateで、API変更の出典差分を検出する。
意味検査の成功だけで外部APIの鮮度や実行互換性が保証されたとは扱わない。

textの本判定は `--retry 3` の平均を使う。校正済みのcutoffは維持し、
実行ごとの揺れを記録する。平均がcutoffを超える候補は、揺れがあってもレポートから除かない。
