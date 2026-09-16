# ast-grep テストリファレンス

SKILL.md「テスト」節の詳細。

## 2 系統のテスト

| 種類 | コマンド | 何を検証 |
|---|---|---|
| 分類テスト | `ast-grep test --skip-snapshot-tests` | `valid` / `invalid` の分類が正しいか（ルール検出の正否） |
| スナップショットテスト | `ast-grep test` / `ast-grep test -U` | invalid コードへのマッチ位置・fix 適用結果が固定されているか（回帰検出） |

**CI**: 分類テスト（`--skip-snapshot-tests`）を回す。スナップショット差分は開発者レビューが必要なので CI で強制通過させない。

**ローカル開発**: `-U` でスナップショット生成・更新、人の目で diff レビュー、commit。

## テストファイル形式

```yaml
# rule-tests/my-rule-test.yml
id: my-rule               # rules/*.yml の id と一致
valid:
  - "valid code 1"
  - "valid code 2"
invalid:
  - "invalid code 1"
  - "invalid code 2"
```

ファイル名は任意（慣例は `{rule-id}-test.yml`）。

## 複数行コード記法

YAML ブロックスカラーで複数行を書ける:

```yaml
id: async-no-try-catch
valid:
  - |
    async function good() {
      try {
        await doWork();
      } catch (e) {
        handle(e);
      }
    }
invalid:
  - |
    async function bad() {
      await doWork();
      return 42;
    }
```

`|`（literal block scalar）はインデントを保持、末尾改行あり。`|-` は末尾改行なし。複雑な `inside:` / `has:` 検証で関数全体を書きたいときに使う。

## テスト結果の記号

- `.` — パス（期待通り）
- `N` — **ノイジー** (false positive — valid コードにマッチしてしまった)
- `M` — **ミッシング** (false negative — invalid コードにマッチしなかった)

N / M が出たらルール or テストを修正する。

## スナップショット運用

### 初回生成

```bash
ast-grep test -U
```

`rule-tests/__snapshots__/` 配下に YAML ファイルが作られる。invalid コードとマッチ位置、fix 結果が記録される。

### 更新の扱い

ルール変更後、スナップショット差分が出る:
- 意図通りの変更 → `-U` で再生成 → diff 確認 → commit
- 意図しない変更 → ルールを見直す

`--interactive` で対話的に 1 件ずつ承認/拒否できる:

```bash
ast-grep test --interactive
```

### スナップショットを commit する理由

- ルールの意図を明文化する（「このコードはこのルールで検出される」の記録）
- 回帰検出（ルール編集でマッチ範囲が変わったときに気付ける）
- レビュー可能にする（snapshot diff がルールの振る舞い変化を可視化）

### CI でのスナップショット扱い

- `--skip-snapshot-tests` で skip: 分類テストのみ実行、snapshot 差分は失敗扱いしない
- `-U` を CI で走らせない（生成されても commit されない、意味がない）
- snapshot の維持は開発者責務にする

## テスト駆動フロー

1. **Red**: `rule-tests/foo-test.yml` に valid / invalid を書く（ルールは空）→ `ast-grep test` は失敗（ルールなしなので invalid がマッチしない）
2. **Green**: `rules/foo.yml` にルールを書く → `ast-grep test --skip-snapshot-tests` がパス
3. **Snapshot**: `ast-grep test -U` でスナップショット生成、内容レビュー
4. **Commit**: ルール / テスト / スナップショットを一緒に commit
5. **CI**: 分類テスト + scan（`references/cli.md` 参照）

## よくある落とし穴

- **id 不一致**: `rule-tests/` の `id` と `rules/` の `id` が一致しない → テストが認識されない
- **YAML インデント**: ブロックスカラー `|` のインデントは一貫させる（Tab 混在 NG）
- **シングル / ダブルクォート**: 文字列内に `'` / `"` / `:` が含まれる場合はクォート選択に注意。迷ったらブロックスカラーにする
- **valid の不足**: edge ケース（似て非なるもの）を valid に入れないと誤検出に気付けない。`new Set(arr).size` を禁止したいルールなら、valid に `arr.size`（Set 以外のオブジェクトの size）や `Array.from(arr).length`（Set なし）を明示的に入れる
