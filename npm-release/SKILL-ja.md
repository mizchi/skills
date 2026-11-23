---
name: npm-release
description: Release npm libraries with a manual first publish, `npm trust` for OIDC Trusted Publishing, then tag-triggered automatic publishes (`git push` of a `v*` tag). Use when creating a new npm library and shipping it, setting up or fixing automated npm releases, wiring GitHub Actions to publish on tag push, enabling npm provenance, or migrating a repo off release-please / NPM_TOKEN. Covers single-package and pnpm workspaces monorepo.
---

# npm-release

npm ライブラリのリリースは次の 4 段階で行う。release-please と NPM_TOKEN は使わない。

1. **初回はユーザーが手動で publish する**（npm に名前を作る。Trusted Publisher は既存パッケージにしか登録できない）
2. **`npm trust github` で OIDC Trusted Publisher を登録する**（CLI で完結。npmjs.com の UI は不要）
3. **`v*` タグを ruleset で保護する**（`scripts/protect-tags.sh`。タグを push できる人 = publish できる人になるため）
4. **以降は `v*` タグの push で自動 publish する**（`.github/workflows/release.yml` が OIDC で publish、provenance 自動付与）

- Node.js 24 / npm 11.15+（`npm trust` に必要。CI 側の OIDC publish は npm 11.5.1+）
- 単一パッケージ / pnpm workspaces monorepo 両対応（monorepo は全パッケージ同一バージョンの lockstep が既定）→ `references/single-package.md`, `references/monorepo.md`
- CHANGELOG.md は git-cliff で生成する（手で書かない。外部 contributor は `by @login` で載る）。タグ push 時に該当節を GitHub Release の本文にする。0.1.0 以降の要件と cliff.toml / release.yml のテンプレは `oss-maintainer` skill の `references/release-policy.md` と `assets/example-project/`
- release-please + GitHub App / `NPM_TOKEN` による旧方式は廃止した。旧方式のまま動いている repo を見つけたら、この skill の方式へ移行する（「release-please 構成からの移行」）

## いつこの skill を使うか

- 「npm ライブラリを作ってリリースしたい」「初回 publish」
- 「タグ push で npm publish」「OIDC / Trusted Publisher / provenance / npm trust」
- release-please や NPM_TOKEN の構成から移行したい

関連 skill: CI 失敗の調査は `gh-fix-ci`、CHANGELOG の書き方は `conventional-changelog`、MoonBit の npm 配布は `moonbit-practice`。

## 全体フロー

```
[初回のみ・ユーザー作業]
  npm login → npm publish --access public          (名前を確保)
  npm trust github <pkg> --repo <owner>/<repo> \
    --file release.yml --allow-publish -y          (OIDC 登録)
  protect-tags.sh <owner>/<repo>                   (v* タグを admin 限定に)

[以降のリリース]
  version を x.y.z に上げ、git-cliff で CHANGELOG.md を生成して commit
  tag vx.y.z
  git push origin main vx.y.z
      ▼
  release.yml (on: push: tags: v*)
    tag と package.json の version 一致を検査 → typecheck / test / build
    OIDC で npm publish (provenance 付き)
    CHANGELOG の該当節で GitHub Release 作成
```

## 着手前: 今どの段階かを確認する

workflow が既に入っている repo でも、Trusted Publisher が未登録で一度もタグ公開されていないことがある（version だけ先に上がっている）。手を動かす前に 4 点を見て、足りない段階から始める。

```bash
npm view <pkg> version dist-tags --json          # npm 上の最新。package.json より古ければ未公開の version がある
git ls-remote --tags origin                      # v* タグが remote にあるか
gh run list --limit 5                            # publish workflow が走ったことがあるか
gh api repos/<owner>/<repo>/rulesets --jq '.[].name'   # "protect release tags" があるか
```

- `npm whoami` が 401 なら未ログイン。`npm trust list <pkg>` もログインが要るので、登録状況は Phase 2 でユーザーに確認してもらう
- package.json の version が npm より先に進んでいて未公開なら、その番号は使わず次の番号で出してよい（CHANGELOG の未公開節はそのまま残り、内容は次の公開に含まれる）
- **順序は ruleset → trust → タグ push**。trust 登録前にタグを push すると publish が認証エラーで落ち、タグの打ち直しになる。登録を確認できるまでタグは作らない

## Phase 0: package.json の前提

