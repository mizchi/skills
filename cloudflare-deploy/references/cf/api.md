# cf command discovery and API operations

Start with a task description, then inspect the returned command and its schema. Search queries contain only the operation and resource type; do not include IDs, domains, names or credentials.

```bash
pnpm exec cf cli search "create a D1 database"
pnpm exec cf schema d1 create
pnpm exec cf d1 create --help
```

API operations return JSON on stdout; progress goes to stderr. No `--json` flag is needed. Keep stderr separate when parsing the result. Project commands such as `cf deploy` have human-readable progress; use API commands for deployment state instead of scraping those logs.

Every RC command accepts `--dry-run`; for generated API commands it previews the request with sensitive fields redacted. `--body` input is validated before authentication/confirmation, and oversized arrays fail rather than being split into requests. These argument/request previews do not validate remote permissions or behavior. `cf deploy --dry-run` additionally builds and validates the artifact.

For documentation, use `pnpm exec cf docs search "configure Worker secrets"`. Keep both CLI and docs search queries anonymous. Generated API names use kebab-case; for example `accounts billing get-credits`. RC renamed `workers secrets bulk` to `workers secrets bulk-edit` without an alias; recheck scripts and schema when upgrading.

```bash
pnpm exec cf d1 list --per-page 2
pnpm exec cf workers scripts search --per-page 2
pnpm exec cf kv namespaces create --title CACHE
pnpm exec cf d1 query DATABASE_ID --sql "SELECT 1"
pnpm exec cf d1 migrations apply DATABASE_ID --dir db/migrations
pnpm exec cf d1 migrations apply DATABASE_ID --dir db/migrations --local
```

D1 commands take the database ID, not the name in old Wrangler examples. Resource operations default to remote. `--local` is available only on supported D1/KV/R2 operations; do not add `--remote` to cf commands. Migrations use CLI `--dir`, not a copied binding `migrations_dir` option.

## Versions and deployments

```bash
pnpm exec cf workers deployments list --worker my-worker > deployments.json
pnpm exec cf workers versions create --prebuilt --mode production --message "candidate"
pnpm exec cf workers deployments create --worker my-worker \
  --strategy percentage --versions @previous-versions.json
```

The latest active deployment is first. `--versions` accepts a JSON array of `{ "version_id": "UUID", "percentage": 100 }` objects. Preserve all versions in a gradual deployment when recording rollback state; see the [CD skill](../../../cloudflare-workers-cd-rollback/SKILL.md). Worker rollback does not undo D1/R2/KV state.

## Worker secrets

Prefer deploying secret values with their version:

```bash
pnpm exec cf deploy --secrets-file .env.production
```

RC also implements the API-backed single-secret operation:

```bash
pnpm exec cf workers secrets update API_KEY --worker my-worker --type secret_text
```

With an interactive terminal, omitting `--text` prompts for the secret without placing it in argv. In a macOS/Linux helper, pass a JSON body through stdin using `--body @/dev/stdin` as in the [utels helper](../../../utels-project-bootstrap/assets/scripts/setup-utels.ts). The body includes `name`, `type: "secret_text"`, and `text`. This input passed an RC argument dry run; actual secret writes were mocked. Never use `--text "$TOKEN"` in a helper that promises to keep secrets out of argv. Do not substitute `@-` without checking stdin support.

Redeploying a Worker preserves secrets added outside `cloudflare.config.ts`. Keep required secrets declared with `bindings.secret()` and supply their deployment values with `--secrets-file`.

## Live observability

```bash
pnpm exec cf observability tail --worker my-worker
pnpm exec cf observability tail --worker my-worker --filters @filters.json
```

Enable Workers Logs for Worker events. Output is newline-delimited JSON. Choose `--worker`, `--zone` (including subdomains), or `--all` for the account; `--filters` accepts inline JSON or `@file`, alone or with `--worker`/`--zone`. Run `cf observability tail --help` for filter shapes. Long-running commands refresh expired OAuth credentials. This is a live stream; use deployment APIs for rollback state.

For other products, discover their cf command rather than preserving Wrangler subcommands and flags. See [gotchas](gotchas.md) for legacy Pages migration.

Sources: [RC announcement](https://developers.cloudflare.com/changelog/post/2026-11-17-release-candidate/), [command mapping](https://developers.cloudflare.com/cf/wrangler/reference/), [Workers deployment API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/).
