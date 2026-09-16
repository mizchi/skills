---
name: cloudflare-access-app-setup
description: One-shot Cloudflare Access self-hosted application provisioning via the API — app + email allowlist policy + service token. Use when you want to gate a Worker behind Access without a full Pulumi stack.
---

# Cloudflare Access app setup (API-driven)

Creates a self-hosted Cloudflare Access application, an email-allowlist policy, and a service token for headless CLI / CI access. Idempotent: re-running updates the existing app rather than creating duplicates.

Pulumi is the recommended long-term option (declarative + drift detection), but a script is the right answer for:
- One-shot setup when you don't want Pulumi state for a single app.
- CI that needs to spin up an ephemeral Access app per PR for testing.
- Replacing the service token (rotating credentials) without re-importing the rest of the stack.

## When to invoke

Use when you're:
- Setting up Access for a brand-new Cloudflare Worker without an existing Pulumi stack.
- Adding a service token to an existing Access app for CI smoke runs.
- Rotating service token credentials without touching the rest of infra.

## What's in here

### `assets/scripts/setup-access-app.ts`

Generic script. Reads config via env vars / CLI args, calls the Cloudflare API at `https://api.cloudflare.com/client/v4/accounts/<id>/access/apps`. Outputs the app's AUD (paste into `wrangler.jsonc.vars.APP_ACCESS_AUD` or equivalent) and, if `--create-service-token`, the token client_id + client_secret (paste into `.env.cloudflare`).

Inputs (env or CLI):

| Var | Required | Default |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | yes | — |
| `CLOUDFLARE_ACCOUNT_ID` | yes | — |
| `--name` | yes | — |
| `--domain` | yes | — |
| `--allow-emails` | one of allow-emails / service-token | — |
| `--create-service-token` | optional | false |
| `--session-duration` | optional | 24h |
| `--api-base` | optional | https://api.cloudflare.com/client/v4 |

## When NOT to invoke

- You already use Pulumi for infra. Use the Pulumi `ZeroTrustAccessApplication` resource — drift detection is worth the extra state file.
- You need a complex policy graph (multi-tenant, group membership, time-based access). The script is intentionally narrow: one email-allowlist + one optional service token.

## Source

The mnemo version (with hard-coded mnemo domain defaults) is at [`mizchi/mnemo/blob/main/mnemo-server/scripts/setup-access-app.mjs`](https://github.com/mizchi/mnemo/blob/main/mnemo-server/scripts/setup-access-app.mjs). The version shipped here is the same script with the domain defaults parameterized.