公開する各 `package.json` に次を揃える（無ければ追加。`scripts/migrate.sh` が単一パッケージ分を補う）:

- `"name"`, `"version"`, `"license"`
- `"repository": { "type": "git", "url": "git+https://github.com/<owner>/<repo>.git" }`
  - **必須**。provenance 検証で workflow の repo と照合され、不一致だと publish が `E422` で落ちる
  - monorepo は `"directory": "packages/<dir>"` も書く
- `"files"`: 公開対象を明示（`.npmignore` は使わない）
- `"publishConfig": { "access": "public" }`（scoped public で必須）
- `"engines": { "node": ">=24" }`（CI の Node と揃える）

公開前に中身を確認: `npm pack --dry-run`（monorepo は `pnpm pack` で `workspace:*` が実バージョンに置換されることも確認）。

## Phase 1: 初回 publish（ユーザーが手動で行う）

**エージェントは実行しない。** npm アカウントへの書き込みで、ブラウザ認証 / OTP が要るため、コマンドを提示してユーザーに実行してもらう。Claude Code の `! <command>` で通るのは `npm login --auth-type=web` までで、2FA を求める `npm publish` / `npm trust` は通らない（下の「2FA を求めるコマンドの実行場所」を参照）。

```bash
npm whoami || npm login --auth-type=web
pnpm install --frozen-lockfile && pnpm run build   # repo に合わせる
npm publish --access public                         # monorepo は references/monorepo.md
npm view <pkg> versions                             # 反映確認
```

- この publish には provenance が付かない（手元から出すため）。気になるなら `0.0.1` など捨て番で名前だけ確保し、最初の実リリースをタグ経由にする
- 既に npm に存在するパッケージは Phase 2 から

## Phase 2: npm trust で Trusted Publisher 登録（ユーザーが手動で行う）

要件: npm 11.15.0+、**アカウントの 2FA が有効**、対象パッケージが npm に存在。最初のリクエストで 2FA を求められる。

```bash
npm trust github <pkg> --repo <owner>/<repo> --file release.yml --allow-publish -y
npm trust list <pkg>
```

### 2FA を求めるコマンドの実行場所

`npm trust` と手元からの `npm publish` は 2FA を要求する。**TTY が無い場所で実行すると `EOTP` で即終了する**: 認証 URL を表示するだけで、ブラウザ認証の完了を待たない。エージェントの Bash ツールも Claude Code の `! <command>` も TTY が無いので、何度実行しても同じ結果になる（URL もマスクされて開けない）。

```
npm error code EOTP
npm error This operation requires a one-time password.
npm error Open this URL in your browser to authenticate:
```

通し方は 2 つ:

- **TTY のあるペインで実行する（passkey / セキュリティキーでも通る）**。Rex 端末なら、エージェントが隣にペインを開いてコマンドを起動し、ユーザーにはそのペインで Enter → ブラウザで 2FA だけを頼む。npm は認証完了まで待ってから登録する

  ```bash
  rex split -s "$REX_SESSION" -b "$REX_BLOCK" --split=right -c "$PWD" --keep-open --json -- \
    npm trust github <pkg> --repo <owner>/<repo> --file <workflow>.yml --allow-publish -y
  rex capture -s "$REX_SESSION" -b <block_id> --trim | tail    # "Trust configuration created successfully" を確認
  ```

  Rex が無ければ、ユーザーに別のターミナルで同じコマンドを実行してもらう
- **認証アプリ（TOTP）なら `--otp=<6桁>` を付ける**。これは TTY が無くても通るので `!` で実行できる

成功時の出力は `Trust configuration created successfully for <pkg>` と `id` / `file` / `repository`。これを見てから次へ進む。

### 注意点

- `--file` は `.github/workflows/` 内の**ファイル名のみ**（パス不可）。workflow をリネームしたら登録し直す
- `--allow-publish`（または `--allow-stage-publish`）が必須。付けないと作成できない
- GitHub Environment を使う workflow なら `--env <name>` も一致させる
- **workspace 非対応**。monorepo はパッケージごとに実行する → `scripts/trust.sh <repo-path>` が非 private パッケージを列挙して回す（`--dry-run` を渡すと確認だけ）
- 同じ組み合わせの再登録はエラー。変更は `npm trust list` で ID を見て `npm trust revoke <pkg> --id <id>` してから作り直す

登録後の推奨: パッケージの Settings → Publishing access を "Require two-factor authentication and disallow tokens" にする（Trusted Publisher からの publish は引き続き通り、漏れた token での publish を塞げる）。

