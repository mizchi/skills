# GitHub Actions で Cloudflare にデプロイ

Workers / Pages / D1 migration を GitHub Actions から deploy する recipes。API token / OIDC / preview / tag deploy を扱う。

## Auth 方式の選択

| 方式 | 手順 | 推奨度 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` secret | token 発行 → GitHub Secrets に格納 | デフォルト、最も枯れている |
| GitHub OIDC → Cloudflare | Cloudflare 側で OIDC provider 登録 + role 設定 | 複雑。Cloudflare の OIDC サポートは限定的で、多くの場面で API token が実用 |

**結論**: 2026 年 4 月時点では **API token + `CLOUDFLARE_ACCOUNT_ID`** が実運用で現実的。Cloudflare の OIDC は AWS ほど成熟していない。

## API Token の作成

1. https://dash.cloudflare.com/profile/api-tokens
2. "Create Token" → "Edit Cloudflare Workers" template（Workers + Pages + D1 + KV + R2 を一括カバー）
3. Zone / Account を絞ってから Create
4. 表示された token を GitHub Secrets (`CLOUDFLARE_API_TOKEN`) に貼る
5. `CLOUDFLARE_ACCOUNT_ID` も同じ page 右上から取得して secrets に追加

必要なら zone を絞った Custom token も可（全 product を使うなら上記 template が楽）。

## Worker deploy（最小）

```yaml
# .github/workflows/deploy.yml
name: deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

pnpm なら `pnpm/action-setup@v4` + `pnpm install --frozen-lockfile` + `pnpm exec wrangler deploy` に置き換え。

## 3 環境分離（preview / staging / production）

`wrangler.jsonc` で `env.staging` / `env.production` を定義し、top-level を preview として扱う。

```yaml
name: deploy
on:
  pull_request:                    # preview: PR ごとに別名 deploy
  push:
    branches: [main]               # staging: main push で自動
    tags: ['v*']                   # production: tag push で手動 approval

permissions:
  contents: read
  pull-requests: write             # PR コメント用

jobs:
  preview:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    concurrency: preview-${{ github.event.pull_request.number }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - name: Deploy preview
        id: deploy
        run: |
          NAME="my-worker-pr-${{ github.event.pull_request.number }}"
          npx wrangler deploy --name "$NAME"
          echo "url=https://$NAME.<account>.workers.dev" >> $GITHUB_OUTPUT
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: preview-url
          message: |
            Preview deployed: ${{ steps.deploy.outputs.url }}

  staging:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - run: npx wrangler d1 migrations apply app-staging --remote --env staging
        env: &cf
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - run: npx wrangler deploy --env staging
        env: *cf

  production:
    if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    environment: production         # GitHub Environments で手動 approval
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - run: npx wrangler d1 migrations apply app-prod --remote --env production
        env: &cf_p
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
      - run: npx wrangler deploy --env production
        env: *cf_p
```

注意点:
- `concurrency: preview-<pr>` で同一 PR の連続 push 時に旧 job を cancel
- `environment: production` + GitHub Environments 側で Required Reviewers を設定すると tag push で手動 approval
- `push.branches` と `push.tags` は同じ `on.push` 内に書く（2 つの `push:` キーを並べる YAML は無効）

## Pages deploy

```yaml
- run: npm run build
- run: npx wrangler pages deploy ./dist --project-name=my-app --branch=main
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

PR preview が必要なら `--branch=${{ github.head_ref }}` にすると Cloudflare Pages が自動で preview URL を発行する（Cloudflare Pages Git 連携をオフにして GitHub Actions 経由にした場合）。

## D1 migration の順序

deploy より先に migration を当てる（さもないと new column / table がまだ存在せず Worker が 500）:

```yaml
- run: npx wrangler d1 migrations apply app-prod --remote --env production
- run: npx wrangler deploy --env production
```

`--remote` が必須（`--local` はローカル SQLite を触るだけで本番に影響しない）。

## 失敗時の切り分け

| 症状 | 典型原因 |
|---|---|
| `Authentication error` | `CLOUDFLARE_API_TOKEN` が未設定 / expired。`wrangler whoami` をローカルで確認 |
| `No such database` | `--remote` 忘れ、または `database_id` が env 間で食い違い |
| `binding not found` | `wrangler.jsonc` の `[env.xxx]` で binding が non-inheritable。各 env に個別列挙必要 |
| preview URL が `undefined` | `actions/checkout` が depth=1 で head_ref 取得できない場合あり。`fetch-depth: 0` |
| `permission denied` for `secrets.GITHUB_TOKEN` | `permissions:` ブロックに `pull-requests: write` を付け忘れ |

## OIDC（将来、Cloudflare が完全サポートした場合の形）

2026 年時点では実験的。参考までに枠組みのみ:

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: actions/checkout@v4
  - name: Configure Cloudflare OIDC
    # Cloudflare の API endpoint (概念):
    # https://api.cloudflare.com/client/v4/accounts/<id>/oidc/tokens/exchange
    # token を exchange してから wrangler に渡す
    run: |
      # TODO: 公式対応を待つ
      echo "OIDC not yet first-class for Cloudflare; fall back to API token"
```

current best practice: **API token で運用し、token は 90 日ごとに rotation**。

## 参照

- `references/wrangler/auth.md` — token 発行の詳細
- `references/wrangler/configuration.md` — `[env.xxx]` の構文
- `references/d1/` — migration 全般
