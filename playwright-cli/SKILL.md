---
name: playwright-cli
description: Use when running Playwright via terminal CLI — `npx playwright test` (test runner), `codegen` (interactive recording), `screenshot` / `pdf` (one-off captures), and CI sharding. NOT for agent-driven real-time browser control (use `claude-in-chrome` MCP tools for that).
---

# Playwright CLI

Terminal-based browser automation using `npx playwright`. This skill covers the **CLI surface**: running tests, generating test code via `codegen`, taking screenshots/PDFs, and CI sharding flags.

## Scope boundary

| I want to... | Use |
|---|---|
| Run E2E tests | `npx playwright test` (this skill) |
| Record a browser session → test code | `npx playwright codegen` (this skill) |
| One-off screenshot / PDF from a URL | `npx playwright screenshot` / `pdf` (this skill) |
| Write / review / tune a Playwright test suite | `playwright-test` skill |
| **Agent-driven real-time browser control** (navigate → click → read → assert) | `mcp__claude-in-chrome__*` tools (not this skill) |
| Interactive data scraping / SPA exploration | `claude-in-chrome` MCP tools or a Playwright script executed via `npx playwright test` |

For data scraping / SPA flows where you need to programmatically navigate, click "Load More", extract DOM, and save JSON: write a `tests/*.spec.ts` and run `npx playwright test`. See `playwright-test` skill for the test-authoring patterns.

## Quick Reference

```bash
# Interactive codegen (generates test code from browser actions)
npx playwright codegen https://example.com

# Run all tests
npx playwright test

# Run specific file
npx playwright test tests/login.spec.ts

# Run specific test by title
npx playwright test -g "should login"

# Debug mode (opens Playwright Inspector)
npx playwright test --debug

# UI mode (visual test runner with time-travel)
npx playwright test --ui

# Headed mode (see the browser)
npx playwright test --headed

# Specific browser
npx playwright test --project=chromium

# Generate trace
npx playwright test --trace on

# View report
npx playwright show-report

# Install browsers
npx playwright install
npx playwright install chromium --with-deps  # CI-optimized
```

## Sharding for CI

```bash
npx playwright test --shard=1/3
npx playwright test --shard=2/3
npx playwright test --shard=3/3
```

## Screenshot / PDF

```bash
# Screenshot from CLI
npx playwright screenshot --browser=chromium https://example.com screenshot.png

# PDF (Chromium only)
npx playwright pdf https://example.com page.pdf
```
