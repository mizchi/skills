---
name: formal-methods-drift-guard
description: 形式モデルや検証 CI がすでに存在し、それを継続運用したいときに使う。Codex が仕様/ドキュメント、実装コード/テスト/設定/ログ、形式モデル/CI チェックを比較して drift を見つけ、drift が仕様、コード、モデル抽象、ハーネス、未解決のドメイン判断のどこにあるかを分類し、検証器の実行または実行計画を立て、SAT/UNSAT の変化、反例 trace、証明失敗、古くなったモデル、CI 結果をドメインの言葉での確認質問と台帳に翻訳する。
---

# Formal Methods Drift Guard

この skill は、すでにモデルや検証チェックがあるチームが、
プロダクト変更に合わせて `仕様 -> コード -> モデル` を維持するために使う。

初回のモデル化用 skill ではない。まだ有用なモデルが無いなら、
先に `formal-methods-reconciler` を使う。この skill は、Z3 / Alloy / TLA+
/ P / Dafny / MoonBit / Lean / Rocq などのチェック、CI の verifier job、
モデル台帳、または過去に lock したドメイン判断がある前提で始める。
初回の claim 抽出、tool selection、initial model design には
`formal-methods-reconciler` を使い、継続的な drift maintenance にはこの
skill を使う。

## 基本ルール

property を黙って弱めて緑にしない。

赤いチェック、古くなった claim、source mapping の欠落、witness の変化は
すべて drift signal として扱う。修正案を出す前に、必ずドメインの言葉へ戻す。

## Workflow

1. **三面の棚卸しを作る。**
   - 仕様側: docs、ADR、API contract、product rule、threat model、
     runbook、incident decision。
   - コード側: 実装、テスト、config、schema、migration、ログ、telemetry、trace。
   - モデル側: formal file、harness script、期待 SAT/UNSAT assertion、
     CI workflow、tool version pin、過去の ledger decision。
   - claim ID が無ければ `AUTHZ-SETTINGS-001` のような安定 ID を付ける。

2. **各 claim を三面に対応付ける。**
   - expected domain claim: 業務ルールとして何が成り立つべきか。
   - implementation observation: 現在の code/config/log が何をしているか。
   - model property: predicate、invariant、reachability、liveness、theorem、
     proof obligation のどれで表現しているか。
   - check command: その結果を決めるコマンドまたは CI job。
   - domain rule が model より細かい粒度になった場合、それを executor
     uncertainty として扱わない。`Reachable(Settings)` を `settings:read` と
     `settings:write` に分けるのか、単一 state + capability relation にするのかを、
     model/domain question として台帳に書く。owner が新しい抽象を受け入れるまで、
     旧 coarse property は `model-drift` または `coverage-gap` として扱う。

3. **安い drift check から走らせる。**
   - text/code diff: 関連 path の docs、code、model、fixture、expected result が変わったか。
   - harness check: model check が pinned tool で CI 実行されているか。
   - result check: 期待する `SAT`、`UNSAT`、trace shape、proof success、
     proof obligation count が変わったか。
   - coverage check: spec claim に model が無い、または model property に生きた
     domain claim が無い状態になっていないか。
   - trace/log replay: ログがあるなら、実 trace がまだ model に refine されるか。

4. **修正前に drift を分類する。**

   | Drift class | 意味 | 次の行動 |
   | --- | --- | --- |
   | `spec-drift` | docs/domain rule が変わったが model または code が追従していない | model/code/両方を直すか確認 |
   | `code-drift` | lock 済み model は同じなのに code/config の挙動が変わった | domain owner が認めるまで regression と扱う |
   | `model-drift` | model が受け入れ済み domain rule や実装境界を表していない | domain review 付きで model abstraction を更新 |
   | `harness-drift` | tool version、CI、fixture、expected parser、path filter が壊れた | property を変えずに harness を直す |
   | `decision-drift` | 過去の domain decision が曖昧化または矛盾した | domain question を再オープン |
   | `coverage-gap` | claim が一面にしか存在しない | model/docs/tests/明示的 non-goal を追加 |

   primary drift class は 1 つ選ぶ。基準は「どの surface が現在の accepted
   domain rule から外れているか」であり、「どの surface が先に変わったか」
   ではない。docs と code が新しい受理済みルールに同時に動き、model だけが
   古いルールを encode しているなら、primary は `model-drift` とし、
   spec/code の変更は driver として注記する。code だけが動き、docs と model が
   まだ受理済みルールを encode しているなら `code-drift` とする。副次要因は
   notes に書いてよいが、複数の primary class を並べて修正先を曖昧にしない。