## Phase 2.5: v* タグを ruleset で保護する

タグ push が publish の引き金なので、`v*` タグの作成・移動・削除を repo admin に限定する。repo の設定変更なので、実行前にユーザーに確認する。

```bash
scripts/protect-tags.sh <owner>/<repo>   # この skill のディレクトリから
```

- tag ruleset `protect release tags` を作る（同名があれば更新するので何度実行しても良い）。対象 `refs/tags/v*`、rules は creation / update / deletion、bypass は Repository admin ロール（`actor_id: 5`）
- 出力の `can_bypass: "always"` で、実行者自身はタグを push できることを確認する
- release.yml の `gh release create` は push 済みのタグに Release を付けるだけなので、この ruleset に引っかからない。workflow 内でタグを作る構成にするなら bypass に GitHub Actions を足す必要がある
- タグ形式を変えた場合（monorepo の独立バージョニングなど）は `--pattern '*-v*'`
- 必要な権限: repo admin（`gh auth status` のアカウントで）

## Phase 3: release.yml（タグ起点の自動 publish）

テンプレ: `references/workflow-templates/release.yml`。単一パッケージなら `scripts/migrate.sh <repo-path>` で生成できる。

必須ポイント:

- `on: push: tags: ['v*']` のみ
- `permissions: { contents: write, id-token: write }`（`id-token` は OIDC、`contents` は GitHub Release 作成）
- `actions/setup-node` に `registry-url: https://registry.npmjs.org`
- `npm install -g npm@11` で OIDC 対応の npm にする（Node 同梱の npm が古い場合の保険）
- **tag と package.json の version 一致を検査**してから publish（`v0.3.0` を打ったのに version が `0.2.0`、という事故を止める）
- publish 前に typecheck / test / build を通す
- `NPM_TOKEN` / `NODE_AUTH_TOKEN` を secret から渡さない（token があるとそちらが使われる）
- `--provenance` は不要（Trusted Publishing では自動付与）
- version に `-` を含む（pre-release）ときは `--tag next` で publish し、`latest` を動かさない
- GitHub Release は CHANGELOG の `## x.y.z` 節から作る。節が無ければ `--generate-notes` にフォールバック

## Phase 4: リリース手順（2 回目以降）

```bash
# 1. version を上げる
npm version 0.3.0 --no-git-tag-version          # 単一パッケージ（monorepo は references/monorepo.md）
# 2. CHANGELOG.md を生成する（"## 0.3.0 (日付)" 節ができる。差分と見比べて確認）
GITHUB_TOKEN=$(gh auth token) npx git-cliff --tag v0.3.0 -o CHANGELOG.md
git commit -am "chore: release 0.3.0"
# 3. tag を打って push
git tag v0.3.0
git push origin main v0.3.0
gh run watch                                    # release workflow を見る
```

- `git push --follow-tags` は annotated tag しか送らない。lightweight tag は上のように名前を明示する
- タグ保護の ruleset があると、admin の push でも次のメッセージが出る。**これは成功**（admin としてバイパスした記録）。`GH013` で拒否された場合だけが失敗

  ```
  remote: Bypassed rule violations for refs/tags/v0.3.0:
  remote: - Cannot create ref due to creations being restricted.
  ```
- workflow は `gh run watch <run-id> --exit-status` で最後まで見る。publish ステップのログに `+ <pkg>@x.y.z` と `Provenance statement published to transparency log` が出ていれば公開済み
- **registry への反映は workflow 成功から 1 分ほど遅れる**。その間 `npm view <pkg>@x.y.z` は 404、`dist-tags.latest` は旧版のまま。ここでタグを打ち直さない。`curl -s https://registry.npmjs.org/<pkg>` の `dist-tags.latest` を 15 秒間隔で数回見て、変わるのを待つ
- 確認: `npm view <pkg> versions`、`npm view <pkg>@0.3.0 --json | jq '.dist.attestations'`（provenance が入っていれば成功）
- publish 前に落ちたら: 原因を直して**タグを打ち直す**（`git tag -d v0.3.0 && git push origin :v0.3.0` → 修正 commit → 再 tag → push）
- npm に一部でも出たバージョンは再 publish できない。その場合は patch を上げて出し直す
- pre-release: version を `0.3.0-rc.0`、タグを `v0.3.0-rc.0` にする

