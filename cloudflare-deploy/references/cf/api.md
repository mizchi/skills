# cf command discovery and API operations

Start with a task description, then inspect the returned command and its schema. Search queries contain only the operation and resource type; do not include IDs, domains, names or credentials.

```bash
pnpm exec cf cli search "create a D1 database"
pnpm exec cf schema d1 create
pnpm exec cf d1 create --help
```

API operations return JSON on stdout; progress goes to stderr. No `--json` flag is needed. Keep stderr separate when parsing the result. Project commands such as `cf deploy` have human-readable progress; use API commands for deployment state instead of scraping those logs.

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

The checked beta.5 also implements the API-backed single-secret operation:

```bash
pnpm exec cf workers secrets update API_KEY --worker my-worker --type secret_text
```

With an interactive terminal, omitting `--text` prompts for the secret without placing it in argv. In a macOS/Linux helper, pass a JSON body through stdin using `--body @/dev/stdin` as in the [utels helper](../../../utels-project-bootstrap/assets/scripts/setup-utels.ts). The body includes `name`, `type: "secret_text"`, and `text`. Never use `--text "$TOKEN"` in a helper that promises to keep secrets out of argv. `@-` is not a stdin alias in this version.

Some launch documentation says single-secret updates are unsupported. Verify the installed implementation as well as search/help; beta capabilities can differ. Do not confuse this API operation with an invented `cf secret put` command.

For other products, discover their cf command rather than preserving Wrangler subcommands and flags. Help can expose an unsupported stub: [gotchas](gotchas.md) explains legacy Pages.

Sources: [command mapping](https://developers.cloudflare.com/cf/wrangler/reference/), [Workers deployment API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/).
