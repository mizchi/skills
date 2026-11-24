---
name: formal-methods-reconciler
description: 形式手法を使って、ソフトウェアの仕様、ドキュメント、テスト、設定、コード、ログ、インシデントを突き合わせるとき、または Lean、TLA+、Alloy、Z3 などで「バグがないことを検証して」と頼まれたときに使う。コードから推測したオラクルではなく、利用者が確認したバグの種類から始め、ドキュメントと実装のどちらを真実の源にするかを決め、Z3、Alloy、TLA+、P、Dafny、MoonBit prove、Lean、Rocq、Why3、Verus、CBMC、Tamarin、ProVerif などから道具を選び、前提を書き出した最小のモデルを作り、空虚な証明と sorry/axiom による逃げを排除し、どのバグの種類を検知できるかを mutant で測り、モデルの忠実さを試験し、各主張をオラクル・範囲・方法つきでドメインの言葉で報告する。
---

# Formal Methods Reconciler

この skill は、曖昧な正しさの懸念を、小さな形式手法チェックとドメインの人間が読める判断記録に変換するために使う。

基本姿勢: LLM は候補モデルを提案し修復する。正しさを判定するのは solver、model checker、verifier、proof assistant である。最終結果は、人間が判断できるようにドメインの言葉へ戻す。

最大の失敗は、利用者が得たと思っている保証範囲と、検査が実際に与える保証範囲のずれである。道具の判定は、その周りの 3 つ以上には強くならない。それぞれに下の手順がある。

- **オラクル** — 何をバグとみなすか。誰も書かなければ、エージェントはコードとテストから推測する。推測したオラクルはたいてい緩すぎる（実装自身のバグを正解として受け入れる）。手順 1 と 3。
- **感度** — 検査が実際にどのバグを捕まえるか。mutant で測る。手順 8。
- **忠実さ** — モデルと環境の前提（公平性、定数、他のシステム）が、実物のあらゆる振る舞いを含んでいるか。実物より狭いモデルはバグを見落とし、広いモデルは誤検知を増やすだけである。手順 6 と 9。

背景と根拠になった実験: `references/oracle-sensitivity-fidelity.md`。

これは初回モデル化と突き合わせ用の skill である。すでに有用な形式モデル、
CI verifier、期待 result、または lock 済み domain decision があり、その後の
spec/code/log 変更と揃え続けるタスクなら `formal-methods-drift-guard` に切り替える。

## Workflow

1. **最初にバグの種類を挙げる（オラクルの言語化）。**
   - モデル化の前に、検査で捕まえるべきバグや脆弱性の種類を列挙する。利用者に聞くか、`references/oracle-sensitivity-fidelity.md` の観点（品質特性、安全性と活性、CWE の Pillar、OWASP Top 10）から候補を出して確認してもらう。「このリポジトリにバグがないことを証明して」はオラクルを何も指定していない。黙って作らない。
   - 依頼がすでに具体的な懸念を挙げているなら（「viewer が別テナントのプロジェクトを読めるか」「リトライは冪等か」）、その懸念がバグの種類である。記録して先に進む。確認できる相手がいない場面（eval、subagent、無人の実行）では、候補を書き出して**提案のみ・未確認**と明記し、先に進む。止まって待たない。
   - 品質目標（どの種類なら未検証のまま残してよいか）を記録する。後で下げることになりうる。下げたときはそう書く。
   - 思いつかなかった種類は何にも守られていない。最終報告でそれを明記する。

2. **真実の源を選ぶ。**
   - 信頼できる仕様、ドキュメント、ADR、API contract がある場合は、それを期待契約として扱い、コードを照合対象にする。
   - 仕様が無い、または信頼できない場合は、コード、テスト、設定、ログを de-facto behavior として扱う。ただし自動的に正しいとはみなさない。そこから作ったオラクルは**推測**であり、使う場所すべてでそう明記する。
   - 両者が食い違う場合は、自分だけで決めない。ドメイン質問を作る。

3. **主張を抽出し、検査が何をバグとみなすかを確認する。**
   - 明示された意図と暗黙の振る舞いを分ける。
   - 主張を allowed、forbidden、eventually happens、never happens、equivalent、reachable、unreachable、preserves invariant の形で抽出する。安全性（悪いことが決して起きない）と活性（良いことがいつか起きる）に分ける。この 2 つで無限列の任意の性質を表せる。
   - empty、missing、error、timeout、retry、crash の振る舞いを明示する。
   - 手順 1 の種類ごとに、検査が何をバグとみなすかをドメインの言葉で説明し、2 つの方法で確かめる。利用者がバグだ／バグでないと合意する具体的な入力と、オラクルから導かれるはずの性質の反例探索（`add` なら交換律、`x + 0 = x`、結合律）。厳しすぎるオラクルは意図した振る舞いを拒み、緩すぎるオラクルはバグを通す。

