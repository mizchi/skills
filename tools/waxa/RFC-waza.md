# RFC (案): empirical-prompt-tuning 方法論を waza に encode する

> Status: draft / 内部レビュー用 (英訳して upstream に投稿する前段)
> Author: mizchi
> Reference impl: [mizchi/skills@4f7cb28](https://github.com/mizchi/skills/tree/4f7cb28/evals)
> Related upstream issues: #66 (Waza Platform Roadmap), #187 (tool_calls grader, closed precedent for new grader types), #223 (HeuristicScorer body coverage), #225 (VS Code custom agent executor)

## 背景

waza は declarative YAML + CLI で agent skill の eval suite を実行・記録する framework として既に完成度が高い:

- `eval.yaml` + `tasks/*.yaml` の schema
- `text` / `code` grader と `weight + threshold` ベースの metric
- `mock` / `copilot-sdk` の executor 抽象 (`internal/execution/engine.go::AgentEngine`)
- `waza quality` (LLM-as-Judge で SKILL.md 全体を 5 dimension scoring)
- `waza dev` (frontmatter compliance を iter で改善)

一方で **「judgment policy 層」** ── どう判定し、どう iterate し、いつ stop するか ── は schema に encode されていない。

`empirical-prompt-tuning` (mizchi/skills 内の skill) は、prompt / skill を iterative に改善する運用 policy を持つ:

1. **二方向評価**: executor の self-report + instruction-side metrics
2. **Phase trace**: Understanding / Planning / Execution / Formatting で失敗を tag
3. **Failure pattern ledger**: cross-iter で General Fix Rule を class 化、再発検知
4. **Convergence**: 2 連続 0-unclear で stop
5. **Divergence signal**: 3+ iter non-decreasing で「patch 続行ではなく rewrite」のシグナル

mizchi/skills の自前 Deno runner で waza schema 互換のまま (1)-(5) を実装し、scenario A (TS+Playwright+Cloudflare の skill-selector init) を実 LLM で 2 iter 回して convergence 検知まで動かした。実装と log は [evals/runner/run.ts](./run.ts)。

本 RFC ではこの 5 機能を waza upstream に取り込む sub-proposal を 4 つに分解して提案する。

---

## Sub-proposal 1: `type: llm` grader (LLM-as-Judge を grader API に開放)

### 動機

`text` / `code` grader は output の surface-level assertion しかできない。例えば「`apm-usage` という skill 名が言及されているか」は code grader で書けるが、「`apm install` / `apm view` の言及で apm-usage を読む前提が暗黙に示されているか」のような **semantic equivalence** は判定できない。

waza には既に `waza quality` (LLM-as-Judge で SKILL.md 全体を score) があり、judge call の内部実装が存在する。これを **per-task grader API** として開放すれば、grader 種別 1 つの追加で大半の semantic 判定が表現できる。

### Schema 提案

```yaml
graders:
  - name: critical_skills_semantic
    type: llm
    config:
      rubric: |
        deliverable は次の N 項目をすべて満たしているか?
        1. Playwright E2E に対応する skill が提案されている
        2. Cloudflare Pages / Workers の deploy skill が提案されている
        ...
        すべて満たすときのみ PASS: yes
      model: claude-sonnet-4-6        # optional. default は eval.config.model
      pass_threshold: 0.7              # optional. SCORE が threshold 以上なら pass
```

Judge への期待する response 形式 (parser):

```
PASS: yes
SCORE: 88
REASON: <一文>
```

### 実装スケッチ

- `internal/graders/llm.go` に新 grader 実装
- prompt template: rubric + 評価対象 output → 上記 3 行 format で回答
- `internal/quality/` の copilot-sdk judge 呼び出しを共有
- `eval.schema.json` の `graders[].type` enum に `"llm"` を追加

### 互換性

- 新 type 追加のみ。既存 eval.yaml には影響なし

### Caveat

LLM 判定は run-by-run で variance が出る。検証実装で同一 scenario を iter 1 / iter 2 で実行したところ judge score が `0.88 → 0.72` になった。これは LLM の non-determinism + position bias で empirical-prompt-tuning が `Pairwise-comparison caveat` として警告している既知の現象。

→ docs に「multiple-run aggregate を推奨」「直接 A vs B を judge に問わない (objective 軸でのみ比較する)」を明記すべき。

---

## Sub-proposal 2: `type: self-report` grader (二方向評価の schema 化)

### 動機

empirical-prompt-tuning の最大の発見は **「executor 自身に structured self-report を書かせて grader で評価する」** こと。waza の grader はすべて instruction-side で、executor 視点の `Unclear points` `Phase trace` `Discretionary fill-ins` `Retries` は取れない。

これらが取れると以下が可能になる:

- 「instruction の何が曖昧だったか」を executor 視点で記録 (instruction-side からは死角)
- 失敗の root cause を Understanding / Planning / Execution / Formatting で tag → fix を phase-local に当てる原則 (skill body の上部に caveat 追加 vs 末尾に template 追加など、修正位置の判断軸になる)
- General Fix Rule を class 化して累積 (Sub-proposal 3 の前提)

### Schema 提案

```yaml
# task.yaml
expected:
  require_self_report: true   # default true. executor prompt 末尾に self-report 要求が automatic に注入される

graders:
  - name: self_report_complete
    type: self-report
    config:
      require_present: true            # default true
      require_all_phases_ok: true      # 全 4 phase が "OK" であることを要求
      max_unclear: 0                   # unclear points が 0 件であることを要求
      max_retries: 2                   # retries が threshold 以下であることを要求
```

executor が output 末尾に書く template (runner が prompt 末尾に注入):

```
## Self-report

### Phase trace
- Understanding: OK
- Planning: OK
- Execution: OK
- Formatting: OK
(stuck の場合は "stuck: <一行 reason>")

### Unclear points
(none)
(または、)
1. Issue: <observable に何が起きたか>
   Cause: <instruction-level 診断>
   General Fix Rule: <class-level rule、spot-fix ではなく>

### Discretionary fill-ins
(none)
(または "- bullet")

### Retries
0 (または integer)
```

### 実装スケッチ

- `internal/runner` で `expected.require_self_report` が true のとき user prompt 末尾に template を注入
- `internal/graders/selfreport.go`:
  - extractor: output から `## Self-report` セクションを切り出し、各サブセクションを parse
  - grader: 設定された threshold に対する pass/fail
- `TaskResult` に `SelfReport` struct を追加し JSONL output に含める

### 互換性

- 新 grader type + `expected.require_self_report` (新 field)
- 既存 eval は `require_self_report` 未指定 → 機能 off で互換

---

## Sub-proposal 3: `waza iterate` sub-command + `ledger.yaml`

### 動機

waza には `waza dev` (frontmatter only) はあるが、eval suite 全体に対する iteration loop はない。

empirical-prompt-tuning は RED/GREEN/REFACTOR cycle を運用基準として持ち、各 iter で executor の unclear points を General Fix Rule として class 化、cross-iter で **同 class の再発** を検知する (Failure pattern ledger)。これは「同じ修正を繰り返してるのに改善しない」場合のシグナルになり、結果として **iter ごとの判断 cost を下げる**。

### CLI 提案

```bash
waza iterate <eval.yaml> [--max N] [--task ID] [--stop-on convergence|divergence]
```

### `ledger.yaml` schema (per-eval、`evals/<skill>/ledger.yaml`)

```yaml
eval: skill-selector-eval
skill: skill-selector
patterns:
  - rule: "<General Fix Rule の文>"
    seen_in: [1, 3, 5]                       # iter 番号
    representative_issue: "<最初に観測された Issue 文>"
iterations:
  - iter: 1
    timestamp: 2026-05-09T...
    overall_pass_rate: 0.875
    new_unclear_count: 2
    reseen_count: 0
    total_unclear: 2
    new_rules: ["<rule文>", ...]
    reseen_rules: []
  - iter: 2
    ...
```

### 実装スケッチ

各 iter で:

1. eval を 1 回 run (既存の `waza run` を関数化して呼ぶ)
2. 全 task の `self_report.unclearPoints` を集計
3. ledger の `patterns` と rule 文字列で match → `new` / `reseen` に分類
4. ledger に append し yaml で persist
5. stop conditions:
   - max iter reached → CAPPED
   - 2 連続 `new_unclear_count == 0` → CONVERGED
   - 3+ iter で `new_unclear_count` 非減少 → DIVERGENCE-SIGNAL (early exit、メッセージ「patch ではなく rewrite」)

### 互換性

- 新 sub-command。既存 command に影響なし
- `ledger.yaml` は per-eval で隔離。`.gitignore` 推奨で個別判断 (track するなら `git add -f`)

### Open questions

- `ledger.patterns` の rule 文字列マッチを **strict** (trim + lowercase) か **fuzzy** (LLM-based clustering) か
  - 検証実装は strict (overly conservative; ほぼ別 rule として扱われる)
  - fuzzy は精度上がるが LLM cost 追加。trade-off は要議論
- `ledger.yaml` の永続化を repo に commit する慣習にするか
  - cumulative knowledge として価値あり
  - 一方で executor の output が含まれないとは言え team 全体に noise になる可能性

---

## Sub-proposal 4: Stop-condition signals (Convergence / Divergence)

### 動機

waza は単発 run の score を返すだけで、「もう 1 回 iterate するか / ship するか / rewrite するか」の運用 policy がない。

empirical-prompt-tuning は次の判定 policy を持つ:

| signal | 条件 | 推奨アクション |
|---|---|---|
| **Convergence** | 2 連続 0-unclear iteration | stop (ship) |
| **Divergence** | 3+ iter で `new_unclear_count` 非減少 | structure rewrite (patch しても効かない signal) |
| **Resource cutoff** | 重要度 vs 改善 cost の balance | "ship at 80 pts" |

これらは **judgment policy** なので「framework 側が強制」より「flag で opt-in」が筋が良い。

### Implementation

Sub-proposal 3 の `waza iterate` 内に組み込み:

- `--stop-on convergence` (default)
- `--stop-on divergence` (divergence signal で early exit)
- `--max N` (resource cutoff、上限)

### Open questions

- threshold (2 連続 / 3 連続) を config 化すべきか? CLI flag だけで足りるか?
- divergence の検知ロジックは `new_unclear_count` だけでなく `overall_pass_rate` の trend も見るべきか?

---

## Prior art (隣接フレームワークとの差分)

| Framework | 同等の概念 | 差分 |
|---|---|---|
| **Promptfoo** (TS CLI) | declarative YAML, LLM-as-Judge grader | iteration loop / cross-iter ledger なし。executor self-report の structured extraction なし |
| **OpenAI evals** (Python) | YAML eval suite, grader 抽象 | iter loop なし。LLM judge は ad-hoc |
| **Inspect AI** (UK AISI / Anthropic) | declarative task + scorer + dataset | self-report に近い `model_output.metadata` はあるが「executor 自身に structured self-report を要求して grade する」という運用は無い。eval-time の variant exploration は対応 |
| **DeepEval** (Python) | metrics 多数 (G-Eval, Hallucination etc) | LLM-as-Judge は手厚いが iter loop は限定的、ledger 概念なし |
| **LangSmith** (commercial) | dataset + run + evaluator | iter loop あり、ただし general-purpose tracing 寄りで「instruction を iterative に改善する」ことが主眼ではない |

新規性が高い 2 点:

1. **二方向評価の schema 化** — executor 自身に Phase trace + Unclear points (Issue / Cause / General Fix Rule) + Discretionary fill-ins + Retries を fixed schema で書かせて grader に通す運用は、ここまで explicit に schema-encode した例を見かけない。
2. **Failure pattern ledger** — cross-iter で General Fix Rule を class 化して再発検知し、`new_unclear_count` の trend で convergence / divergence を判定する仕組みも明示的な前例が薄い。

`type: llm` grader 自体は Promptfoo / Inspect AI 等で確立済の機能で、waza の `quality` command を grader API に開放する「最小新規性」の追加と位置付けられる。これが上記 1, 2 を前提機能として支える。

## 推奨 merge 順 (PR 戦略)

waza maintainer の負荷を考慮して、scope の小さい順に分割して PR を出す:

| 順 | Proposal | 規模 | 依存 |
|---|---|---|---|
| 1 | **Sub-proposal 1**: `type: llm` grader | 小 | `internal/quality` の judge 実装を grader API に開放 (内部実装は既存) |
| 2 | **Sub-proposal 2**: `type: self-report` grader | 中 | 新 schema field + extractor + grader |
| 3 | **Sub-proposal 3 + 4**: `waza iterate` + ledger + signals | 大 | 上記 2 つを前提 (self-report が unclear points の source) |

事前に **RFC issue** を 1 本立てて議論 → 合意取れた sub-proposal から PR を分けて出すのが現実的。

## 検証実装からのフィードバック

- mizchi/skills@4f7cb28 で 4 機能すべて Deno で実装済 ([evals/runner/run.ts](./run.ts))
- 実 LLM run で動作確認:
  - single run: 8 grader 中 7 pass (87.5%)
  - iterate (max=2) で 2 連続 0-unclear → CONVERGED 検知
  - LLM judge の iter 間スコア変動 (0.88 → 0.72) を観測 → `Pairwise-comparison caveat` の妥当性が**データで出た**
- `paths.skills: .` (root scan) で mizchi/skills の flat layout (`<repo>/<skill>/SKILL.md`) も問題なく動作
- argv が長くなる場合は stdin pipe にすると安定 (executor 抽象が外部 process 経由ならこれが標準)

## 参考実装の location

- runner: `mizchi/skills:evals/runner/run.ts`
- 例 eval: `mizchi/skills:evals/skill-selector/{eval.yaml,tasks/scenario-{a,b}.yaml}`
- ledger 出力例: `evals/skill-selector/ledger.yaml` (gitignore default)
- commit: <https://github.com/mizchi/skills/commit/4f7cb28>
