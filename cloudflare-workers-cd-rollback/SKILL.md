---
name: cloudflare-workers-cd-rollback
description: GitHub Actions CD for Cloudflare Workers through cf with automatic traffic rollback on smoke failure, including JSON deployment snapshots, D1 migrations and prebuilt artifacts.
---

# Cloudflare Workers CD with auto-rollback

Use the three workflow templates with cf, Node.js 24 and pnpm. cf-example at `~/ghq/github.com/mizchi/cf-example` shows the current Vite/config/typegen integration; this skill adds deployment state capture and rollback.

```text
push main/release → staging/production caller → deploy.yml
  → capture previous traffic versions as JSON
  → cf d1 migrations apply DATABASE_ID --dir db/migrations
  → MoonBit build + FFI preparation
  → cf workers types + cf build --mode <target>
  → bundle check + cf deploy --prebuilt --mode <target> --dry-run
  → cf deploy --prebuilt --mode <target>
  → smoke
  → on failure: cf workers deployments create with the saved traffic array
  → report + fail the workflow when smoke failed
```

## Copy and configure

Copy `assets/workflows/{deploy,cd-staging,cd-production}.yml` to `.github/workflows/` and the helper scripts to `scripts/`. The bundle checker comes from [the MoonBit skill](../cloudflare-mbt-worker-bundle/assets/scripts/check-worker-bundle.ts); copy [deployment-state.ts](assets/scripts/deployment-state.ts) and [smoke.ts](assets/scripts/smoke.ts) from this skill.

The project must have `cloudflare.config.ts` before CI. Migrate an existing Wrangler project with `cf migrate` and resolve its follow-ups locally, then commit the typed config and lockfile. CI must not depend on automatic setup.

Configure:

- DevDependencies: `cf`, `@cloudflare/vite-plugin@beta`, Vite, TypeScript and `@dotenvx/dotenvx`.
- `build:core` package script: `moon build --target js --release && node scripts/prepare-worker.ts`. For a TypeScript-only project remove the MoonBit install/build steps and use cf build directly.
- `smoke` package script: `node scripts/smoke.ts`, with project-specific paths/status expectations.
- GitHub variables `D1_DATABASE_ID_PRODUCTION`, `D1_DATABASE_ID_STAGING`, `WORKERS_SUBDOMAIN`; optional `WORKER_NAME_PRODUCTION` and `WORKER_NAME_STAGING` default to `cf-mbt-app` and `cf-mbt-app-staging`. Match those names and IDs to the corresponding config modes.
- The encrypted `.env.cloudflare` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; GitHub secret `DOTENV_PRIVATE_KEY_CLOUDFLARE` decrypts it. Access smoke credentials can also come from this file.

Adapt D1 steps if the project has no D1 or several databases. cf expects IDs, remote is the default, and `--dir` selects the migration directory. Use compatible schema migrations: Worker rollback does not undo database changes.

Build and prebuilt deploy use the same mode. If enabling `bindings.secret()`, supply mock values for dry-run checks and the appropriate ignored/decrypted `--secrets-file` during publication; CLI credentials alone do not become Worker bindings.

## Rollback contract

cf API output is JSON on stdout; progress/errors are stderr. Deployment listings put the **latest active deployment first**, unlike old Wrangler text ordering. [deployment-state.ts](assets/scripts/deployment-state.ts) validates the response and saves the complete `{version_id, percentage}[]` allocation, including a gradual split. It rejects malformed data instead of choosing an older deployment.

An empty successful list or the specific missing-Worker error 10007 means first deployment: save `[]`, skip rollback and report smoke failure. Authentication, permission, network and parsing failures abort before deploy. Do not treat every failed listing as first deployment.

On smoke failure, restore the saved allocation with `cf workers deployments create --worker <name> --strategy percentage --versions @file`. Do not add `--force` automatically to bypass a rollback blocked by secret changes. First deployments cannot restore an earlier version. Serialize deployments per target mode; avoid other deployment pipelines racing this workflow.

Messages enter shell steps through environment variables. Never interpolate commit bodies or arbitrary dispatch input directly into shell source. The wrappers gate deployment on the dotenvx key and watch `cloudflare.config.ts` and `vite.config.ts`.

## Verification

The [deployment-state tests](assets/scripts/deployment-state.test.ts) cover latest-first selection, gradual traffic, first deployment and malformed/API-error data. Validate YAML and run a dry run before enabling the copied workflow. Sources and limitations: [cd-traps.md](references/cd-traps.md), [cf API guide](../cloudflare-deploy/references/cf/api.md).
