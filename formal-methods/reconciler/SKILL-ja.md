---
name: formal-methods-reconciler
description: 形式手法を使って、ソフトウェアの仕様、ドキュメント、テスト、設定、コード、ログ、インシデントを突き合わせるときに使う。Codex が主張を抽出し、ドキュメントと実装のどちらを真実の源にするかを決め、Z3、Alloy、TLA+、P、Dafny、MoonBit prove、Lean、Rocq、Why3、Verus、CBMC、Tamarin、ProVerif などから適切な道具を選び、最小限の有用なモデルを作り、検証器の実行または実行計画を立て、SAT/UNSAT、trace、証明失敗、proof obligation をドメインの言葉での確認質問と回帰ガードに翻訳する。
---

# Formal Methods Reconciler

この skill は、曖昧な正しさの懸念を、小さな形式手法チェックとドメインの人間が読める判断記録に変換するために使う。

基本姿勢: LLM は候補モデルを提案し修復する。正しさを判定するのは solver、model checker、verifier、proof assistant である。最終結果は、人間が判断できるようにドメインの言葉へ戻す。

これは初回モデル化と突き合わせ用の skill である。すでに有用な形式モデル、
CI verifier、期待 result、または lock 済み domain decision があり、その後の
spec/code/log 変更と揃え続けるタスクなら `formal-methods-drift-guard` に切り替える。

## Workflow

1. **真実の源を選ぶ。**
   - 信頼できる仕様、ドキュメント、ADR、API contract がある場合は、それを期待契約として扱い、コードを照合対象にする。
   - 仕様が無い、または信頼できない場合は、コード、テスト、設定、ログを de-facto behavior として扱う。ただし自動的に正しいとはみなさない。
   - 両者が食い違う場合は、一人で決めない。ドメイン質問を作る。

2. **ツールを選ぶ前に主張を抽出する。**
   - 宣言された intent と暗黙の挙動を分ける。
   - 主張は allowed、forbidden、eventually happens、never happens、equivalent、reachable、unreachable、preserves invariant として抽出する。
   - empty、missing、error、timeout、retry、crash の挙動を明示的に記録する。

3. **問いの形を分類する。**
   - Pure predicate: `input -> Bool`。
   - Relation: user、role、resource、tenant、ownership、graph。
   - State transition: lifecycle、retry、crash、queue、eventual。
   - Message protocol: actor、typed event、request/response schedule。
   - Sequential code contract: pre/postcondition、loop invariant、representation invariant。
   - Universal theorem: unbounded inductive property、または永続的な数学的法則。
   - Security protocol: adversarial message system、secrecy、authentication。

4. **最小で適切なツールを選ぶ。**
   - ツール選定が自明でない場合は `references/tool-selection.md` を読む。
   - 有用な反例を出せる最小のモデルを優先する。
   - 速い config バグ探しに Lean/Rocq を使わない。時間的 interleaving に Z3 を使わない。単純な述語整合性に TLA+ を使わない。

5. **最小モデルを作る。**
   - その性質を定義していない限り、I/O、framework、database、UI は削る。
   - 対象の主張に必要な observable value、state variable、action、relation、invariant だけをモデル化する。
   - 強すぎるモデルを検出するため、positive sanity case を入れる。
   - 可能なら broken variant を入れ、チェックが load-bearing であることを示す。

6. **verifier feedback loop を回す。**
   - compiler、verifier、model checker の出力を修復 oracle として使う。
   - まず syntax error と modeling mistake を直す。
   - ドメイン判断が変わっていない限り、緑にするためだけに property を弱めない。
   - 反例はドメインレビュー用の witness として保存する。

7. **結果をドメインの言葉へ翻訳する。**
   - `sat`、`unsat`、trace、proof failure で止めない。
   - 誰が何をできるのか、どの順序が受理されるのか、どの config が dead なのか、どの crash sequence がデータを失うのかを述べる。
   - 出力テンプレートには `references/domain-ledger.md` を使う。

8. **決定を lock する。**
   - 反例が意図通りなら、docs/specs を更新し、明確化した挙動の regression guard を追加する。
   - 意図していないなら、bug として file/fix し、model/check を CI に残す。
   - 不明なら、最小 witness と domain-owner question を出す。

## Reporting Discipline

ドメイン上の不確実性と、実行上の不確実性を分ける。

- Domain question は成果物の一部である。未記載の empty value、missing fail-mode definition、product-policy choice、spec/code disagreement など、owner decision が必要なものは domain question として扱う。
- Self-report unclear point は、この skill を正しく適用する妨げになったものだけに使う。たとえば repository access が無い、参照ファイルが読めない、user scope が曖昧、明示的に実行を求められた verifier が実行できない、など。
- 意図的に残した domain question を self-report unclear point にしない。ledger/domain-question section に置く。
- ユーザーが model/check plan を求めており、runnable repo や verifier runtime を与えていない場合は、正確な check plan を立てれば十分。trace や SAT/UNSAT 予想は planned/hand-derived であり machine-confirmed ではないと明示し、実行していないことを unclear point として数えない。
- ユーザーが verifier の実行を明示的に求め、かつそれが利用できない場合は、self-report unclear point または task blocker として記録する。

## LLM Role Boundary

LLM を使ってよいもの:

- claim extraction
- tool selection
- first-pass formalization
- counterexample explanation
- repair proposal
- domain-language wording

LLM を使ってはいけないもの:

- correctness の source of truth
- proof の final judge
- solver/model-checker/prover output の代替
- domain-owner decision の代替

## Research-Informed Patterns

自動化 workflow を設計または改善するときは `references/research-patterns.md` を読む。次を優先する。

- formal code generation の前に structured planning を行う
- verifier-guided repair loop を使う
- repository-level work では repo context の retrieval を使う
- generated annotation には test/log/trace oracle を使う
- theorem proving では subgoal decomposition を使う
- すべての claim に epistemic status を明示する

## Output Contract

常に、次のいずれかの成果物を残すことを目指す。

- repo 内の formal check と passing/failing command
- ドメイン用語に翻訳した counterexample witness
- regression guard candidate
- 簡潔な ledger entry: source、implementation observation、model question、machine result、domain question、decision、lock

形式モデルを作る価値がない場合は、その理由を述べ、より安い check を提案する。
