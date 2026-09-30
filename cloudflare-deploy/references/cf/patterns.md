# Migration and deployment patterns

## Existing Wrangler project

```bash
pnpm add -D cf
pnpm exec cf migrate --dry-run
pnpm exec cf migrate
```

Migration writes `cloudflare.config.ts` and reports manual follow-ups. Review changes to the config, dependencies, scripts and lockfile. Resolve preview resource fields, secrets, DO lifecycle, Workflows and Containers as required for that project. Convert named environments to mode-aware configuration.

Before removing old configuration, find its consumers in package scripts, GitHub Actions, Playwright, typegen, Miniflare/Vitest and preflight validators. Convert those consumers too. Preserve a legacy file only while an existing integration needs it; it is not the source for new cf workflows.

Use the existing framework's compatible Vite integration. Do not add beta.2's `experimental.newConfig` or React Router BOS copy workaround to every project. Verify the installed plugin, build output and framework requirements first.

## Build once and validate the artifact

For MoonBit, run `moon build` and the required FFI rewrites before cf's Vite build. Use a project build recipe that performs preparation before `cf build`.

```bash
pnpm exec cf workers types --mode staging
pnpm exec cf build --mode staging
pnpm exec cf deploy --prebuilt --mode staging --dry-run
pnpm exec cf deploy --prebuilt --mode staging
```

Build Output lives in `.cloudflare/output/v0/`. The root `config.json` records the build context; each Worker has `worker.config.json`, `bundle/` and optional assets. Inspect the manifest for the emitted main module; do not assume Wrangler's `--outdir` or a custom `dist/worker.mjs`.

`--prebuilt` deploys that artifact without rebuilding or automatic setup. Keep build/deploy modes identical. `cf deploy --dry-run` validates locally without publishing or requiring credentials. Secrets declared as required still need values during validation; use dummy values for secret-free PR checks and real values only at the authorized deploy.

## Local validation

```bash
pnpm exec cf workers types
pnpm exec tsc --noEmit
pnpm exec cf dev
pnpm exec playwright test
pnpm exec cf deploy --dry-run
```

Use the Vite URL printed by the server in Playwright. cf-example serves both frontend and Worker API from `http://localhost:5173`; do not assume the old 8787 port. Test the observable API and frontend behavior as well as compilation.

Sources: [migration](https://developers.cloudflare.com/cf/wrangler/migrate/), [Build Output](https://developers.cloudflare.com/cf/projects/build-output/), [cf-example](https://github.com/mizchi/cf-example).
