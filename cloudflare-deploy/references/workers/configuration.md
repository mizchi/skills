# Workers configuration with cf


Read [typed cf configuration](../cf/configuration.md) for `cloudflare.config.ts`, bindings, modes, Vite and generated types. New projects use `cf` with the Cloudflare Vite plugin. The example checkout is `~/ghq/github.com/mizchi/cf-example`.

```bash
pnpm exec cf workers types
pnpm exec cf dev
pnpm exec cf build --mode production
pnpm exec cf deploy --prebuilt --mode production --dry-run
```

For an existing Wrangler project, run `cf migrate --dry-run` and `cf migrate`, resolve follow-ups and update CI/test consumers before project commands. Preserve existing resource IDs and DO lifecycle history. The [migration pattern](../cf/patterns.md) explains the sequence; the [API guide](../cf/api.md) covers resource commands and secrets.
