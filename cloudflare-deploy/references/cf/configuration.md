# cloudflare.config.ts

Use TypeScript builders from `cf/config`. The full minimal project is in [mizchi/cf-example](https://github.com/mizchi/cf-example); inspect `~/ghq/github.com/mizchi/cf-example` when that checkout is available.

```ts
import { bindings, defineConfig, exports, triggers } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig(({ mode }) => {
  const staging = mode === "staging";
  const name = staging ? "my-worker-staging" : "my-worker";
  return {
    worker: {
      name,
      entrypoint,
      compatibilityDate: "2026-09-30",
      compatibilityFlags: ["nodejs_compat"],
      observability: { enabled: true },
      exports: { Counter: exports.durableObject({ storage: "sqlite" }) },
      triggers: staging ? [] : [triggers.scheduled({ schedule: "0 */6 * * *" })],
      env: {
        DEPLOY_ENV: bindings.text(staging ? "staging" : "production"),
        SETTINGS: bindings.json({ featureEnabled: true }),
        CACHE: bindings.kv({ id: staging ? "STAGING_KV_ID" : "PRODUCTION_KV_ID" }),
        DB: bindings.d1({ id: staging ? "STAGING_D1_ID" : "PRODUCTION_D1_ID" }),
        ASSETS: bindings.r2({ name: staging ? "assets-staging" : "assets" }),
        COUNTER: bindings.durableObject({ worker: name, exportName: "Counter" }),
        API_KEY: bindings.secret(),
      },
    },
  };
});
```

Replace IDs before use; the Worker must export `Counter` and a scheduled handler if these features are enabled. Declare Durable Object lifecycle/storage with `exports`, not a copied Wrangler migration array. On an existing project, follow cf migrate's instructions for prior DO migrations, renames, deletions and transfers before deployment.

Modes evaluate the config function; they are not inherited `env` blocks. Pass `--mode staging` to typegen, dev, build and deploy when targeting staging. Ensure each mode resolves its own Worker name and storage resources. Vite build defaults to production; an explicit build mode must match the subsequent prebuilt deployment.

## Vite and type generation

```ts
// vite.config.ts
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";
export default defineConfig({ plugins: [cloudflare()] });
```

```bash
pnpm add -D cf @cloudflare/vite-plugin@beta vite typescript
pnpm exec cf workers types
pnpm exec cf dev
pnpm exec cf build
pnpm exec cf deploy --prebuilt --mode production --dry-run
```

`cf dev` delegates to Vite/framework development without requiring a production build. Generated bindings/runtime types are in `.cloudflare/types/index.d.ts`. Include them in TypeScript:

```json
{
  "compilerOptions": {
    "target": "es2024",
    "module": "preserve",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true
  },
  "include": ["src", "cloudflare.config.ts", ".cloudflare/types"]
}
```

Use `ExportedHandler<Env>` for the handler contract or `env` from `cloudflare:workers`. Keep `.cloudflare/` ignored; regenerate it with typegen/build in CI.

## Secrets and remote development

`bindings.text()` is for non-secret strings; `bindings.json()` preserves structured values. `bindings.secret()` declares a required secret. Provide local values in `.dev.vars`, deployment values in an ignored JSON or dotenv file passed with `--secrets-file`. Process environment variables do not automatically satisfy secret bindings.

Remote resource development is configured on supported bindings, for example `bindings.r2({ name: "assets-staging", dev: { remote: true } })`. Check the installed builder types for each product; do not append an old `dev --remote` flag or route development to production resources by accident.

Static asset sources are managed by the Vite/framework integration, which writes Build Output. `worker.assets` describes handling behavior, such as `runWorkerFirst` or `notFoundHandling`; it is not Wrangler's `assets.directory` field.

Sources: [typed configuration](https://developers.cloudflare.com/cf/projects/cloudflare-config/), [configuration explorer](https://developers.cloudflare.com/cf/projects/config-explorer/).
