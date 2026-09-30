# cf beta gotchas

- **Configuration must exist before project commands.** cf does not import `wrangler.jsonc` automatically. Migrate first; otherwise automatic framework setup can generate a Worker that omits the original entrypoint and bindings.
- **Login is separate.** Use `cf auth login`; CI uses API tokens and an explicit account ID.
- **Modes replace named environment flags.** `--mode staging` evaluates TypeScript configuration. Build and prebuilt deploy must use the same mode.
- **Resource APIs default to remote and often require IDs.** D1's name is not its database ID. Check `--local` support; `--remote` is not a general cf flag.
- **Required secrets are validated.** `bindings.secret()` needs a value from `.dev.vars` locally or `--secrets-file` on deploy. Do not convert non-secret variables to secrets just to bypass an unsupported `--var` flag; use `bindings.text()`/`bindings.json()`.
- **Dev server options belong in Vite config.** In the checked beta, cf dev cannot forward extra arguments to the detected `pnpm vite` command. Set `server.port`/`server.host` in `vite.config.ts` for Playwright, or invoke the framework command directly when custom flags are needed.
- **Generated types moved.** Include `.cloudflare/types`, regenerate with `cf workers types`, and remove obsolete `.wrangler/types` dependencies when their consumers have migrated.
- **CLI flags are not interchangeable.** Inspect the installed command/schema before using `--var`, `--env`, `--yes`, `--json`, `--outdir`, or `--config` from a legacy example.
- **Logs are not deployment history.** The checked beta cannot stream live Worker logs. Use Workers Logs in the dashboard or a configured telemetry backend; a deployment/version list only shows deployment state.
- **Legacy Pages deployment is a stub.** In beta.5, `cf pages deploy --help` exists but its handler exits with an unsupported-operation error. A Workers static-assets project deploys through `cf deploy`. Do not change an existing Pages pipeline to the stub; migrate its framework/functions/assets first or retain its existing publisher while migration is pending.
- **Framework/plugin beta versions matter.** The supplied beta.2 article's `experimental.newConfig: true` and React Router asset-manifest copy workaround are conditional. cf-example's newer plugin uses `cloudflare()` directly. On Windows, older cf releases had a non-Vite spawn issue; prefer the current Vite integration and verify the installed release rather than introducing a Wrangler fallback.
- **Published beta documentation can lag implementations.** beta.5 implements `workers secrets update`; inspect its implementation/behavior before claiming single-secret support or copying obsolete launch limitations. Never infer support from help alone.

Sources: [Wrangler users](https://developers.cloudflare.com/cf/wrangler/), [migration article](https://zenn.dev/sora_kumo/articles/cloudflare-to-cf), [cf-example](https://github.com/mizchi/cf-example).
