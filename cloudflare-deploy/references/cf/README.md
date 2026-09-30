# Cloudflare cf CLI

Use the npm package `cf` through `pnpm exec cf`. New Workers use `cloudflare.config.ts` and the Cloudflare Vite plugin. Reference environment: Node.js 24, `cf@1.0.0-beta.5`, `@cloudflare/vite-plugin@beta`, from [mizchi/cf-example](https://github.com/mizchi/cf-example).

- [auth.md](auth.md): separate cf login, API tokens, account/profile selection.
- [configuration.md](configuration.md): typed bindings, modes, Vite and generated types.
- [api.md](api.md): command discovery, JSON results, resource IDs, D1 and secrets.
- [patterns.md](patterns.md): migration and the build-once deployment pipeline.
- [gotchas.md](gotchas.md): beta limitations and unsupported legacy operations.
- [../ci/github-actions.md](../ci/github-actions.md): pnpm/Node.js 24 CI example.

Primary sources: [launch announcement](https://blog.cloudflare.com/cloudflare-cf-cli-launch/), [CLI documentation](https://developers.cloudflare.com/cf/), [configuration explorer](https://developers.cloudflare.com/cf/projects/config-explorer/), [migration reference](https://developers.cloudflare.com/cf/wrangler/reference/).

The supplied [Zenn migration article](https://zenn.dev/sora_kumo/articles/cloudflare-to-cf) describes beta.2. Verify its workarounds against the installed CLI/plugin before using them: the newer cf-example uses `cloudflare()` without `experimental.newConfig` or a React Router asset-copy workaround.
