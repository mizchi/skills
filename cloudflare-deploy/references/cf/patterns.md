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

Build Output lives in `.cloudflare/output/v1/`. The root `config.json` records the build context; each Worker has `worker.config.json`, `bundle/` and optional assets. Inspect the manifest for the emitted main module; do not assume Wrangler's `--outdir` or a custom `dist/worker.mjs`. Rebuild beta artifacts and update CI upload/download paths before using RC `--prebuilt`; do not rename a v0 directory to v1.

`--prebuilt` deploys that artifact without rebuilding or automatic setup. Keep build/deploy modes identical. `cf deploy --dry-run` validates locally without publishing or requiring credentials. Supply dummy Worker secret values for PR checks, but validate required keys separately: RC.1 dry-run can succeed when the secret file is omitted. Use real values only at the authorized deploy; see [secret preflight](configuration.md#secrets-and-remote-development).

Use `cf deploy --no-provision` when missing binding resource IDs should fail instead of creating resources. Provisioned IDs are not written back to the config. `cf deploy --force` overrides conflicts with a remote/API deployment or remote configuration; review the difference before opting in. Redeploying preserves secrets added outside `cloudflare.config.ts`. Set `CLOUDFLARE_DEPENDENCIES_INSTRUMENTATION=false` when dependency metadata should not be uploaded.

## Static assets and previews

```bash
pnpm exec cf deploy ./dist
pnpm exec cf previews deploy --preview-name feature-check
```

A directory argument skips the build and deploys an assets-only Worker. It cannot be combined with a configured Worker entrypoint, Containers, `--prebuilt` or `--worker`; use the normal pipeline for server-side code. Preview names default to the CI/Git branch; pass `--preview-name` on detached checkouts. `cf previews deploy --dry-run` checks arguments only: it does not build or validate an artifact as `cf deploy --dry-run` does.

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
