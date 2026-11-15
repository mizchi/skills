---
name: multi-agent-orchestration
description: subagent を増やすか、sequential / fan-out / supervisor / debate / dynamic DAG のどれにするか、write-scope を分けたコーディング DAG を組むか、独立した証拠なしにエージェントを足してトークンを捨てそうなときに使う。multi-agent、orchestration、fan-out、worktree、blackboard、verifier、AgentTask、「並列化すべきか」がトリガー。
---

# Multi-Agent Orchestration

エージェントを増やすのではない。独立して検証できる仕事を増やす。依存グラフへ分解し、独立ノードだけ並列実行し、共有状態と検証器で統合する。

## いつ使うか

- subagent を 2 つ以上起動しそうなとき、調査の fan-out、debate/jury、「programmer + reviewer」ペア
- コーディング DAG、worktree 分割、長時間の並列実装を設計するとき
- タスクが「難しそう」だからエージェント数を増やしたくなったとき

使わない場面:

- 独立部分のない逐次変換（読む → 直す → テスト）
- 同じモデル・同じ入力・同じツールで、役割名だけ変える — 単一エージェントの複数ターンで足りる

## ゲート

デフォルトは **単一エージェント**。**(1) または (2)** が成り立ち、かつ (4) が正のときだけ multi にする。

**3 は起動理由ではない。** multi を止める条件である。同じエージェントが回せる unit test は成功条件であり、第二エージェントではない。(3) が弱いなら単一のままにするか、成果物を検査できる rubric/schema を足す。エージェントを足して補わない。

1. 並列実行できる独立部分がある — 短い凍結契約（型、HTTP 形、fixture）のあと独立になる部分を含む。呼び出し辺や実行時辺があるだけでは自動的に単一にはしない。
2. エージェント間で情報・モデル・ツール・権限が違う
3. 中間成果を機械的に検証できる（テスト、スキーマ、provenance、oracle、lint）。調査なら schema 付き provenance で足りる。偽のテスト oracle を作ったり debate に逃げたりしない。
4. 追加エージェントの期待利益が、トークン / 遅延 / 誤り伝播のコストを上回る

(1) と (2) が両方弱いなら、(3) が成り立っても単一のまま。Google の 260 構成比較: 分解可能な金融推論は単一比 **+80.8%**、逐次計画は **−70%**。中央検証がないと誤りが伝播する。支配要因はエージェント数ではなく、トポロジーとタスク構造の一致。

## トポロジー

| パターン | 構造 | 適した処理 | 失敗モード |
|---|---|---|---|
| Sequential | A → B → C | 明確な変換パイプライン | 前段の誤りが伝播する |
| Fan-out / Fan-in | 複数 worker を並列実行して統合 | 調査、候補生成、独立テスト | 重複作業、統合品質 |
| Supervisor–Worker | manager が分解・割当・再計画 | オープンエンドな調査・開発 | manager がボトルネック |
| Handoff | 次の専門家へ所有権を移す | サポート、対話型ルーティング | 制御と責任の所在が揺れる |
| Blackboard | 共有タスク表と成果物 | 長時間の開発、非同期実行 | 古い状態、書き込み競合 |
| Debate / Jury | 独立回答、批判、投票 | 評価困難な判断 | 相関した誤り、迎合 |
| Dynamic DAG | 実行時に役割・依存・並列度を決める | 難易度が大きく変わる仕事 | グラフ生成自体が信頼できない |
| Evolution / Search | ワークフローを探索する | 同種タスクの大量反復 | 学習・評価コストが大きい |

まず表の **適した処理** 列で選ぶ。**Supervisor + Dynamic DAG + Blackboard + Verifier** はオープンエンドで長時間の仕事向けのキットであり、必須スタックではない。候補集合が既知なら Fan-out / Fan-in。逐次の 1 ファイルは単一のまま。

