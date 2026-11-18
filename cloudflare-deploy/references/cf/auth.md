# cf authentication

```bash
pnpm exec cf auth login
pnpm exec cf auth whoami
```

cf stores its own credentials; a Wrangler OAuth login is not reused. On a remote machine use `cf auth login --no-browser` and approve the displayed code in a browser.

For CI, supply `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as environment variables. cf does not support the Global API Key. Tokens need the permissions for the actual operation, including any resource provisioning requested by deploy.

Credential selection prefers `CLOUDFLARE_API_TOKEN`, then `--profile`, a profile activated for the directory, then the default login. Account selection prefers `CLOUDFLARE_ACCOUNT_ID`, then config `accountId`, then the available account. RC no longer saves account choices between runs. In CI, multiple accessible accounts without an explicit choice cause failure.

```bash
pnpm exec cf auth create work
pnpm exec cf auth activate work
pnpm exec cf auth whoami --profile work
```

RC loads CLI credentials from `.env` and `.env.local`, plus `.env.<mode>` and `.env.<mode>.local` when a mode is selected; process environment values take priority. A custom filename such as `.env.cloudflare` needs an explicit loader. For a project that already uses dotenvx, explicitly wrap the command:

```bash
pnpm exec dotenvx run -f .env.cloudflare --quiet -- pnpm exec cf auth whoami
```

These credentials authenticate the CLI; they do not become Worker bindings. Use `bindings.secret()` with `--secrets-file` for Worker secrets.

`cf auth login` uses the system keyring where available. `cf auth scopes` lists scopes by product. `cf auth whoami` (also `cf whoami`) emits a short terminal summary or full JSON for scripts/agents. To create a short-lived account without signing in, opt into `--temporary-account` and use the printed claim URL; CI should keep an explicit account and API token.

Sources: [RC announcement](https://developers.cloudflare.com/changelog/post/2026-11-17-release-candidate/), [Install and sign in](https://developers.cloudflare.com/cf/get-started/), [CI](https://developers.cloudflare.com/cf/ci/).
