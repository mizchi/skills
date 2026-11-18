# Cloudflare cf CLI

Use the npm package `cf` through `pnpm exec cf`. New Workers use `cloudflare.config.ts` and the Cloudflare Vite plugin. Current checked cohort (2026-11-18): Node 24.22.2, `cf@1.0.0-rc.1`, `@cloudflare/vite-plugin@2.0.0-rc.1`, Vite 8.3.8.

The [smoke project](../../assets/smoke/package.json) passed generated Worker types, TypeScript, a v1 build and `cf deploy --prebuilt --mode production --dry-run`, without account access. In `assets/smoke`, run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`, then that prebuilt deploy dry run. The repository shortcut is `just --justfile cloudflare.justfile smoke-cloudflare`.

A local `cf dev --port 18788 --host 127.0.0.1` returned the expected Worker response. Single-secret stdin, Preview and observability commands also passed argument dry runs. Live deployment, live log delivery and product-specific API mutations were not exercised.

## Upgrade from beta to 1.0 RC

The [2026-11-17 announcement](https://developers.cloudflare.com/changelog/post/2026-11-17-release-candidate/) marks `cloudflare.config.ts`, Build Output and project creation/development/build/deploy commands as stable through 1.0. Most generated API commands are stable too; a few uncommon command paths can still change.

- Update the project-local `cf` dependency and lockfile. Vite builds require `@cloudflare/vite-plugin` 2.0.0-rc.0 or later; legacy Wrangler builds require Wrangler 4.163.0 or later. Plugin `latest` remains on version 1 at this check; use a plugin 2 RC explicitly. Recheck package engines; this cf release requires at least Node 24.22.0 on the Node 24 line.
- Build Output moved from `.cloudflare/output/v0/` to `.cloudflare/output/v1/`. Normal `cf deploy` builds at the new location on its first run. Rebuild explicitly before `--prebuilt`, update artifact paths/bundle checks and use matching CLI/build-tool versions across CI jobs.
- Generated API commands use kebab-case. `cf workers secrets bulk` was renamed to `cf workers secrets bulk-edit` without an alias. Use search/schema when an older command fails; see the [release notes](https://github.com/cloudflare/cf/releases/tag/cf%401.0.0-rc.1) for the full rename list.
- Preview names use `--preview-name`, local simulations persist under `.cloudflare/state`, and account choice is no longer saved between runs. Set `accountId` or `CLOUDFLARE_ACCOUNT_ID` explicitly.
- Prompts/progress/status go to stderr; stdout contains command output. Destructive commands without a terminal require `--force`; inspect that command's help before adding it to an authorized operation.

## Reference map

- [auth.md](auth.md): separate cf login, API tokens, account/profile selection.
- [configuration.md](configuration.md): typed bindings, modes, Vite and generated types.
- [api.md](api.md): command discovery, JSON results, resource IDs, D1 and secrets.
- [patterns.md](patterns.md): migration and the build-once deployment pipeline.
- [gotchas.md](gotchas.md): upgrade pitfalls, dev argument forwarding and legacy operations.
- [../ci/github-actions.md](../ci/github-actions.md): pnpm/Node.js 24 CI example.

Primary sources: [release candidate announcement](https://developers.cloudflare.com/changelog/post/2026-11-17-release-candidate/), [CLI documentation](https://developers.cloudflare.com/cf/), [configuration explorer](https://developers.cloudflare.com/cf/projects/config-explorer/), [migration reference](https://developers.cloudflare.com/cf/wrangler/reference/).

The supplied [Zenn migration article](https://zenn.dev/sora_kumo/articles/cloudflare-to-cf) describes beta.2. Verify its workarounds against the installed CLI/plugin before using them: the newer cf-example uses `cloudflare()` without `experimental.newConfig` or a React Router asset-copy workaround.
