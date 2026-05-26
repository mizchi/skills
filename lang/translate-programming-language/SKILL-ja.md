---
name: translate-programming-language
description: 言語間のサーバー/アプリケーション移植を、挙動互換を保ちながら計画・実行する。モジュール、サービス、API、ランタイムを別言語へ移植する、移植元ランタイムのオラクルと fixture を生成する、移植先テストを生成する、ランタイム/標準ライブラリ/シリアライズ/数値/エンコード/時刻/正規表現/プロトコル差分を検出する、互換レイヤーを作る、移植知見を蓄積する、ベンチマーク・シャドウ・カナリア・切替/ロールバックを計画するときに使う。
---

# Translate Programming Language

本番サーバー/アプリケーションコードを別言語・別ランタイムへ移すとき、外部から観測できる挙動を保つための skill。まず parity を保ち、旧ランタイムが外れた後に移植先言語らしく整理する。

## 原則

- 移植元ランタイムを最初のオラクルにする。ただし標準仕様がある挙動は標準も確認する。
- expected fixture は手書きしない。固定した移植元ランタイム、または標準仕様ベースの harness から生成する。
- 再利用する移植ドキュメントには、ドメイン固有名、URL、schema、顧客名、プロダクト固有情報を書かない。
- 言語/ランタイムの癖は互換レイヤーへ置き、ドメインロジックへ混ぜない。
- 互換レイヤーには削除計画を付ける。移植元挙動、移植先挙動、標準/仕様、呼び出し元、cutover 後の移行先を記録する。
- unit parity だけで判断しない。切替前に shadow/replay traffic と本番形状の benchmark で検証する。

## ワークフロー

1. **移植境界を決める**
   - 関数、モジュール、endpoint、message type、protocol handler など狭い contract を選ぶ。
   - 入力、出力、副作用、状態、時刻、乱数、locale、環境変数、filesystem/network、error 挙動を棚卸しする。
   - contract が byte-exact、構造同値、意味同値のどれかを決める。

2. **オラクルを生成する**
   - [oracle-driven-parity.md](references/oracle-driven-parity.md) を読む。
   - 移植元 runtime と依存バージョンを固定する。
   - 通常ケース、境界値、不正入力、error、副作用について、移植元実装から fixture を生成する。
   - 標準仕様がある場合は標準由来ケースを追加し、移植元/移植先 runtime の差分を記録する。

3. **移植先テストを生成する**
   - [test-migration.md](references/test-migration.md) を読む。
   - 移植元テスト、test name、data provider、例、API contract から移植先 parity test stub を生成する。
   - 未実装 stub は CI で見える状態にし、fixture-driven test に置き換えて skip/pending をゼロにする。
   - 見つかった言語/ランタイム差分ごとに、分岐カバレッジを増やすケースを追加する。

4. **移植ナレッジを蓄積する**
   - [compatibility-knowledge.md](references/compatibility-knowledge.md) を読む。
   - 数値 cast、truthiness、配列/map/order、JSON、URL encode、regex、時刻、crypto、binary protocol、HTTP、例外、並行処理などを catalog 化する。
   - 各差分について、移植元挙動、移植先挙動、標準挙動、採用判断、テスト、削除計画を記録する。

5. **ドメインコードを移植する**
   - leaf/pure module、shared helper、I/O adapter、orchestration/endpoint の順で進める。
   - ドメインコードは移植先言語で読みやすく保ち、legacy の癖は互換 helper に逃がす。
   - ad hoc な文字列処理より、構造化 parser、公式 protocol library、generated code を優先する。
   - parity が証明される前に大きく refactor しない。変更は移植元挙動へ辿れるようにする。

6. **実環境で検証して切り替える**
   - [rollout-and-cutover.md](references/rollout-and-cutover.md) を読む。
   - parity gate、fixture 再生成 check、生成 test drift check、race/static check、benchmark を通す。
   - replay/shadow traffic で response、log、metric、header、binary payload、副作用を比較する。
   - rollback 閾値を明示して段階的に canary し、少なくとも 1 rollback window は旧 runtime を残す。

## Release Gate

次を満たすまで ready と呼ばない:

- オラクル再生成で予期しない fixture diff が出ない。
- 生成された parity-test stub が移植元テスト/contract と同期している。
- pending/skip parity test がゼロ、failure がゼロ。
- 意図的な runtime 差分すべてに compatibility knowledge entry がある。
- build、lint/static analysis、race/concurrency check、security check が通る。
- benchmark で許容外の latency、throughput、allocation、resource regression がない。
- shadow/replay/canary の diff が合意した閾値内。
- rollback 手順が検証済みで、旧 runtime が rollback window 中 deploy 可能。
