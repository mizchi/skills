# Assets

`gleam-practice` で配布している雛形の一覧。

## How To Use

1. まず `SKILL.md` を読んで方針を合わせる
2. 必要な雛形だけ project にコピーする
3. module 名、package 名、port、path、CI version を project 用に調整する
4. `just ci` が通るところまで直す

## Files

### `justfile`

最小の task runner 雛形。

使う場面:

- `gleam format/check/build/test` を統一したい
- local と CI の入口を `just ci` に揃えたい

### `github-actions/ci.yml`

GitHub Actions の最小 CI。

使う場面:

- Gleam/Erlang project の CI をすぐ作りたい
- `just ci` を GitHub Actions からそのまま呼びたい

注意:

- `Elixir` が必要な依存を使うなら `elixir-version` を有効化する
- NIF / Rust / Wasm を使うなら Rust setup step を追加する

### `bench/http.js`

`k6` 用の最小 HTTP 負荷試験。

使う場面:

- `/healthz` や `/` の基本的な応答を継続的に測りたい
- `VUS`, `DURATION`, `BASE_URL` を変えて簡易な load test をしたい

### `test/snapshot_test.gleam`

`birdie` の最小 snapshot test。

使う場面:

- HTML, text, generated output, API response body を固定したい
- review 後の差分を snapshot として commit したい

### `test/property_test.gleam`

`qcheck` の最小 property test。

使う場面:

- pure function の invariant を generator で検証したい
- shrink 結果を使って反例を詰めたい

### `test/qcheck_parallel_test.gleam`

`qcheck_gleeunit_utils` を使った並列実行例。

使う場面:

- Erlang target で property test をまとめて並列化したい
- `run.run_gleeunit` や `test_spec.run_in_parallel` を使いたい

### `test/timeout_test.gleam`

`qcheck_gleeunit_utils/test_spec.make_with_timeout` の例。

使う場面:

- 5 秒を超える integration test や重い fixture 構築がある
- test 単位で timeout を延ばしたい

## Copy Checklist

- package 名と module path を自分の project 名に変えたか
- `just ci` が通るか
- optional tool の依存を `gleam add` したか
- target が Erlang 前提の template を JS target project に持ち込んでいないか
