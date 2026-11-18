# cf release candidate gotchas

- **Migrate before project commands.** RC commands offer `cf migrate` when they find Wrangler config, but automatic framework setup does not import its entrypoint/bindings. Run migration locally, review its follow-ups and commit `cloudflare.config.ts` before CI. Without a config, `cf deploy --dry-run` now previews setup changes without applying them; an ordinary build/deploy can still configure the project.
- **Login is separate.** Use `cf auth login`; CI uses API tokens and an explicit account ID.
- **Modes replace named environment flags.** `--mode staging` evaluates TypeScript configuration. Build and prebuilt deploy must use the same mode.
- **Resource APIs default to remote and often require IDs.** D1's name is not its database ID. Check `--local` support; `--remote` is not a general cf flag.
- **Dry-run does not prove secret completeness.** RC.1 can succeed with no secret file despite a `bindings.secret()` declaration. Check required keys and non-empty values in the selected secret source separately, without printing values. Use `.dev.vars` locally and `--secrets-file` for deployment. Keep non-secret variables as `bindings.text()`/`bindings.json()`.
- **RC forwards dev server options.** `cf dev --port 8788` and `cf dev -- --host 0.0.0.0` pass arguments to the framework server. Use options that server accepts; `cf build` accepts only `--mode`.
- **Generated types moved.** Include `.cloudflare/types`, regenerate with `cf workers types`, and remove obsolete `.wrangler/types` dependencies when their consumers have migrated.
- **CLI flags are not interchangeable.** Inspect the installed command/schema before using `--var`, `--env`, `--yes`, `--json`, `--outdir`, or `--config` from a legacy example.
- **Rebuild beta artifacts.** RC reads `.cloudflare/output/v1/`; update bundle checks and CI artifact paths, then build before `--prebuilt`. Vite requires plugin 2.0.0-rc.0 or later; legacy Wrangler builds require 4.163.0 or later.
- **Logs are not deployment history.** `cf observability tail --worker <name>` streams newline-delimited JSON when Workers Logs is enabled. A deployment/version list only describes traffic/version state. Inspect `--help` for zone/account selectors and filter shapes.
- **Static directory deploy targets Workers.** `cf deploy ./dist` skips the build for an assets-only Worker. It does not migrate Pages Functions or publish to an existing Pages project. Keep an existing Pages publisher until its migration is verified.
- **Framework/plugin versions matter.** Select a plugin 2 RC explicitly; plugin `latest` remains on version 1 at this check. The beta.2 article's `experimental.newConfig: true` and React Router asset-copy workaround are historical, conditional workarounds. Use `cloudflare()` and verify the installed framework integration before carrying them forward.
- **Account choice is not persisted.** Set `accountId` or `CLOUDFLARE_ACCOUNT_ID`; unattended commands must not rely on a previously selected account.
- **Non-interactive destructive commands require `--force`.** Check the specific operation before adding it. For `cf deploy`, the flag overrides remote configuration/deployment conflicts; do not enable that override by default in CD.
- **Generated API paths can change.** RC renamed commands without aliases, including `workers secrets bulk` to `workers secrets bulk-edit`. Discover the replacement through search/schema; [the upgrade guide](README.md) links the full list.

Sources: [RC announcement](https://developers.cloudflare.com/changelog/post/2026-11-17-release-candidate/), [Wrangler users](https://developers.cloudflare.com/cf/wrangler/), [migration article](https://zenn.dev/sora_kumo/articles/cloudflare-to-cf).