頭数ではなく労力をスケールする。Anthropic Research: 検索は 1 agent、比較は 2–4、幅広い調査だけ 10 以上（通常チャットの約 15 倍トークン）。バンドに数えるのは **spawn した並列 worker** であり、親の integrator は数えない。verifier は逐次で最大 1。簡単な仕事に 5 エージェントを起動しない。

Handoff と agent-as-tool: **ユーザー応答の所有権**を移すなら handoff。manager が **統合する**なら agent-as-tool。

## 通信

全会話履歴は渡さない。依存する上流成果物、構造化された結果（patch、根拠、テスト、未解決事項）、provenance だけ。低価値な記憶は捨て、実行時に安い / 冗長な agent を prune する。

同じモデル・同じ入力・同じツール・人格だけ違う、は多様性ではない。誤りは相関する。独立した証拠を集めてから検証する: 検索範囲の分離、異なるテストやモデル系列、静的解析と実行、実装者と敵対的 verifier、投票を見る前の private answer。

## コーディングハーネス

各タスクはチャットターンではなく契約:

```ts
type AgentTask = {
  id: string;
  objective: string;
  dependencies: string[];
  inputArtifacts: ArtifactRef[];
  allowedTools: string[];
  writeScope: string[];
  budget: { tokens: number; toolCalls: number; retries: number };
  successCriteria: Check[];
  outputSchema: Schema;
};
```

1. router が依存 DAG と write-set を推定する
2. write-set は交差しないが呼び出し/実行時辺が残るなら、凍結した契約成果物を出して、残依存を他 worker のコードではなくその成果物へ向ける。そのうえで **コード** 依存がなく write-set が衝突しないノードだけ並列化する。次の編集が前の編集の実コードを必要とする、または同じファイルに書くなら単一のまま。
3. worker は patch + 根拠 + テスト結果 + 未解決事項を返す。全文チャットは返さない
4. 共有 trunk への書き込みは integrator に限定する
5. verifier は実装 agent と別コンテキスト。可能なら別モデル
6. 再計画回数、agent 数、token、wall time に上限を置く
7. **検証成功**、または追加実行の期待利益 ≤ コスト、で停止する
8. template、生成された DAG、execution trace を別々に保存する

agent ごとの worktree は競合を後回しにするだけ。write を仲介するか、write-set を交差させず integrator が適用する。テストと CI がタスクキュー。Git lock と進捗ファイルで再オリエンテーションする。独立した観測単位に切れない段階は無理に並列化しない。

評価軸は品質 / コスト / 遅延であり、エージェント数ではない。**同一 token 予算**で単一エージェント、固定 DAG、動的 DAG を比較してからトポロジーを残す。論文の著者報告は、その比較の代替にならない。

## よくある失敗

| 言い訳 | 実態 |
|---|---|
| 「programmer と reviewer と名付ける」 | 同質な役割演技は、単一エージェントに KV cache コストを足しただけになりがち（OneFlow） |
| 「debate すれば答えが直る」 | 閉じた議論は新しい証拠を増やさない。相関した誤りは残る |
| 「常に 5 人チームから始める」 | 簡単な仕事では損。安い router 推定のあとでスケールする |
| 「全員に全文スレッドを渡す」 | コンテキスト汚染、古い判断の再伝播、誰が何を知っているか不明 |
| 「関数呼び出しがあるから並列化できない」 | callee の signature を成果物として凍結すれば、write-set が交差しない限り並列できる |
| 「worktree があるから write-set は無視していい」 | 競合は消えていない。先送りされている |
| 「エージェントを増やせば品質が上がる」 | 逐次・ツール過多のタスクでは悪化しやすい |

## 任意: Flue

成果物のデフォルトは上のオーケストレーション計画。ユーザーが明示したとき、または repo が既に Flue（`'use agent'`、`@flue/runtime`）のときだけ Flue コードを出す。対応: [references/flue.md](references/flue.md)

## 関連

- `superpowers:dispatching-parallel-agents` — 独立が確定したあとの dispatch 作法
- Grok `create-workflow` — グラフをチャットではなくスクリプトにする実行系

論文リンクと著者報告数値: [references/sources.md](references/sources.md)