5. **機械結果をドメイン語へ翻訳する。**
   - 誰が何をできるのか、どの順序が受理されるのか、どの config が dead か、
     どの状態に到達するのか、どの crash/retry sequence がデータを失うのかを書く。
   - drift の原因になった変更条件を含める。新しい docs rule、変更された route guard、
     enum、config default、新 event、tool version、新 trace など。
   - `SAT`、`UNSAT`、`proof failed`、`CI red` だけで報告しない。

6. **owner と修正先を決める。**
   - spec が正しく code が drift したなら、code を直して model check を残す。
   - code が意図通りで spec が古いなら、spec を直して model を調整する。
   - model abstraction が古いなら、domain claim を保ったまま model を更新する。
   - harness が壊れたなら、CI/script/pin を直し、domain text は変えない。
   - 未解決なら、witness を保存して domain owner への質問を出す。

7. **維持ループを lock する。**
   - model check を CI に残し、機械可読な exit code を返す。
   - 関連する spec/code/model を触る PR で正しい check が走るよう path filter を置く。
   - claim ごとに ledger entry を持ち、domain decision が変わったら更新する。
   - SAT/UNSAT や trace shape は expected-result file にしてレビュー可能にする。

## Output Contract

怪しい claim ごとに、次の台帳を出す。

```text
claim_id:
source_of_truth:
spec_delta:
code_delta:
model_delta:
check_command:
previous_machine_result:
current_machine_result:
drift_class:
witness:
domain_wording:
domain_question:
recommended_fix_target:
lock_update:
epistemic_status:
```

テンプレートと例は `references/drift-ledger.md` を使う。

## Reporting Discipline

- machine result と推測を分ける。`machine-confirmed`、`log-confirmed`、
  `diff-inferred`、`not-run` を明示する。
- 失敗コマンドや CI URL があるなら保存する。
- domain uncertainty を self-report uncertainty に混ぜない。domain decision が
  無いことは成果物であり、この skill の失敗ではない。
- model granularity の選択は、成果物で domain question として表現できるなら
  self-report unclear point にしない。この skill を適用できない場合だけ self-report
  を使い、model の抽象変更に review が必要な場合は ledger に書く。
- verifier/check が明示的に未実行で、タスクが drift ledger を出すことなら、
  それを self-report unclear point にしない。`current_machine_result: not-run` として
  記録し、利用可能な証拠を `diff-inferred` / `log-confirmed` として分け、
  実行すべき check を `lock_update` に書く。ユーザーが verifier 実行を明示的に求め、
  その実行が失敗または不可能だった場合だけ self-report に置く。
- model が赤いだけで古いと決めない。まず何が変わったか、その変更が意図かを問う。
- verifier、trace-checker、test、明示 replay が確認していない限り、
  implementation が model を refine しているとは言わない。

## Common Cases

- **Authz docs changed:** docs 上で role 例外が追加された。Alloy/Z3/P の route model
  と code guard が一致するか確認し、witness を「role X が flag Z の下で screen Y に
  到達できる/できない」と翻訳する。
- **Config default changed:** empty allowlist が「全員」から「誰も許可しない」に明確化された。
  Z3 config validator と live config を確認し、dead config や新しく開いた config を
  campaign の言葉で説明する。
- **Protocol event added:** retry/timeout event が追加された。TLA+/P model の遷移が古くないか確認し、
  trace を duplicate charge、lost ack、stuck job、stale read として説明する。
- **CI pin changed:** solver/prover version により output format や proof obligation が変わった。
  semantic result が変わっていなければ `harness-drift` と分類する。
- **Incident found a real trace:** incident trace を model に replay する。受理されたなら
  model が incident を許しており、契約を強める必要がある。拒否されたなら
  model/code gap を調べる。