4. **問いの形を分類する。**
   - Pure predicate: input -> Bool.
   - Relation: user/role/resource/tenant/ownership/graph.
   - State transition: lifecycle, retry, crash, queue, eventual.
   - Message protocol: actors, typed events, request/response schedules.
   - Sequential code contract: pre/postconditions, loop invariants, representation invariants.
   - Universal theorem: unbounded inductive property or durable mathematical law.
   - Security protocol: adversarial message system, secrecy, authentication.

5. **最小で適切な道具を選ぶ。**
   - 道具の選択が自明でない場合は `references/tool-selection.md` を読む。
   - 有用な counterexample を出せる最小のモデルを優先する。
   - 速い設定バグ探索に Lean/Rocq を使わない。時間的な interleaving に Z3 を使わない。単純な predicate の整合性に TLA+ を使わない。
   - 利用者が名指しした道具は好みであって、適合の確認ではない。問いの形に別の道具が必要ならそう言う。参照先の実験では、Lean を指定した試行は「形式手法で」とだけ指示した試行よりカバーするバグの種類が狭かった（各 3 回、入っていた道具の違いと切り分けていない）。

6. **最小モデルを作り、その前提を書き出す。**
   - property を定義しない限り、I/O、framework、database、UI は取り除く。
   - claim に必要な observable value、state variable、action、relation、invariant だけをモデル化する。
   - 強すぎるモデルを捕まえるため、positive sanity case を入れる。
   - 環境の前提をすべて列挙する。定数、上限（Alloy の小スコープ、有限の入力長）、公平性、他のシステムの振る舞い。公平性と上限は検査する振る舞いを狭める。公平性のもとで示した活性は、実際のスケジューラが公平なときにしか成り立たない。

7. **検証器の feedback loop を回し、空虚な成功を排除する。**
   - compiler、verifier、model checker の出力を修復の oracle として使う。
   - まず syntax と modeling の誤りを直す。
   - ドメイン判断が変わっていない限り、green にするためだけに property を弱めない。
   - counterexample はドメインレビュー用の witness として保存する。
   - 矛盾した前提や恒偽の前提からは何でも証明できる。前提だけで充足可能かを確かめる（Z3: 前提だけで `check-sat`、Alloy: property なしで facts を `run` してインスタンスを得る、TLA+: invariant が言及する状態に到達する振る舞いがあることを確かめる）。
   - `scripts/check_proof_escapes.py <root>` を実行する。`sorry`、`admit`、`axiom`、`Admitted`、`axiomatization`、Dafny の `assume` / `{:axiom}`、Verus の `assume(` / `external_body`、F* の `admit`、Agda の `postulate` で fail する。エージェントは `sorry` だけでなく、公理を足して証明を通すこともある。Lean では報告するすべての定理に `#print axioms <theorem>` も実行する。

8. **mutant で感度を測る。**
   - 手順 1 の種類ごとに、その種類のバグを 1 つだけ埋め込んだ実装の変種（まだコードがないなら設計の変種）を作る。使う前に、各変種が本当にその種類のバグかを確かめる。
   - 同じ検査をすべての変種に実行する。その種類が**検知できる**のは、どの変種でも、元にはない counterexample、証明の失敗、または再現テストの失敗が出たときだけである。
   - 検知できない種類は、制限時間内に検査かオラクルを直して実行し直す。証明は、偽なのか、証明できないのか、まだ終わっていないだけなのかを教えないまま開き続けることがあるので、試行を終わらせるのは制限時間である。時間切れになったら、その種類を**未検証**とし、別の捕まえ方を探すか品質目標を下げる。

9. **witness を実装で再現する。**
   - モデルの counterexample はモデルについての主張であり、まだコードについての主張ではない。
   - witness を強制する実装のテストを書く。同じ入力、同じ relation instance、あるいはバリア・故意のクラッシュ・止めた時計で作る同じ interleaving を使う。
   - テストが同じように失敗すれば、witness は実際のバグであり、そのテストが回帰ガードになる。
   - 修正後の変種も実装で実行する。モデルが green であることも、モデルについての主張にすぎない。
   - 実装とモデルがどちらの方向に食い違っても、まずモデルのバグを疑う。実行環境と異なる前提（分離レベル、ロックの意味論、リトライ方針、プロバイダの保証）を見直し、モデルを直して両方を実行し直す。
   - モデルが小さく信頼できるなら、テストの oracle として残す。モデルの witness や model checker の trace を実装のテストケースとして再生するか、実行可能なモデルと実装の差分を取る。
   - 忠実さは逆方向にも試験する。実物から trace（ログ、E2E の実行）を取り、モデルがそれを受理するかを確かめる（trace validation）。モデルが拒む実物の trace は、モデルが取りこぼした振る舞いである。

10. **結果をドメインの言葉に翻訳する。**
    - `sat`、`unsat`、trace、proof failure で止めない。
    - 誰が何をできるか、どの順序が受理されるか、どの設定が死んでいるか、どの crash sequence がデータを失うかを言う。
    - 出力テンプレートには `references/domain-ledger.md` を使う。

