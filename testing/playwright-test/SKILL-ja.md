---
name: playwright-test
description: Playwright Test (E2E) のベストプラクティスとリファレンス。テストの書き方、固定 wait 回避、ネットワークトリガー、DnD、GitHub Actions での shard/retry 設定など。Playwright テストを書く・レビュー・CI 設定するときに使用。
---

# Playwright Test

## 設定テンプレート

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,       // CI で .only を禁止
  retries: process.env.CI ? 2 : 0,    // CI のみリトライ
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html'], ['github']]           // CI: HTML + GitHub annotations
    : [['html']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',          // リトライ時のみトレース記録
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], storageState: 'playwright/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

## GitHub Actions

### Linux フォント (CI 必須)

Ubuntu/Debian ではデフォルトで日本語・CJK フォントがない。スクリーンショットの文字化けやレイアウト崩れの原因になる:

```yaml
      - name: Install fonts
        run: |
          sudo apt-get update
          sudo apt-get install -y fonts-noto-cjk fonts-noto-color-emoji
```

`--with-deps` オプションで Playwright が必要なシステム依存をインストールするが、フォントは含まれない。

### 基本 (shard なし)

```yaml
name: E2E Tests
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - run: npx playwright install chromium --with-deps
      - run: sudo apt-get install -y fonts-noto-cjk fonts-noto-color-emoji
      - run: npx playwright test
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

### Shard 実行 (並列分割)

テストを複数ジョブに分割して高速化:

```yaml
name: E2E Tests (Sharded)
on: [push, pull_request]

