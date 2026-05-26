---
name: playwright-test
description: Best practices and reference for Playwright Test (E2E). Covers how to write tests, avoiding fixed waits, network triggers, DnD, shard/retry setup on GitHub Actions, and more. Use when writing, reviewing, or configuring CI for Playwright tests.
---

# Playwright Test

## Configuration Template

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,       // Forbid .only on CI
  retries: process.env.CI ? 2 : 0,    // Retry only on CI
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [['html'], ['github']]           // CI: HTML + GitHub annotations
    : [['html']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',          // Record trace only on retry
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

### Linux Fonts (Required on CI)

Ubuntu/Debian does not ship with Japanese/CJK fonts by default. This causes mojibake and layout breakage in screenshots:

```yaml
      - name: Install fonts
        run: |
          sudo apt-get update
          sudo apt-get install -y fonts-noto-cjk fonts-noto-color-emoji
```

The `--with-deps` option makes Playwright install the required system dependencies, but fonts are not included.

### Basic (without shard)

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

### Shard Execution (Parallel Splitting)

Split tests across multiple jobs to speed them up:

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

Add the blob reporter to the config for sharding:

```ts
reporter: process.env.CI
  ? [['blob'], ['github']]    // For shards: emit blob
  : [['html']],
```

### Shard x Browser Matrix (Multiple Browsers in Parallel)

To run multiple browsers x multiple shards together, use two `matrix` axes:

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

The merge job consolidates all blobs into a single HTML. Since the artifact name varies per browser x shard (`blob-chromium-0` / `blob-firefox-1` ...), use `blob-*` as the pattern:

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
          pattern: blob-*             # Collect across browsers
          merge-multiple: true
      - run: npx playwright merge-reports --reporter html ./all-blob-reports
      - uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

Job count becomes `browsers x shards` (3 x 4 = 12 jobs), so watch the combinatorial blow-up. `fail-fast: false` keeps other jobs running when one fails. `workers: 1` controls parallelism **within a shard** (shards are already parallel, so 1 is fine on CI; use `undefined` for auto on local dev).

### Retry Strategy

```ts
// playwright.config.ts
export default defineConfig({
  retries: process.env.CI ? 2 : 0,  // Up to 2 retries on CI

  use: {
    trace: 'on-first-retry',         // Capture trace on retry
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
});
```

Per-test retries:

```ts
// Change retry count for a specific test only
test('flaky external API test', async ({ page }) => {
  test.info().annotations.push({ type: 'retry', description: 'External dependency' });
  // ...
});

// Per describe
test.describe('payment flow', () => {
  test.describe.configure({ retries: 3 });
  // ...
});
```

### Choosing Trace / Screenshot / Video

| Setting | When captured | Purpose / Size |
|---|---|---|
| `'on'` | Every test | Debug only. Not recommended on CI (artifacts balloon) |
| `'on-first-retry'` | Only on retry | **Recommended CI default**. Sufficient for flaky investigation, minimal size |
| `'retain-on-failure'` | Kept on failure | When you want to catch a failure on the very first run. Useful when retries are disabled |
| `'off'` | Never captured | Save artifact space on large suites |

Selection criteria: **if you set retries >= 1, use `on-first-retry`** (initial fail -> trace on retry, half the size). **Without retries, or when you want to inspect a single failure immediately, use `retain-on-failure`**. When the requirement is phrased as "failure only," it usually means `retain-on-failure`.

### Browser-Conditional Tests

Skipping or handling differences per browser:

```ts
import { test } from '@playwright/test';

// Skip one test based on browser condition
test('webkit only feature', async ({ page, browserName }) => {
  test.skip(browserName !== 'webkit', 'Safari-specific behavior');
  // ...
});

// Skip a describe block
test.describe('chromium-only suite', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Uses CDP');
  test('uses cdp api', async ({ page }) => { /* ... */ });
});

// Change retry / mode per describe
test.describe('payment flow', () => {
  test.describe.configure({ retries: 3, mode: 'serial' });
  test('step 1', async ({ page }) => { /* ... */ });
  test('step 2', async ({ page }) => { /* inherits state from step 1 */ });
});
```

`browserName` takes one of three values: `chromium` / `firefox` / `webkit`. Combining with tag-based CLI filtering (`--grep @chromium-only`) gives more flexibility in CI configuration.

### Flaky Detection Workflow

To detect flaky tests on CI and post comments / aggregate stats on PRs, add the JSON reporter:

```ts
reporter: process.env.CI
  ? [['blob'], ['github'], ['json', { outputFile: 'test-results/results.json' }]]
  : [['html']],
```

`results.json` contains each test's `status` / `retries` / `duration`. Extract downstream:

```bash
# retry > 0 and final pass = flaky candidate
jq '.suites[].specs[] | select(.tests[].results | length > 1 and .[-1].status == "passed")' \
  test-results/results.json
```

The usual pattern is to upload as an artifact on GitHub Actions and aggregate in a separate job -> track trends over the past N runs. With `@playwright/test` 1.40+, built-in support like `expect.configure({ flaky: true })` is also available.

### Rule: Do Not Use Fixed Waits

## Rule: Do Not Use Fixed Waits

Playwright automatically waits until an element is actionable. `waitForTimeout()` is forbidden.

```ts
// BAD
await page.waitForTimeout(3000);
await page.click('#submit');

// GOOD: automatic waiting
await page.getByRole('button', { name: 'Submit' }).click();

// GOOD: web-first assertion (auto-retries)
await expect(page.getByText('Success')).toBeVisible();

// BAD: no retry
expect(await page.getByText('Success').isVisible()).toBe(true);
```

**One-shot read APIs do not auto-retry**:

| Form | Behavior |
|---|---|
| `expect(locator).toBeVisible()` / `toHaveText(...)` etc. | **Auto-retry** (default 5s). Use these |
| `await locator.isVisible()` / `innerText()` / `count()` / `textContent()` | **One-shot read, no retry**. A hotbed for flaky tests |

If a test is flaky, there's a good chance you can replace a one-shot API with a web-first assertion:

```ts
// BAD
const n = await page.locator('.row').count();
expect(n).toBeGreaterThan(0);

// GOOD
await expect(page.locator('.row')).not.toHaveCount(0);
```

Cases where explicit waiting is necessary:

```ts
await page.waitForURL('**/dashboard');          // After navigation
await page.waitForLoadState('networkidle');      // Heavy initial load
await page.waitForResponse('**/api/data');       // Wait for API response
```

## Network Triggers

Set up the Promise **before** the action:

```ts
const responsePromise = page.waitForResponse('**/api/users');
await page.getByRole('button', { name: 'Save' }).click();
const response = await responsePromise;
expect(response.status()).toBe(200);

// Conditional matching
const responsePromise = page.waitForResponse(
  resp => resp.url().includes('/api/users') && resp.request().method() === 'POST'
);
```

**Pitfall: `waitForResponse` hanging forever**: If the target API is never called (an SPA with all data in the initial bundle, skipped on cache hit, etc.), it blocks until timeout. **Fallback priority**:

1. First decide whether `waitForResponse` is necessary (needed when an API call is the definitive timing of a side effect)
2. If the API is not called, a **web-first assertion alone** is enough (`await expect(page.getByTestId('result')).toBeVisible()`)
3. To cap the timeout, pass `{ timeout: 5_000 }`
4. To count arbitrary responses, use `page.on('response', ...)` as a listener (event aggregation rather than waitFor)

### API Mocking

Register `page.route()` **before** `page.goto()`:

```ts
await page.route('**/api/items', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ items: [{ id: 1, name: 'Test' }] }),
}));

// Modify the response
await page.route('**/api/data', async route => {
  const response = await route.fetch();
  const json = await response.json();
  json.debug = true;
  await route.fulfill({ response, json });
});

// Block resources (speed up)
await page.route('**/*.{png,jpg,jpeg}', route => route.abort());
```

### Network Record/Replay via HAR

Record real API responses and replay them verbatim during tests:

```ts
// Record: generate a HAR file during test execution
test('record HAR', async ({ page }) => {
  await page.routeFromHAR('tests/fixtures/api.har', {
    url: '**/api/**',
    update: true,  // true = record mode, false = replay mode
  });
  await page.goto('/');
  // ...interactions save API responses to the HAR
});

// Replay: return responses from the recorded HAR (no network needed)
test('replay from HAR', async ({ page }) => {
  await page.routeFromHAR('tests/fixtures/api.har', {
    url: '**/api/**',
    update: false,  // replay mode
  });
  await page.goto('/');
  await expect(page.getByText('data from API')).toBeVisible();
});
```

Record a HAR from the CLI:

```bash
npx playwright open --save-har=tests/fixtures/api.har https://example.com
```

### Request / Response Assertions

```ts
// Validate the request body
const requestPromise = page.waitForRequest('**/api/submit');
await page.getByRole('button', { name: 'Submit' }).click();
const request = await requestPromise;
expect(request.method()).toBe('POST');
expect(JSON.parse(request.postData()!)).toEqual({ name: 'test' });

// Validate the response body
const responsePromise = page.waitForResponse('**/api/submit');
await page.getByRole('button', { name: 'Submit' }).click();
const response = await responsePromise;
const body = await response.json();
expect(body.id).toBeDefined();
```

### Context-Level Routing

To apply a common mock to every page, use `context.route()`:

```ts
test('context-level mock', async ({ context, page }) => {
  // Applies to every page in the context
  await context.route('**/api/config', route => route.fulfill({
    status: 200,
    json: { featureFlag: true },
  }));
  await page.goto('/');
  const popup = await page.waitForEvent('popup');  // Also applies to new tabs
  await expect(popup.getByText('Feature enabled')).toBeVisible();
});
```

## Drag and Drop

### Simple Case

```ts
await page.locator('#source').dragTo(page.locator('#target'));
```

### DnD Libraries (react-dnd, dnd-kit, SortableJS)

Pointer-event-based libraries often don't work with `dragTo`:

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

- `{ steps: 10 }` generates intermediate `pointermove`/`dragover` events
- Libraries that use `DataTransfer` may require synthesized events via `page.evaluate()`
- Assert the final state (element order/position), not the animation

## Locators

Priority order (higher is preferred):

```ts
page.getByRole('button', { name: 'Submit' });  // 1. Role-based
page.getByLabel('Email');                        // 2. Label
page.getByText('Welcome');                       // 2. Text
page.getByTestId('nav-menu');                    // 3. Test ID
page.locator('button.btn-primary');              // 4. CSS (avoid)
```

Chains and filters:

```ts
const product = page.getByRole('listitem').filter({ hasText: 'Product 2' });
await product.getByRole('button', { name: 'Add to cart' }).click();
```

### Handling Modals / Dialogs

Scope to a modal with `getByRole('dialog')` and query inside it. Check closure with `toBeHidden()`:

```ts
// Open
await page.getByRole('button', { name: 'New Project' }).click();
const dialog = page.getByRole('dialog');
await expect(dialog).toBeVisible();

// Interact within scope
await dialog.getByLabel('Name').fill('My Project');
await dialog.getByRole('button', { name: 'Save' }).click();

// Confirm closure (during fade-out animation, toBeHidden auto-retries)
await expect(dialog).toBeHidden();

// Verify the result outside
await expect(
  page.getByRole('list', { name: 'projects' }).getByRole('listitem').filter({ hasText: 'My Project' })
).toBeVisible();
```

`role="alertdialog"` is for warning dialogs (e.g., delete confirmation) via `getByRole('alertdialog')`.

## Assertions

Web-first assertions auto-retry:

```ts
await expect(page.getByText('Success')).toBeVisible();
await expect(page.getByRole('listitem')).toHaveCount(3);
await expect(page.getByTestId('status')).toHaveText('Done');
await expect(page).toHaveURL(/dashboard/);
await expect(page).toHaveTitle(/Home/);

// Soft assertion (test continues even on failure)
await expect.soft(page.getByTestId('count')).toHaveText('5');
```

## Reusing Authentication

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

Tests that don't need auth: `test.use({ storageState: { cookies: [], origins: [] } })`

## File Operations

```ts
// Upload
await page.getByLabel('Upload').setInputFiles('myfile.pdf');

// From a buffer (no file needed)
await page.getByLabel('Upload').setInputFiles({
  name: 'file.txt', mimeType: 'text/plain', buffer: Buffer.from('content'),
});

// Download
const downloadPromise = page.waitForEvent('download');
await page.getByText('Download').click();
const download = await downloadPromise;
await download.saveAs('/tmp/file.pdf');
```

## Page Object Model

Keep it simple. Put assertions on the test side:

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

## Debugging

```bash
npx playwright test --debug          # Launch Inspector
npx playwright test --ui             # UI mode (time-travel)
npx playwright test --trace on       # Generate trace
npx playwright show-report           # Show report
```

In code: `await page.pause()` opens the Inspector mid-test.