11. **判断を lock する。**
    - counterexample が意図通りなら、docs/specs を更新し、明確化した挙動の回帰ガードを追加する。
    - 意図通りでないなら、bug を起票または修正し、model/check を CI に残す。
    - 不明確なら、最小 witness とドメインオーナーへの質問を作る。

## Reporting Discipline

**どの主張も、同じ文の中に自分の範囲を持たせる。** 主張だけ読んで止めた読者が、確かめた以上のことを信じてはならない。参照先の実験では、エージェントは実際の限界をメッセージのどこかには書いていたが、個々の文では、小さな字句の集合から作った短い入力だけの検査について「どの入力でも成り立つ」と言ったり、「関数は純粋である」「Lean のモデルはコードを写している」を何も試さずに言い切ったりしていた。「成り立つ」「証明した」「バグである」「検知できる」のそれぞれに、次を書く。

- **oracle**: 利用者が与えた / 名前を挙げた文書から取った / コードから推測した
- **scope**: 上限なし、または正確な上限（入力長 ≤ 3、プロセス 4 個、Alloy のスコープ 5）
- **method**: 機械検証（道具とコマンド）/ 有限探索 / 手による論証 / 未確認

手順 1 の種類ごとに、**検知できる**（それを示した mutant つき）か**未検証**で報告する。「バグはない」とひとまとめにしない。何も確かめていないコードやモデルの性質は書かない。確かめるか、前提として列挙する。

ドメインの不確実性と実行上の不確実性を分ける。

- ドメイン質問は成果物の一部である。未記載の empty value、fail-mode 定義の欠落、product-policy の選択、owner の判断が必要な spec/code の食い違いなど。
- self-report の不明点は、この skill を正しく適用する妨げになったものだけにする。たとえば repository へのアクセス不足、参照ファイルが使えない、ユーザーのスコープが曖昧、実行できない verifier など。
- 意図的に残したドメイン質問を self-report の不明点として扱わない。ledger/domain-question セクションに置く。
- ユーザーが model/check plan を求め、実行可能な repo や verifier runtime を渡していない場合は、正確な check の計画で十分である。trace や SAT/UNSAT の期待値は machine-confirmed ではなく planned/hand-derived と明記し、実際に実行していないことを不明点として数えない。
- ユーザーが verifier の実行を明示的に求め、それが利用できない場合は、self-report の不明点または task blocker として記録する。

## LLM Role Boundary

LLM を使ってよい用途:

- 利用者に確認してもらうバグの種類と品質目標の提案
- claim extraction
- mutant を書き、それぞれが何を壊すかを説明すること
- tool selection
- first-pass formalization
- counterexample explanation
- repair proposals
- domain-language wording

LLM を次として使わない:

- 正しさの真実の源
- 証明の最終判定者
- solver/model-checker/prover 出力の代替
- ドメインオーナーの判断の代替
- 利用者が確認していないオラクルの作者

## Research-Informed Patterns

自動化 workflow を設計または改善するときは `references/research-patterns.md` を読む。次を優先する。

- formal code generation の前に structured planning を行う
- verifier-guided repair loop を使う
- repository-level work では repo context の retrieval を使う
- generated annotation には test/log/trace oracle を使う
- theorem proving では subgoal decomposition を使う
- すべての claim に epistemic status を明示する

## Reference Implementations

このワークフローを実際に動く形で示した例は `references/reference-implementations.md` を読む。eval シナリオごとに 1 つずつと、broken variant、sanity case、実装での再現、モデルの前提の修正を示す playground の use case を載せている。

## Output Contract

常に、次のいずれかの成果物を残すことを目指す。

- repo 内の formal check と passing/failing command
- ドメイン用語に翻訳した counterexample witness
- regression guard candidate
- witness を再現する実装のテスト、または再現しなかったことと、どのモデルの前提が誤っていたかの記録
- 簡潔な ledger entry: bug class、oracle source、source、implementation observation、model question、assumptions、machine result、scope、sensitivity、witness、reproduction、domain question、decision、lock
- 種類ごとの表: bug class、検知できる / 未検証、使った mutant、scope、method

形式モデルを作る価値がない場合は、その理由を述べ、より安い check を提案する。

repository が渡されていない場合は、実行できる成果物を一時ディレクトリに書き、パスを列挙し、repository ならどこに置くかを書く。

## 検証しやすく設計する

仕様、設計、コードがまだないなら、検査のコストは払うものではなく選ぶものになる。手順 1 の種類を防ぐにはどんなオラクルがあればよいかを問い、振る舞いを書きやすい表現を選ぶ。合成されたステートマシン、純粋な reducer を持つ単一の store、事前条件と事後条件の組、上限のない算術ではなく小さな有限の領域などである。そのうえでオラクルを書き、例と反例探索で確かめ（手順 3）、実装が育つ前に mutant で測る（手順 8）。既存の自然言語の仕様や場当たり的な状態は、たいてい検査を弱くするか高くする。どちらに当たるかを書く。
