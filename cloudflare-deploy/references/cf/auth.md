# cf authentication

```bash
pnpm exec cf auth login
pnpm exec cf auth whoami
```

cf stores its own credentials; a Wrangler OAuth login is not reused. On a remote machine use `cf auth login --no-browser` and approve the displayed code in a browser.

For CI, supply `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as environment variables. cf does not support the Global API Key. Tokens need the permissions for the actual operation, including any resource provisioning requested by deploy.

Credential selection prefers `CLOUDFLARE_API_TOKEN`, then `--profile`, a profile activated for the directory, then the default login. Account selection prefers `CLOUDFLARE_ACCOUNT_ID`, then config `accountId`, a cached account, then the available account. In CI, multiple accessible accounts without an explicit choice cause failure.

```bash
pnpm exec cf auth create work
pnpm exec cf auth activate work
pnpm exec cf auth whoami --profile work
```

API commands can read credentials from `.env` in the current directory. They do not automatically read `.env.local`, `.env.cloudflare` or `.env.staging`. For dotenvx, explicitly wrap the command:

```bash
pnpm exec dotenvx run -f .env.cloudflare --quiet -- pnpm exec cf auth whoami
```

These credentials authenticate the CLI; they do not become Worker bindings. Use `bindings.secret()` with `--secrets-file` for Worker secrets.

Source: [Install and sign in](https://developers.cloudflare.com/cf/get-started/).
