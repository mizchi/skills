---
name: utels-project-bootstrap
description: One-shot helper for registering a utels.dev project and writing the returned ingest token straight into a wrangler secret. Use when wiring server-side error tracking for a Cloudflare Worker without leaking tokens through the shell.
---

# utels project bootstrap

Registers one or two utels.dev projects (production + staging) and pipes the returned ingest tokens to `wrangler secret put` via stdin. Tokens never appear on stdout — they transit only through the spawned wrangler child's stdin and are dropped from memory.

## When to invoke

Use when you're:
- Onboarding utels error tracking on a fresh Worker.
- Re-bootstrapping after a token rotation or after deleting a project.
- Setting up a new environment (staging, preview, ephemeral) that needs its own utels project.

## What's in here

### `assets/scripts/setup-utels.ts`

Generic one-shot helper. Accepts the bootstrap token via env (typically decrypted by `dotenvx run -f <utels>/.env --`), targets one or both of production / staging, registers via `POST /api/registration?v=1`, captures the ingest token from the response, spawns `pnpm exec wrangler secret put UTELS_INGEST_TOKEN` with stdin = token.

CLI flags:
- `--only=<env>` (production | staging) — register just one env, useful after a partial failure.
- `--endpoint=<url>` — alternative utels host (default `https://utels.dev`).

Env vars:
- `UTELS_BOOTSTRAP_TOKEN` (required) — the bootstrap token from the utels operator. Usually decrypted via dotenvx.
- `APP_UTELS_PROJECT_PROD` / `APP_UTELS_PROJECT_STAGING` — override default project IDs.
- `DRY_RUN=1` — skip both the POST and the secret put, just print what would happen.

## Two gotchas the script defends against

### 1. `Error: Not found target files` — bash 3.2 NUL truncation

The diff-aware secret-scan pattern (used in pre-push hooks elsewhere) reads NUL-separated paths into a shell variable:

```bash
files=$(git diff --name-only -z "${upstream}..HEAD")
printf '%s' "$files" | xargs -0 some-tool
```

bash 3.2 (default on macOS) **strips NUL bytes** when capturing into a variable. `$files` ends after the first filename and `xargs -0` gets empty input. Pipe the `git diff` output directly without going through a variable.

This isn't specific to utels — it bit secretlint at pre-push too. Same root cause, same fix.

### 2. Project slug collision causes 1101 / 500

utels' registration endpoint uses `INSERT INTO project` without `ON CONFLICT`. If the slug already exists, the SQL throws a unique-constraint violation that escapes the request handler uncaught, surfacing as a Cloudflare `1101 Worker threw exception` HTML response.

**Misleading message**: "Worker threw exception" suggests a runtime crash, but the actual cause is just a name collision.

**Diagnose**: query the utels D1 directly:

```bash
wrangler d1 execute utels-analytics --remote --command \
  "SELECT project_id FROM project WHERE project_id LIKE '<your-slug>%';"
```

If the row exists from a previous attempt, either delete it (loses historical data) or pick a new slug (e.g. `<base>-prod` instead of bare `<base>`).

## Security notes

The script never prints the ingest token. It transits as the spawned wrangler child's stdin only. If `wrangler secret put` fails for any reason (auth, account ID, network), the token is dropped immediately — there's no temp file, no log, no clipboard.

Repo-side secrets you DO commit: only the bootstrap token via dotenvx encryption, and only inside the utels repo itself. The starter kit / mnemo only needs `DOTENV_PRIVATE_KEY_CLOUDFLARE` to decrypt `.env.cloudflare`.

## Source

[`mizchi/mnemo/blob/main/mnemo-server/scripts/setup-utels.mjs`](https://github.com/mizchi/mnemo/blob/main/mnemo-server/scripts/setup-utels.mjs). The version shipped here is the same with mnemo-specific defaults parameterized.

## Related skills

- [`cloudflare-workers-otel-utels`](../cloudflare-workers-otel-utels/SKILL.md) — the `withUtelsErrorTracking` boundary wrapper that uses the ingest token this script provisions.
