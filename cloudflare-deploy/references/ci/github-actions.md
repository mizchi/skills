# GitHub Actions with cf

Commit `cloudflare.config.ts`, the project-local cf dependency and pnpm lockfile before enabling CI. Node.js 24+ is the repository convention. For migration, run cf migrate locally and finish its follow-ups; project commands in CI must not perform automatic setup on an unmigrated Wrangler project.

```yaml
name: Worker
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  worker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec cf workers types --mode production
      - run: pnpm exec tsc --noEmit
      - run: pnpm exec cf build --mode production
      - run: pnpm exec cf deploy --prebuilt --mode production --dry-run
      - if: github.event_name == 'push'
        run: pnpm exec cf deploy --prebuilt --mode production
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Declare `packageManager` in package.json for pnpm/action-setup. This example needs no Worker secrets. If config declares `bindings.secret()`, provide dummy values through an ignored `--secrets-file` for PR validation and real values only in the publication step. Check required keys and non-empty values separately: RC.1 deploy dry-run can succeed with the secret file omitted. Credentials are restricted to the publication step so fork PR checks can still build/typecheck/dry-run.

Build once, validate and deploy the same Build Output with `--prebuilt` and a matching mode. For staging, use `--mode staging` throughout and ensure the config chooses independent names/resources.

RC artifacts live in `.cloudflare/output/v1/`. Update any upload/download or bundle-check paths, rebuild older v0 output and use the same lockfile in build/deploy jobs. `cf deploy --no-provision` fails on missing binding IDs instead of provisioning resources. Do not add `cf deploy --force` by default: it overrides a conflicting remote deployment/configuration. Other destructive API operations also require `--force` in CI; inspect the operation before opting in.

D1 migration commands take a database ID and default to remote:

```bash
pnpm exec cf d1 migrations apply DATABASE_ID --dir db/migrations
```

Apply compatible migrations before deployment. They are not undone by rolling back the Worker. For JSON traffic snapshots, smoke and automatic rollback, use [cloudflare-workers-cd-rollback](../../../cloudflare-workers-cd-rollback/SKILL.md).

For PR Worker previews, use `pnpm exec cf previews deploy --preview-name <name>`; the name otherwise defaults to the CI/Git branch. Its `--dry-run` checks arguments without building or uploading; use the Worker deploy dry run above to validate an artifact. For an existing Pages project, migrate functions/assets to a supported Workers configuration before changing its publisher. `cf deploy ./dist` publishes an assets-only Worker.

Authentication: [cf/auth.md](../cf/auth.md). Source: [cf CI documentation](https://developers.cloudflare.com/cf/ci/).