jobs:
  e2e:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shard: [1/4, 2/4, 3/4, 4/4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - run: npx playwright install chromium --with-deps
      - run: npx playwright test --shard=${{ matrix.shard }}
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: blob-report-${{ strategy.job-index }}
          path: blob-report/
          retention-days: 1

  merge-reports:
    if: ${{ !cancelled() }}
    needs: e2e
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          path: all-blob-reports
          pattern: blob-report-*
          merge-multiple: true
      - run: npx playwright merge-reports --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

shard 用に config で blob reporter を追加:

```ts
reporter: process.env.CI
  ? [['blob'], ['github']]    // shard 用: blob で出力
  : [['html']],
```

### Shard × Browser Matrix（複数ブラウザ並列）

複数ブラウザ × 複数 shard で組み合わせて実行する場合、`matrix` 軸を 2 つ持つ:

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        browser: [chromium, firefox, webkit]
        shard: [1/4, 2/4, 3/4, 4/4]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - run: npx playwright install ${{ matrix.browser }} --with-deps
      - run: sudo apt-get install -y fonts-noto-cjk fonts-noto-color-emoji
      - run: npx playwright test --project=${{ matrix.browser }} --shard=${{ matrix.shard }}
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: blob-${{ matrix.browser }}-${{ strategy.job-index }}
          path: blob-report/
          retention-days: 1
```

merge ジョブで全 blob を 1 つの HTML に統合。ブラウザ × shard で artifact 名が `blob-chromium-0` / `blob-firefox-1` ... のように変わるので、pattern は `blob-*` にする:

```yaml
  merge-reports:
    if: ${{ !cancelled() }}
    needs: e2e
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: npm ci
      - uses: actions/download-artifact@v4
        with:
          path: all-blob-reports
          pattern: blob-*             # ブラウザ横断で回収
          merge-multiple: true
      - run: npx playwright merge-reports --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

job 数は `browsers × shards` 倍になるので組み合わせ数に注意（3 × 4 = 12 ジョブ）。`fail-fast: false` で 1 ジョブ失敗時に他を止めない。`workers: 1` は **shard 内** の並列度（shard 自体が既に並列なので CI では 1 で良い、ローカル開発は `undefined` で auto）。

### Retry 戦略

```ts
// playwright.config.ts
export default defineConfig({
  retries: process.env.CI ? 2 : 0,  // CI で最大 2 回リトライ

  use: {
    trace: 'on-first-retry',         // リトライ時にトレース取得
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
});
```

テスト単位でリトライ:

```ts
// 特定のテストだけリトライ回数を変更
test('flaky external API test', async ({ page }) => {
  test.info().annotations.push({ type: 'retry', description: 'External dependency' });
  // ...
});

// describe 単位
test.describe('payment flow', () => {
  test.describe.configure({ retries: 3 });
  // ...
});
```

### Trace / Screenshot / Video の選択基準

| 設定 | 取得タイミング | 用途・サイズ |
|---|---|---|
| `'on'` | 全テスト | デバッグ時のみ。CI では非推奨（artifact が膨らむ） |
| `'on-first-retry'` | リトライ時のみ | **CI デフォルト推奨**。flaky の原因調査に十分、サイズ最小 |
| `'retain-on-failure'` | 失敗時に保持 | 失敗を 1 発で確実に捕まえたい場合。retry なしの環境で有用 |
| `'off'` | 取得なし | 大規模 suite で artifact 容量を節約 |

選択基準: **retry を 1 回以上設定するなら `on-first-retry`**（初回失敗 → リトライ時にトレース、サイズ ½）。**retry なし or 1 回失敗を即座に見たいなら `retain-on-failure`**。要件「failure のみ」と言われたら通常 `retain-on-failure` を指す。

### Browser 別の条件付きテスト

特定ブラウザでのみ skip / 動作差異を扱う:

```ts
import { test } from '@playwright/test';

// ブラウザ条件で 1 テストを skip
test('webkit only feature', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'Safari-specific behavior');
  // ...
});

// describe 単位で skip
test.describe('chromium-only suite', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Uses CDP');
  test('uses cdp api', async ({ page }) => { /* ... */ });
});

// describe 単位で retry / mode 変更
test.describe('payment flow', () => {
  test.describe.configure({ retries: 3, mode: 'serial' });
  test('step 1', async ({ page }) => { /* ... */ });
  test('step 2', async ({ page }) => { /* step 1 の状態を引き継ぐ */ });
});
```

`browserName` は `chromium` / `firefox` / `webkit` の 3 値。tag を使った CLI 絞り込み (`--grep @chromium-only`) と組み合わせると CI 設定の柔軟性が上がる。

### Flaky 検出運用

CI で flaky を検出して PR コメント / 集計するには JSON reporter を加える:

```ts
reporter: process.env.CI
  ? [['blob'], ['github'], ['json', { outputFile: 'test-results/results.json' }]]
  : [['html']],
```

`results.json` には各テストの `status` / `retries` / `duration` が入る。後段で抽出:

```bash
# retry > 0 で最終 pass = flaky 候補
jq '.suites[].specs[] | select(.tests[].results | length > 1 and .[-1].status == "passed")' \
  test-results/results.json
```

GitHub Actions で artifact 保存し、別ジョブで集計 → 過去 N 回分の傾向を track する運用が定番。`@playwright/test` 1.40+ なら `expect.configure({ flaky: true })` 等の組込み support も利用可。

### 鉄則: 固定 wait を使わない

## 鉄則: 固定 wait を使わない

Playwright は要素がアクション可能になるまで自動で待機する。`waitForTimeout()` は禁止。

```ts
// BAD
await page.waitForTimeout(3000);
await page.click('#submit');

// GOOD: 自動待機
await page.getByRole('button', { name: 'Submit' }).click();

// GOOD: web-first assertion (自動リトライ)
await expect(page.getByText('Success')).toBeVisible();

// BAD: リトライなし
expect(await page.getByText('Success').isVisible()).toBe(true);
```

**One-shot 読み取り API は auto-retry しない**:

| 形式 | 挙動 |
|---|---|
| `expect(locator).toBeVisible()` / `toHaveText(...)` 等 | **auto-retry あり**（既定 5s）。これを使う |
| `await locator.isVisible()` / `innerText()` / `count()` / `textContent()` | **1 発読み取り、retry なし**。flaky の温床 |

flaky なら高確率で one-shot API を web-first assertion に置換できる:

```ts
// BAD
const n = await page.locator('.row').count();
expect(n).toBeGreaterThan(0);

// GOOD
await expect(page.locator('.row')).not.toHaveCount(0);
```

明示的な待機が必要なケース:

```ts
await page.waitForURL('**/dashboard');          // ナビゲーション後
await page.waitForLoadState('networkidle');      // 重い初期ロード
await page.waitForResponse('**/api/data');       // API レスポンス待ち
```

## ネットワークトリガー

**アクションの前に** Promise をセットアップする:

```ts
const responsePromise = page.waitForResponse('**/api/users');
await page.getByRole('button', { name: 'Save' }).click();
const response = await responsePromise;
expect(response.status()).toBe(200);

// 条件付きマッチ
const responsePromise = page.waitForResponse(
  resp => resp.url().includes('/api/users') && resp.request().method() === 'POST'
);
```

**`waitForResponse` が永久待機する罠**: 対象 API がそもそも呼ばれない（SPA で全データを初期 bundle に持つ、cache hit で skip する 等）ケースでは timeout まで止まる。**fallback 順位**:

1. まず `waitForResponse` が必須かを判定（API 呼出しが副作用の確定タイミングなら必要）
2. API が呼ばれないなら **web-first assertion 単独** で十分（`await expect(page.getByTestId('result')).toBeVisible()`）
3. timeout を短く制限したい場合は `{ timeout: 5_000 }` を渡す
4. 任意レスポンスをカウントしたい場合は `page.on('response', ...)` で listener 化（waitFor ではなく event 集計）

### API モック

`page.route()` は `page.goto()` の**前に**登録する:

```ts
await page.route('**/api/items', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ items: [{ id: 1, name: 'Test' }] }),
}));

// レスポンスを改変
await page.route('**/api/data', async route => {
  const response = await route.fetch();
  const json = await response.json();
  json.debug = true;
  await route.fulfill({ response, json });
});

// リソースブロック（高速化）
await page.route('**/*.{png,jpg,jpeg}', route => route.abort());
```

### HAR によるネットワーク記録・再生

実際の API レスポンスを記録して、テスト時にそのまま再生できる:

```ts
// 記録: テスト実行時に HAR ファイルを生成
test('record HAR', async ({ page }) => {
  await page.routeFromHAR('tests/fixtures/api.har', {
    url: '**/api/**',
    update: true,  // true で記録モード、false で再生モード
  });
  await page.goto('/');
  // ...操作すると API レスポンスが HAR に保存される
});

// 再生: 記録済み HAR からレスポンスを返す（ネットワーク不要）
test('replay from HAR', async ({ page }) => {
  await page.routeFromHAR('tests/fixtures/api.har', {
    url: '**/api/**',
    update: false,  // 再生モード
  });
  await page.goto('/');
  await expect(page.getByText('data from API')).toBeVisible();
});
```

CLI で HAR を記録する方法:

```bash
npx playwright open --save-har=tests/fixtures/api.har https://example.com
```

### リクエスト・レスポンスの検証

```ts
// リクエストボディを検証
const requestPromise = page.waitForRequest('**/api/submit');
await page.getByRole('button', { name: 'Submit' }).click();
const request = await requestPromise;
expect(request.method()).toBe('POST');
expect(JSON.parse(request.postData()!)).toEqual({ name: 'test' });

// レスポンスボディを検証
const responsePromise = page.waitForResponse('**/api/submit');
await page.getByRole('button', { name: 'Submit' }).click();
const response = await responsePromise;
const body = await response.json();
expect(body.id).toBeDefined();
```

### Context レベルのルーティング

全ページに共通のモックを適用する場合は `context.route()` を使う:

```ts
test('context-level mock', async ({ context, page }) => {
  // context 内の全ページに適用
  await context.route('**/api/config', route => route.fulfill({
    status: 200,
    json: { featureFlag: true },
  }));
  await page.goto('/');
  const popup = await page.waitForEvent('popup');  // 新しいタブにも適用される
  await expect(popup.getByText('Feature enabled')).toBeVisible();
});
```

## Drag and Drop

### シンプルなケース

```ts
await page.locator('#source').dragTo(page.locator('#target'));
```

### DnD ライブラリ (react-dnd, dnd-kit, SortableJS)

ポインターイベントベースのライブラリは `dragTo` が動かないことが多い:

```ts
async function dragAndDrop(page: Page, source: Locator, target: Locator) {
  const srcBox = (await source.boundingBox())!;
  const tgtBox = (await target.boundingBox())!;

  await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + tgtBox.height / 2, { steps: 10 });
  await page.mouse.up();
}
```

- `{ steps: 10 }` で中間の `pointermove`/`dragover` イベントを生成
- `DataTransfer` を使うライブラリは `page.evaluate()` で合成イベントが必要な場合あり
- アニメーションではなく最終状態（要素の順序・位置）をアサートする

## ロケーター

優先順位（上ほど推奨）:

```ts
page.getByRole('button', { name: 'Submit' });  // 1. ロールベース
page.getByLabel('Email');                        // 2. ラベル
page.getByText('Welcome');                       // 2. テキスト
page.getByTestId('nav-menu');                    // 3. テスト ID
page.locator('button.btn-primary');              // 4. CSS (避ける)
```

チェーンとフィルター:

```ts
const product = page.getByRole('listitem').filter({ hasText: 'Product 2' });
await product.getByRole('button', { name: 'Add to cart' }).click();
```

### モーダル / Dialog の扱い

モーダルは `getByRole('dialog')` でスコープして内部要素を引く。閉じ確認は `toBeHidden()`:

```ts
// 開く
await page.getByRole('button', { name: 'New Project' }).click();
const dialog = page.getByRole('dialog');
await expect(dialog).toBeVisible();

// 内部操作はスコープ内で
await dialog.getByLabel('Name').fill('My Project');
await dialog.getByRole('button', { name: 'Save' }).click();

// 閉じ確認（fade out アニメーション中は toBeHidden が auto-retry で待つ）
await expect(dialog).toBeHidden();

// 反映結果を外側で確認
await expect(
  page.getByRole('list', { name: 'projects' }).getByRole('listitem').filter({ hasText: 'My Project' })
).toBeVisible();
```

`role="alertdialog"` は警告系ダイアログ（削除確認など）で `getByRole('alertdialog')` を使う。

## アサーション

web-first assertion は自動リトライする:

```ts
await expect(page.getByText('Success')).toBeVisible();
await expect(page.getByRole('listitem')).toHaveCount(3);
await expect(page.getByTestId('status')).toHaveText('Done');
await expect(page).toHaveURL(/dashboard/);
await expect(page).toHaveTitle(/Home/);

// ソフトアサーション（失敗してもテスト続行）
await expect.soft(page.getByTestId('count')).toHaveText('5');
```

## 認証の再利用

```ts
// tests/auth.setup.ts
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('user@test.com');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/dashboard');
  await page.context().storageState({ path: 'playwright/.auth/user.json' });
});
```

認証不要なテスト: `test.use({ storageState: { cookies: [], origins: [] } })`

## ファイル操作

```ts
// アップロード
await page.getByLabel('Upload').setInputFiles('myfile.pdf');

// バッファから（ファイル不要）
await page.getByLabel('Upload').setInputFiles({
  name: 'file.txt', mimeType: 'text/plain', buffer: Buffer.from('content'),
});

// ダウンロード
const downloadPromise = page.waitForEvent('download');
await page.getByText('Download').click();
const download = await downloadPromise;
await download.saveAs('/tmp/file.pdf');
```

## Page Object Model

シンプルに保つ。アサーションはテストファイル側:

```ts
class LoginPage {
  constructor(private page: Page) {}
  readonly email = this.page.getByLabel('Email');
  readonly password = this.page.getByLabel('Password');
  readonly submit = this.page.getByRole('button', { name: 'Sign in' });

  async login(email: string, pass: string) {
    await this.email.fill(email);
    await this.password.fill(pass);
    await this.submit.click();
  }
}
```

## デバッグ

```bash
npx playwright test --debug          # Inspector 起動
npx playwright test --ui             # UI モード (time-travel)
npx playwright test --trace on       # トレース生成
npx playwright show-report           # レポート表示
```

コード内: `await page.pause()` でテスト途中に Inspector を開く。
