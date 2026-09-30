---
name: utels-project-bootstrap
description: Register utels.dev projects and deliver returned ingest tokens to Cloudflare Worker secrets through cf without exposing tokens in command arguments or logs.
---

# utels project bootstrap

Register production/staging utels.dev projects and send each returned ingest token to `pnpm exec cf workers secrets update UTELS_INGEST_TOKEN --worker <name> --body @/dev/stdin`. The JSON body travels through stdin on macOS/Linux; the token is not placed in argv, a temporary file or command logs.

## Helper

Copy [setup-utels.ts](assets/scripts/setup-utels.ts) to the Worker's `scripts/` directory. Use Node.js 24+ with a project-local cf dependency. The checked implementation targets cf beta.5; verify `cf schema workers secrets update` and the installed implementation when upgrading.

Inputs:

| Input | Purpose |
| --- | --- |
| `UTELS_BOOTSTRAP_TOKEN` | Required registration credential, normally decrypted by dotenvx |
| `APP_WORKER_PROD` / `APP_WORKER_STAGING` | Required Worker names for each selected target; cf resource commands do not use old `--env` selection |
| `APP_SERVER_DIR` | Worker project directory; defaults to the parent of the copied script directory |
| `APP_UTELS_PROJECT_PROD` / `APP_UTELS_PROJECT_STAGING` | Project slugs; replace the example defaults |
| `UTELS_ENDPOINT` / `--endpoint=<url>` | Registration host, default `https://utels.dev` |
| `--only=production` / `--only=staging` | Register just one environment, including retries after a partial failure |
| `DRY_RUN=1` | Skip registration and secret writes |

Customize display names and origin URLs in `targets` before use. utels validates origins even for server-side projects. Provide cf authentication with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, including through an explicitly selected dotenvx file.

The helper uses `--body @/dev/stdin`, not `--text "$TOKEN"` or `@-`. It ignores child output because API errors can contain request bodies; on failure it reports cf's exit status. Inspect authentication separately with `cf auth whoami`. A registered slug can remain after a failed secret write; registration is not guaranteed idempotent and the helper does not delete projects automatically.

## Registration collision

A previously registered slug can trigger a D1 unique-constraint error, exposed as HTTP 500 / Worker 1101. Query the utels database by **ID** before retrying:

```bash
pnpm exec cf d1 query DATABASE_ID --sql "SELECT project_id FROM project WHERE project_id LIKE '<your-slug>%';"
```

Choose another slug or recover the existing token through the operator's supported procedure. Destructive deletion is not part of bootstrap.

## Validation and related guidance

The [integration test](assets/scripts/setup-utels.test.ts) mocks utels registration and the pnpm child to verify Worker selection, stdin JSON, failed writes and token-free output without remote mutations.

- [Cloudflare telemetry](../cloudflare-workers-otel-utels/SKILL.md): configure the returned ingest token as a Worker binding.
- [cf API guide](../cloudflare-deploy/references/cf/api.md): secrets and command discovery.
- [Original helper](https://github.com/mizchi/mnemo/blob/main/mnemo-server/scripts/setup-utels.mjs): registration protocol source; this version adapts secret delivery to cf.