## release-please 構成からの移行

既存リポに `release-please.yml` / `release-please-config.json` / `.release-please-manifest.json` / `publish.yml (on: release)` がある場合:

1. release-please 系ファイルを削除する（`migrate.sh` は削除しない。存在を警告するだけ）
2. publish workflow をタグ起点に書き換える。**ファイル名を変えると Trusted Publisher の再登録が要る**ので、既存リポは `publish.yml` の名前のまま中身をテンプレに差し替えるのが早い（`migrate.sh --workflow publish.yml --force <repo>`）
3. `npm trust list <pkg>` の workflow filename と一致しているか確認する。UI で登録したものも `npm trust list` に出る
4. `CHANGELOG.md` は git-cliff で生成し直す（release-please が書いた既存分を残したい場合は `git-cliff --unreleased --tag vx.y.z --prepend CHANGELOG.md` で新しい節だけ足す。`--prepend` は既存ファイルの先頭が cliff.toml の `header` と完全一致するときだけヘッダを取り除くので、先に両者を揃え、空の `## Unreleased` 見出しは消しておく。`tag_pattern` は `<name>-v1.2.3` のような release-please 時代のタグも拾える形にする）
5. `scripts/protect-tags.sh <owner>/<repo>` で `v*` タグを保護する
6. repo secret `RELEASE_PLEASE_APP_PRIVATE_KEY` を消す（`gh secret delete RELEASE_PLEASE_APP_PRIVATE_KEY --repo <owner>/<repo>`）

## セキュリティ上の注意

タグ push が publish の引き金なので、**repo に push できる人 = publish できる人**になる。

- `v*` タグは Phase 2.5 の ruleset で admin 限定にする（導入済みか: `gh api repos/<owner>/<repo>/rulesets --jq '.[].name'`）
- `.github/workflows/` を CODEOWNERS で保護する（workflow を書き換えられると任意コードで publish される）
- サードパーティ action は SHA pin を検討する
- フォークからはタグを作れないので、フォーク PR で publish は発火しない

## よくある落とし穴

| 症状 | 原因 | 対処 |
|---|---|---|
| `npm trust` が 2FA / 認証エラー | アカウントの 2FA 無効、または granular token / bypass 2FA で認証 | 2FA を有効化し `npm login --auth-type=web` で入り直す |
| `npm trust` / `npm publish` が `EOTP` で即終了し、何度やっても同じ | TTY が無い（エージェントの Bash、Claude Code の `!`）ので npm がブラウザ認証を待てない | TTY のあるペインで実行する（`rex split ... -- npm trust ...`）か、TOTP なら `--otp=<6桁>` |
| `npm trust` が package not found | 未公開パッケージ | Phase 1 の手動 publish を先に行う |
| `npm trust` が already exists | 同じ設定が既にある | `npm trust list` → `revoke --id` → 再作成 |
| CI の `npm publish` が 404 / `ENEEDAUTH` / `EOIDCREQ` | workflow filename 不一致、`id-token: write` 無し、npm が 11.5.1 未満 | `npm trust list` と workflow 名を照合、permissions と npm バージョンを確認 |
| `E422` provenance / repository 不一致 | `package.json#repository.url` が実際の repo と違う | `git+https://github.com/<owner>/<repo>.git` に直す |
| OIDC なのに token 系エラー | `NODE_AUTH_TOKEN` / `NPM_TOKEN` が env に残っている | secret と env を消す |
| 公開物に `workspace:*` が残る | monorepo で `npm publish` を直接実行 | `pnpm pack` → `npm publish <tgz>` |
| workflow は成功したのに `npm view <pkg>@x.y.z` が 404 | registry の反映遅延（1 分ほど） | 待って再確認する。タグは打ち直さない |
| workflow はあるのに npm の latest が古く、remote にタグが無い | Trusted Publisher が未登録のまま version だけ上がっていた | 「着手前」の確認 → Phase 2 → 2.5 → タグ push |
| タグ push が `GH013: Repository rule violations` で拒否 | ruleset により admin 以外は `v*` タグを作れない | admin に push してもらう。意図した制限なので ruleset は緩めない |
| version check で落ちる | tag と package.json の version がずれている | version を直して commit、タグを打ち直す |

## 参考

- `npm help trust`
- npm Trusted Publishing: https://docs.npmjs.com/trusted-publishers
- npm provenance: https://docs.npmjs.com/generating-provenance-statements
